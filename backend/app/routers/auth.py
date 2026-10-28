from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from ..auth import DB, CurrentUser, authenticate, create_access_token
from ..config import Settings, get_settings
from ..models import ExperimentLog, Reservation, Ticket, TicketEvent, utcnow
from ..schemas import MeUpdate, Token, UserOut
from ..throttle import login_throttle

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Token, responses={429: {"description": "Too many failed sign-ins"}})
def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    request: Request,
    db: DB,
    settings: Annotated[Settings, Depends(get_settings)],
):
    keys = login_throttle.keys(form.username, request.client.host if request.client else "")
    if wait := login_throttle.retry_after(keys):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Too many failed sign-ins. Try again in {wait} seconds.",
            headers={"Retry-After": str(wait)},
        )
    user = authenticate(db, form.username, form.password, settings)
    if user is None:
        login_throttle.failed(keys)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong username or password")
    login_throttle.succeeded(keys)
    return Token(access_token=create_access_token(user, settings))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(data: MeUpdate, user: CurrentUser, db: DB):
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    db.commit()
    return user


@router.get("/me/export")
def export_my_data(user: CurrentUser, db: DB):
    """Right of access (Art. 15/20 GDPR): everything stored about the signed-in person, as a JSON download."""
    when = lambda d: d.isoformat() if d else None  # noqa: E731
    reservations = db.scalars(select(Reservation).where(Reservation.user_id == user.id).order_by(Reservation.start))
    reported = db.scalars(select(Ticket).where(Ticket.reporter_id == user.id).order_by(Ticket.created_at))
    events = db.scalars(select(TicketEvent).where(TicketEvent.user_id == user.id).order_by(TicketEvent.created_at))
    logs = db.scalars(select(ExperimentLog).where(ExperimentLog.user_id == user.id).order_by(ExperimentLog.date))
    data = {
        "exported_at": when(utcnow()),
        "account": {
            "username": user.username,
            "display_name": user.display_name,
            "email": user.email,
            "role": user.role.value,
            "sign_in": user.auth_source.value,
            "language": user.language,
            "active": user.is_active,
            "created_at": when(user.created_at),
        },
        "reservations": [
            {"robot": r.robot.name, "start": when(r.start), "end": when(r.end), "purpose": r.purpose} for r in reservations
        ],
        "reports": [
            {"robot": t.robot.name, "kind": t.kind.value, "title": t.title, "description": t.description,
             "status": t.status.value, "created_at": when(t.created_at)}
            for t in reported
        ],
        "report_updates": [
            {"report": e.ticket.title, "comment": e.comment, "new_status": e.new_status.value if e.new_status else None,
             "at": when(e.created_at)}
            for e in events
        ],
        "experiment_logs": [
            {"robot": log.robot.name, "date": when(log.date), "title": log.title, "description": log.description,
             "result": log.result.value}
            for log in logs
        ],
    }
    return JSONResponse(data, headers={"Content-Disposition": 'attachment; filename="pearl-robot-hub-my-data.json"'})
