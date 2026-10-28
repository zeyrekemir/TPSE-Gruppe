from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, select, update

from ..auth import DB, AdminUser, CurrentUser, hash_password
from ..models import AuthSource, Reservation, Robot, Role, Ticket, User, utcnow
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


@router.post("/{user_id}/erase", response_model=UserOut)
def erase_user(user_id: int, admin: AdminUser, db: DB):
    """Right to erasure (Art. 17 GDPR): remove the person, keep the lab's records.

    Name, username, e-mail and password are removed and the account is closed for good; future reservations are
    cancelled, responsibilities and ticket assignments released. Past reservations, reports and logs stay as lab
    records under "[deleted #id]". Text the person wrote into them stays as written.
    """
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot erase yourself")
    label = f"[deleted #{user.id}]"
    user.username = label
    user.display_name = label
    user.email = None
    user.password_hash = None
    user.role = Role.member
    user.auth_source = AuthSource.local  # never matched by a later LDAP or TU-ID sign-in
    user.is_active = False
    db.execute(delete(Reservation).where(Reservation.user_id == user.id, Reservation.start > utcnow()))
    db.execute(update(Robot).where(Robot.responsible_user_id == user.id).values(responsible_user_id=None))
    db.execute(update(Ticket).where(Ticket.assignee_id == user.id).values(assignee_id=None))
    db.commit()
    return user
