import re
import unicodedata
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, undefer

from ..auth import DB, CurrentUser
from ..models import ExperimentLog, LogAttachment, Role, User
from ..schemas import AttachmentOut, LogCreate, LogOut, LogUpdate
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


# --- Attachments ---

MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
MAX_ATTACHMENTS_PER_LOG = 10
# Shown in the browser as what they are; everything else is served as a plain download.
INLINE_SAFE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain", "text/csv"}


def clean_filename(name: str | None) -> str:
    """The file's own name without any path, control characters or characters that break headers."""
    name = unicodedata.normalize("NFC", (name or "").replace("\\", "/").rsplit("/", 1)[-1])
    name = re.sub(r'[\x00-\x1f\x7f"<>:|?*]', "_", name).strip(" .")
    return name[:255] or "file"


def _attachment(db: Session, log_id: int, attachment_id: int) -> LogAttachment:
    attachment = db.get(LogAttachment, attachment_id)
    if attachment is None or attachment.log_id != log_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    return attachment


@router.post("/{log_id}/attachments", response_model=AttachmentOut, status_code=status.HTTP_201_CREATED)
async def add_attachment(log_id: int, file: UploadFile, user: CurrentUser, db: DB):
    entry = _get_owned(db, log_id, user)
    if len(entry.attachments) >= MAX_ATTACHMENTS_PER_LOG:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A log can have at most {MAX_ATTACHMENTS_PER_LOG} files")
    data = await file.read(MAX_ATTACHMENT_BYTES + 1)
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "A file may be at most 10 MB")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The file is empty")
    attachment = LogAttachment(
        log=entry,
        filename=clean_filename(file.filename),
        content_type=(file.content_type or "application/octet-stream")[:128],
        size=len(data),
        data=data,
    )
    db.add(attachment)
    db.commit()
    return attachment


@router.get("/{log_id}/attachments/{attachment_id}")
def download_attachment(log_id: int, attachment_id: int, _: CurrentUser, db: DB):
    attachment = db.scalar(
        select(LogAttachment)
        .options(undefer(LogAttachment.data))
        .where(LogAttachment.id == attachment_id, LogAttachment.log_id == log_id)
    )
    if attachment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    media_type = attachment.content_type if attachment.content_type in INLINE_SAFE_TYPES else "application/octet-stream"
    return Response(
        attachment.data,
        media_type=media_type,
        headers={
            # Always a download, never rendered as a page of the hub.
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(attachment.filename)}",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )


@router.delete("/{log_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(log_id: int, attachment_id: int, user: CurrentUser, db: DB):
    _get_owned(db, log_id, user)
    db.delete(_attachment(db, log_id, attachment_id))
    db.commit()
