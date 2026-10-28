"""Single sign-on via OpenID Connect (authorization code flow with PKCE), e.g. for TU-ID.

Flow: /auth/oidc/login redirects to the provider; the provider redirects back to /auth/oidc/callback, which
checks the ID token, creates or updates the user and sends the browser to the app with our own token in the
URL fragment (fragments never reach a server or its logs).
"""

import base64
import hashlib
import secrets
import time
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Annotated
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import DB, create_access_token
from ..config import Settings, get_settings
from ..models import AuthSource, Role, User

router = APIRouter(prefix="/auth", tags=["auth"])

STATE_COOKIE = "robots_oidc"
STATE_TTL = timedelta(minutes=10)


def oidc_enabled(settings: Settings) -> bool:
    return bool(settings.oidc_issuer and settings.oidc_client_id)


@lru_cache(maxsize=4)
def _discovery(issuer: str, _cache_slot: int) -> dict:
    url = issuer.rstrip("/") + "/.well-known/openid-configuration"
    response = httpx.get(url, timeout=10)
    response.raise_for_status()
    return response.json()


def discovery(settings: Settings) -> dict:
    # Re-fetched about once an hour, so key rotation and endpoint changes are picked up.
    return _discovery(settings.oidc_issuer, int(time.time() // 3600))


@lru_cache(maxsize=4)
def _jwks_client(uri: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(uri, cache_keys=True)


def callback_url(settings: Settings) -> str:
    return settings.public_url.rstrip("/") + "/api/auth/oidc/callback"


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


@router.get("/config")
def auth_config(settings: Annotated[Settings, Depends(get_settings)]):
    """What the login page should offer."""
    return {
        "ldap": bool(settings.ldap_url),
        "oidc": oidc_enabled(settings),
        "oidc_label": settings.oidc_button_label,
    }


@router.get("/oidc/login")
def oidc_login(settings: Annotated[Settings, Depends(get_settings)]):
    if not oidc_enabled(settings):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Single sign-on is not configured")
    state, nonce, verifier = secrets.token_urlsafe(24), secrets.token_urlsafe(24), secrets.token_urlsafe(48)
    params = {
        "response_type": "code",
        "client_id": settings.oidc_client_id,
        "redirect_uri": callback_url(settings),
        "scope": settings.oidc_scopes,
        "state": state,
        "nonce": nonce,
        "code_challenge": _b64(hashlib.sha256(verifier.encode()).digest()),
        "code_challenge_method": "S256",
    }
    # Check that the provider answers before sending the browser there: otherwise the user lands on the
    # browser's own "site can't be reached" page instead of our sign-in page with an explanation.
    try:
        authorize = discovery(settings)["authorization_endpoint"]
        httpx.head(authorize, timeout=3)
    except (httpx.HTTPError, KeyError):
        _discovery.cache_clear()
        return _fail(settings, "unreachable")
    response = RedirectResponse(authorize + "?" + urlencode(params))
    # The verifier stays with the browser in a signed, short-lived, http-only cookie, never in a URL.
    cookie = jwt.encode(
        {"state": state, "nonce": nonce, "verifier": verifier, "exp": datetime.now(UTC) + STATE_TTL},
        settings.secret_key,
        algorithm="HS256",
    )
    response.set_cookie(
        STATE_COOKIE,
        cookie,
        max_age=int(STATE_TTL.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=settings.public_url.startswith("https"),
        path="/api/auth/oidc",
    )
    return response


def _fail(settings: Settings, reason: str) -> RedirectResponse:
    response = RedirectResponse(settings.public_url.rstrip("/") + "/#sso_error=" + reason)
    response.delete_cookie(STATE_COOKIE, path="/api/auth/oidc")
    return response


@router.get("/oidc/callback")
def oidc_callback(
    request: Request,
    db: DB,
    settings: Annotated[Settings, Depends(get_settings)],
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    if not oidc_enabled(settings):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Single sign-on is not configured")
    if error or not code or not state:
        return _fail(settings, "denied")
    try:
        saved = jwt.decode(request.cookies.get(STATE_COOKIE, ""), settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return _fail(settings, "expired")
    if not secrets.compare_digest(saved["state"], state):
        return _fail(settings, "state")

    meta = discovery(settings)
    try:
        token_response = httpx.post(
            meta["token_endpoint"],
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": callback_url(settings),
                "client_id": settings.oidc_client_id,
                "client_secret": settings.oidc_client_secret or "",
                "code_verifier": saved["verifier"],
            },
            timeout=10,
        )
        token_response.raise_for_status()
        id_token = token_response.json()["id_token"]
        key = _jwks_client(meta["jwks_uri"]).get_signing_key_from_jwt(id_token)
        claims = jwt.decode(
            id_token,
            key.key,
            algorithms=["RS256", "ES256", "PS256"],
            audience=settings.oidc_client_id,
            issuer=meta.get("issuer", settings.oidc_issuer),
        )
    except (httpx.HTTPError, KeyError, jwt.PyJWTError):
        return _fail(settings, "token")
    if not secrets.compare_digest(claims.get("nonce", ""), saved["nonce"]):
        return _fail(settings, "nonce")

    user = upsert_oidc_user(db, claims, settings)
    if user is None:
        return _fail(settings, "inactive")
    response = RedirectResponse(settings.public_url.rstrip("/") + "/#token=" + create_access_token(user, settings))
    response.delete_cookie(STATE_COOKIE, path="/api/auth/oidc")
    return response


def upsert_oidc_user(db: Session, claims: dict, settings: Settings) -> User | None:
    username = str(claims.get(settings.oidc_username_claim) or claims["sub"])
    user = db.scalar(select(User).where(User.username == username))
    if user is not None and user.auth_source == AuthSource.local:
        # Never let an SSO identity take over a local account that happens to share the name.
        username = f"{username}@sso"
        user = db.scalar(select(User).where(User.username == username))
    if user is not None and not user.is_active:
        return None
    if user is None:
        user = User(username=username, auth_source=AuthSource.oidc, display_name=username)
        db.add(user)
    user.display_name = claims.get("name") or user.display_name
    user.email = claims.get("email") or user.email
    if settings.oidc_admin_group:
        groups = claims.get(settings.oidc_groups_claim) or []
        user.role = Role.admin if settings.oidc_admin_group in groups else Role.member
    db.commit()
    db.refresh(user)
    return user
