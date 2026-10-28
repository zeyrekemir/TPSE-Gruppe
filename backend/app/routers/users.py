from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from ..auth import DB, AdminUser, CurrentUser, hash_password
from ..models import AuthSource, User
from ..schemas import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(_: CurrentUser, db: DB):
    # Members need the list too, e.g. to pick a responsible person or assignee.
    return db.scalars(select(User).order_by(User.display_name)).all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(data: UserCreate, _: AdminUser, db: DB):
    if db.scalar(select(User).where(User.username == data.username)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already exists")
    user = User(
        **data.model_dump(exclude={"password"}),
        password_hash=hash_password(data.password),
        auth_source=AuthSource.local,
    )
    db.add(user)
    db.commit()
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserUpdate, admin: AdminUser, db: DB):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    changes = data.model_dump(exclude_unset=True)
    if user.id == admin.id and (changes.get("role", admin.role) != admin.role or changes.get("is_active") is False):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot demote or deactivate yourself")
    if "password" in changes:
        if user.auth_source != AuthSource.local:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password is managed by LDAP")
        user.password_hash = hash_password(changes.pop("password"))
    for key, value in changes.items():
        setattr(user, key, value)
    db.commit()
    return user
