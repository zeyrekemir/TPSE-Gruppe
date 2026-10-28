from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import DB, CurrentUser
from ..models import ExperimentLog, Role, User
from ..schemas import LogCreate, LogOut, LogUpdate
from .robots import get_robot_or_404

router = APIRouter(prefix="/logs", tags=["experiment logs"])


def _get_owned(db: Session, log_id: int, user: User) -> ExperimentLog:
    entry = db.get(ExperimentLog, log_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Log entry not found")
    if entry.user_id != user.id and user.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only change your own log entries")
    return entry


@router.get("", response_model=list[LogOut])
def list_logs(_: CurrentUser, db: DB, robot_id: int | None = None, user_id: int | None = None, limit: int = 100):
    query = select(ExperimentLog)
    if robot_id is not None:
        query = query.where(ExperimentLog.robot_id == robot_id)
    if user_id is not None:
        query = query.where(ExperimentLog.user_id == user_id)
    return db.scalars(query.order_by(ExperimentLog.date.desc()).limit(min(limit, 500))).all()


@router.post("", response_model=LogOut, status_code=status.HTTP_201_CREATED)
def create_log(data: LogCreate, user: CurrentUser, db: DB):
    get_robot_or_404(db, data.robot_id)
    entry = ExperimentLog(**data.model_dump(), user_id=user.id)
    db.add(entry)
    db.commit()
    return entry


@router.patch("/{log_id}", response_model=LogOut)
def update_log(log_id: int, data: LogUpdate, user: CurrentUser, db: DB):
    entry = _get_owned(db, log_id, user)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, key, value)
    db.commit()
    return entry


@router.delete("/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_log(log_id: int, user: CurrentUser, db: DB):
    db.delete(_get_owned(db, log_id, user))
    db.commit()
