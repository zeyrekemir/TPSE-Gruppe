from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import notify
from ..auth import DB, CurrentUser
from ..config import get_settings
from ..models import MemberType, Reservation, RobotStatus, Role, User, utcnow
from ..schemas import ConflictDetail, ReservationCreate, ReservationOut, ReservationUpdate
from .robots import get_robot_or_404

router = APIRouter(prefix="/reservations", tags=["reservations"])

BLOCKED_STATUSES = {RobotStatus.defect, RobotStatus.retired}


def find_conflicts(
    db: Session, robot_id: int, start: datetime, end: datetime, exclude_id: int | None = None
) -> list[Reservation]:
    query = select(Reservation).where(
        Reservation.robot_id == robot_id, Reservation.start < end, Reservation.end > start
    )
    if exclude_id is not None:
        query = query.where(Reservation.id != exclude_id)
    return list(db.scalars(query.order_by(Reservation.start)))


def next_free_slot(
    db: Session, robot_id: int, start: datetime, end: datetime, exclude_id: int | None = None
) -> tuple[datetime, datetime]:
    """Earliest slot of the same length that starts at or after `start` and overlaps nothing."""
    duration = end - start
    query = select(Reservation).where(Reservation.robot_id == robot_id, Reservation.end > start)
    if exclude_id is not None:
        query = query.where(Reservation.id != exclude_id)
    candidate = start
    for r in db.scalars(query.order_by(Reservation.start)):
        if r.start >= candidate + duration:
            break
        candidate = max(candidate, r.end)
    return candidate, candidate + duration


def rank(user: User) -> int:
    """Who may override whose booking: admins over staff, staff over students."""
    if user.role == Role.admin:
        return 2
    return 1 if user.member_type == MemberType.staff else 0


def can_override(user: User, conflicts: list[Reservation]) -> bool:
    return bool(conflicts) and all(rank(c.user) < rank(user) for c in conflicts)


def conflict_response(
    db: Session, robot_id: int, start: datetime, end: datetime, conflicts, user: User, exclude_id=None
):
    s, e = next_free_slot(db, robot_id, start, end, exclude_id)
    detail = ConflictDetail(
        message="The robot is already reserved in this time range",
        conflicts=[ReservationOut.model_validate(c) for c in conflicts],
        suggested_start=s,
        suggested_end=e,
        can_override=can_override(user, conflicts),
    )
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"detail": detail.model_dump(mode="json")})


def check_booking_rules(user: User, start: datetime, end: datetime) -> None:
    """Lab rules for members (ROBOTS_MAX_RESERVATION_HOURS, ROBOTS_MAX_ADVANCE_DAYS); admins may override."""
    if user.role == Role.admin:
        return
    settings = get_settings()
    if settings.max_reservation_hours and (end - start) > timedelta(hours=settings.max_reservation_hours):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"A reservation may last at most {settings.max_reservation_hours:g} hours"
        )
    if settings.max_advance_days and start > utcnow() + timedelta(days=settings.max_advance_days):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Reservations can be made at most {settings.max_advance_days} days ahead"
        )


def resolve_conflicts(
    db: Session, user: User, conflicts: list[Reservation], override: bool, background: BackgroundTasks
) -> bool:
    """Clears the way when `override` is asked for and allowed: the bookings in the way are cancelled and their
    owners told by e-mail. Returns False when the conflicts stand (the caller answers 409)."""
    if not conflicts:
        return True
    if not (override and can_override(user, conflicts)):
        return False
    for c in conflicts:
        background.add_task(notify.send, notify.reservation_overridden(c, user))
        db.delete(c)
    return True


def _get_owned(db: Session, reservation_id: int, user: User) -> Reservation:
    reservation = db.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reservation not found")
    if reservation.user_id != user.id and user.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only change your own reservations")
    return reservation


@router.get("", response_model=list[ReservationOut])
def list_reservations(
    _: CurrentUser,
    db: DB,
    robot_id: int | None = None,
    user_id: int | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
):
    """Filter by robot/user; `start`/`end` return everything overlapping that window (for calendars)."""
    query = select(Reservation)
    if robot_id is not None:
        query = query.where(Reservation.robot_id == robot_id)
    if user_id is not None:
        query = query.where(Reservation.user_id == user_id)
    if start is not None:
        query = query.where(Reservation.end > start)
    if end is not None:
        query = query.where(Reservation.start < end)
    return db.scalars(query.order_by(Reservation.start)).all()


@router.post(
    "",
    response_model=ReservationOut,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": ConflictDetail}},
)
def create_reservation(data: ReservationCreate, user: CurrentUser, db: DB, background: BackgroundTasks):
    robot = get_robot_or_404(db, data.robot_id, lock=True)
    if robot.status in BLOCKED_STATUSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Robot is {robot.status.value} and cannot be reserved")
    if data.end <= utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reservation lies in the past")
    check_booking_rules(user, data.start, data.end)
    conflicts = find_conflicts(db, robot.id, data.start, data.end)
    if not resolve_conflicts(db, user, conflicts, data.override, background):
        return conflict_response(db, robot.id, data.start, data.end, conflicts, user)
    reservation = Reservation(**data.model_dump(exclude={"override"}), user_id=user.id)
    db.add(reservation)
    db.commit()
    return reservation


@router.patch("/{reservation_id}", response_model=ReservationOut, responses={409: {"model": ConflictDetail}})
def update_reservation(
    reservation_id: int, data: ReservationUpdate, user: CurrentUser, db: DB, background: BackgroundTasks
):
    reservation = _get_owned(db, reservation_id, user)
    get_robot_or_404(db, reservation.robot_id, lock=True)
    changes = data.model_dump(exclude_unset=True, exclude={"override"})
    start = changes.get("start", reservation.start)
    end = changes.get("end", reservation.end)
    if end <= start:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "end must be after start")
    check_booking_rules(user, start, end)
    conflicts = find_conflicts(db, reservation.robot_id, start, end, exclude_id=reservation.id)
    if not resolve_conflicts(db, user, conflicts, data.override, background):
        return conflict_response(db, reservation.robot_id, start, end, conflicts, user, exclude_id=reservation.id)
    for key, value in changes.items():
        setattr(reservation, key, value)
    db.commit()
    return reservation


@router.delete("/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reservation(reservation_id: int, user: CurrentUser, db: DB):
    db.delete(_get_owned(db, reservation_id, user))
    db.commit()
