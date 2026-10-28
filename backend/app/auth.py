import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .db import get_db
from .models import AuthSource, Role, User

log = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_access_token(user: User, settings: Settings) -> str:
    expires = datetime.now(UTC) + timedelta(minutes=settings.access_token_minutes)
    return jwt.encode({"sub": str(user.id), "exp": expires}, settings.secret_key, algorithm="HS256")


def ldap_connection(settings: Settings, user_dn: str, password: str):
    """Separate so tests can swap in ldap3's mock strategy."""
    from ldap3 import Connection, Server

    return Connection(Server(settings.ldap_url, connect_timeout=5), user=user_dn, password=password, receive_timeout=10)


def ldap_authenticate(username: str, password: str, settings: Settings) -> dict | None:
    """Bind against LDAP as the user. Returns their attributes on success, None otherwise."""
    if not settings.ldap_url or not password:
        return None
    from ldap3 import BASE
    from ldap3.core.exceptions import LDAPException
    from ldap3.utils.dn import escape_rdn

    user_dn = settings.ldap_user_dn_template.format(username=escape_rdn(username))
    try:
        conn = ldap_connection(settings, user_dn, password)
        if not conn.bind():
            return None
        conn.search(
            user_dn,
            "(objectClass=*)",
            search_scope=BASE,
            attributes=[settings.ldap_name_attribute, settings.ldap_email_attribute, "memberOf"],
        )
        attrs = conn.entries[0].entry_attributes_as_dict if conn.entries else {}
        conn.unbind()
    except LDAPException:
        log.exception("LDAP authentication failed for %s", username)
        return None

    def first(key):
        values = attrs.get(key) or []
        return values[0] if values else None

    groups = [g.lower() for g in attrs.get("memberOf", [])]
    is_admin = bool(settings.ldap_admin_group_dn) and settings.ldap_admin_group_dn.lower() in groups
    return {
        "display_name": first(settings.ldap_name_attribute) or username,
        "email": first(settings.ldap_email_attribute),
        "is_admin": is_admin,
    }


def authenticate(db: Session, username: str, password: str, settings: Settings) -> User | None:
    user = db.scalar(select(User).where(User.username == username))
    if user and not user.is_active:
        return None
    if user and user.auth_source == AuthSource.local:
        if user.password_hash and verify_password(password, user.password_hash):
            return user
        return None

    info = ldap_authenticate(username, password, settings)
    if info is None:
        return None
    if user is None:
        user = User(username=username, auth_source=AuthSource.ldap, display_name=info["display_name"])
        db.add(user)
    user.display_name = info["display_name"]
    user.email = info["email"]
    if settings.ldap_admin_group_dn:
        # The directory is the source of truth for admin rights when a group is configured.
        user.role = Role.admin if info["is_admin"] else Role.member
    db.commit()
    db.refresh(user)
    return user


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED, "Invalid or expired token", headers={"WWW-Authenticate": "Bearer"}
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthorized
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise unauthorized
    return user


def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin rights required")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_admin)]
DB = Annotated[Session, Depends(get_db)]
