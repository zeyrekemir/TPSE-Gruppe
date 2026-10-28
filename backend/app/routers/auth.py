from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm

from ..auth import DB, CurrentUser, authenticate, create_access_token
from ..config import Settings, get_settings
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
