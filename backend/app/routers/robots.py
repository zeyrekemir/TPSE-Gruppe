from datetime import timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import DB, AdminUser, CurrentUser
from ..config import get_settings
from ..models import Reservation, Robot, RobotStatus, Role, Ticket, TicketStatus, User, utcnow
from ..schemas import LiveStatus, RobotCreate, RobotOut, RobotUpdate

router = APIRouter(prefix="/robots", tags=["robots"])


def get_robot_or_404(db: Session, robot_id: int, lock: bool = False) -> Robot:
    """`lock` takes a row lock until commit (Postgres), so concurrent bookings are checked one at a time."""
    robot = db.get(Robot, robot_id, with_for_update=lock)
    if robot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Robot not found")
    return robot


def to_out(db: Session, robots: list[Robot]) -> list[RobotOut]:
    """Attach the derived fields (current reservation, open tickets) with two batch queries."""
    ids = [r.id for r in robots]
    now = utcnow()
    current = dict(
        db.execute(
            select(Reservation.robot_id, Reservation.id).where(
                Reservation.robot_id.in_(ids), Reservation.start <= now, Reservation.end > now
            )
        ).all()
    )
    open_tickets = dict(
        db.execute(
            select(Ticket.robot_id, func.count())
            .where(Ticket.robot_id.in_(ids), Ticket.status != TicketStatus.resolved)
            .group_by(Ticket.robot_id)
        ).all()
    )
    online_since = now - timedelta(seconds=get_settings().live_timeout_seconds)
    result = []
    for robot in robots:
        reservation_id = current.get(robot.id)
        availability = robot.status.value
        if robot.status == RobotStatus.available and reservation_id is not None:
            availability = "reserved"
        attrs = {f: getattr(robot, f) for f in RobotOut.model_fields if hasattr(robot, f)}
        result.append(
            RobotOut.model_validate(
                attrs
                | {
                    "responsible_user": robot.responsible_user,
                    "availability": availability,
                    "current_reservation_id": reservation_id,
                    "open_tickets": open_tickets.get(robot.id, 0),
                    "has_api_key": robot.api_key_hash is not None,
                    "live": None
                    if robot.api_key_hash is None
                    else LiveStatus(
                        online=robot.last_seen_at is not None and robot.last_seen_at >= online_since,
                        state=robot.live_state,
                        message=robot.live_message,
                        battery=robot.battery,
                        last_seen_at=robot.last_seen_at,
                    ),
                }
            )
        )
    return result


def _validate(db: Session, data: dict):
    if data.get("responsible_user_id") is not None and db.get(User, data["responsible_user_id"]) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Responsible user does not exist")
    if data.get("documentation_url") is not None:
        data["documentation_url"] = str(data["documentation_url"])


@router.get("", response_model=list[RobotOut])
def list_robots(_: CurrentUser, db: DB):
    return to_out(db, db.scalars(select(Robot).order_by(Robot.name)).all())


@router.get("/{robot_id}", response_model=RobotOut)
def get_robot(robot_id: int, _: CurrentUser, db: DB):
    return to_out(db, [get_robot_or_404(db, robot_id)])[0]


@router.post("", response_model=RobotOut, status_code=status.HTTP_201_CREATED)
def create_robot(data: RobotCreate, _: AdminUser, db: DB):
    values = data.model_dump()
    _validate(db, values)
    robot = Robot(**values)
    db.add(robot)
    try:
        db.commit()
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "A robot with this name already exists")
    return to_out(db, [robot])[0]


@router.patch("/{robot_id}", response_model=RobotOut)
def update_robot(robot_id: int, data: RobotUpdate, user: CurrentUser, db: DB):
    robot = get_robot_or_404(db, robot_id)
    changes = data.model_dump(exclude_unset=True)
    is_responsible = robot.responsible_user_id == user.id
    if user.role != Role.admin and not (is_responsible and changes.keys() <= {"status", "location", "description"}):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only admins, or the responsible person for status/location, may edit"
        )
    _validate(db, changes)
    for key, value in changes.items():
        setattr(robot, key, value)
    try:
        db.commit()
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "A robot with this name already exists")
    return to_out(db, [robot])[0]


@router.delete("/{robot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_robot(robot_id: int, _: AdminUser, db: DB):
    db.delete(get_robot_or_404(db, robot_id))
    db.commit()
