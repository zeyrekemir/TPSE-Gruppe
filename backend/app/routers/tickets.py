from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import notify
from ..auth import DB, CurrentUser
from ..models import (
    Robot,
    RobotStatus,
    Role,
    Ticket,
    TicketEvent,
    TicketKind,
    TicketStatus,
    User,
    utcnow,
)
from ..schemas import TicketCreate, TicketOut, TicketUpdate
from .robots import get_robot_or_404

router = APIRouter(prefix="/tickets", tags=["tickets"])


def _get(db: Session, ticket_id: int) -> Ticket:
    ticket = db.get(Ticket, ticket_id)
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return ticket


def _can_manage(ticket: Ticket, user: User) -> bool:
    return (
        user.role == Role.admin
        or user.id in (ticket.reporter_id, ticket.assignee_id)
        or user.id == ticket.robot.responsible_user_id
    )


def _restore_robot_if_clear(db: Session, robot: Robot):
    """Put a robot back into service once its last open ticket is resolved."""
    if robot.status not in (RobotStatus.defect, RobotStatus.maintenance):
        return
    still_open = db.scalar(
        select(Ticket.id).where(Ticket.robot_id == robot.id, Ticket.status != TicketStatus.resolved).limit(1)
    )
    if still_open is None:
        robot.status = RobotStatus.available


@router.get("", response_model=list[TicketOut])
def list_tickets(
    _: CurrentUser,
    db: DB,
    robot_id: int | None = None,
    status_filter: Annotated[TicketStatus | None, Query(alias="status")] = None,
    open_only: bool = False,
):
    query = select(Ticket)
    if robot_id is not None:
        query = query.where(Ticket.robot_id == robot_id)
    if status_filter is not None:
        query = query.where(Ticket.status == status_filter)
    if open_only:
        query = query.where(Ticket.status != TicketStatus.resolved)
    return db.scalars(query.order_by(Ticket.created_at.desc())).all()


@router.get("/{ticket_id}", response_model=TicketOut)
def get_ticket(ticket_id: int, _: CurrentUser, db: DB):
    return _get(db, ticket_id)


@router.post("", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
def create_ticket(data: TicketCreate, user: CurrentUser, db: DB, background: BackgroundTasks):
    robot = get_robot_or_404(db, data.robot_id)
    ticket = Ticket(**data.model_dump(exclude={"mark_robot_defect"}), reporter_id=user.id)
    ticket.events.append(TicketEvent(user_id=user.id, new_status=TicketStatus.open))
    if data.mark_robot_defect and data.kind == TicketKind.fault:
        robot.status = RobotStatus.defect
    db.add(ticket)
    db.commit()
    background.add_task(notify.send, notify.ticket_created(db, ticket))
    return ticket


@router.patch("/{ticket_id}", response_model=TicketOut)
def update_ticket(ticket_id: int, data: TicketUpdate, user: CurrentUser, db: DB, background: BackgroundTasks):
    """Anyone may comment; changing status or assignee needs admin, reporter, assignee or responsible."""
    ticket = _get(db, ticket_id)
    changes = data.model_dump(exclude_unset=True)
    if ({"status", "assignee_id"} & changes.keys()) and not _can_manage(ticket, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You may only comment on this ticket")
    if changes.get("assignee_id") is not None and db.get(User, changes["assignee_id"]) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Assignee does not exist")

    old_status = ticket.status
    new_status = changes.get("status")
    if "assignee_id" in changes:
        ticket.assignee_id = changes["assignee_id"]
    if new_status is not None and new_status != old_status:
        ticket.status = new_status
        ticket.resolved_at = utcnow() if new_status == TicketStatus.resolved else None
    else:
        new_status = None

    if new_status is None and not changes.get("comment") and "assignee_id" not in changes:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Nothing to update")
    ticket.events.append(
        TicketEvent(
            user_id=user.id,
            old_status=old_status if new_status else None,
            new_status=new_status,
            comment=changes.get("comment"),
        )
    )
    ticket.updated_at = utcnow()
    db.flush()
    if new_status == TicketStatus.resolved:
        _restore_robot_if_clear(db, ticket.robot)
    db.commit()
    db.refresh(ticket)
    if new_status is not None:
        background.add_task(notify.send, notify.ticket_status_changed(ticket, user))
    return ticket
