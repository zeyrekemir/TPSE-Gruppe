"""SSO login against a fake OpenID Connect provider (keys generated per test run)."""

import time
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.config import get_settings
from app.routers import oidc
from tests.conftest import login

ISSUER = "https://sso.test/realms/tu"
CLIENT_ID = "robot-hub"


@pytest.fixture
def provider(monkeypatch):
    settings = get_settings()
    for key, value in {
        "oidc_issuer": ISSUER,
        "oidc_client_id": CLIENT_ID,
        "oidc_client_secret": "secret",
        "oidc_admin_group": "pearl-admins",
        "public_url": "http://app.test",
    }.items():
        monkeypatch.setattr(settings, key, value)

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    meta = {
        "issuer": ISSUER,
        "authorization_endpoint": f"{ISSUER}/auth",
        "token_endpoint": f"{ISSUER}/token",
        "jwks_uri": f"{ISSUER}/certs",
    }
    monkeypatch.setattr(oidc, "discovery", lambda _settings: meta)
    monkeypatch.setattr(
        oidc, "_jwks_client", lambda _uri: SimpleNamespace(get_signing_key_from_jwt=lambda _t: SimpleNamespace(key=private_key.public_key()))
    )

    state = {"claims": {}, "token_requests": []}

    def fake_post(url, data, timeout, auth=None):
        state["token_requests"].append(data | {"_auth": auth})
        claims = {"iss": ISSUER, "aud": CLIENT_ID, "exp": int(time.time()) + 300, "iat": int(time.time())} | state["claims"]
        token = jwt.encode(claims, private_key, algorithm="RS256")
        return SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"id_token": token})

    monkeypatch.setattr(oidc.httpx, "post", fake_post)
    monkeypatch.setattr(oidc.httpx, "head", lambda *_a, **_k: None)  # the provider is up
    return state


def start_login(client):
    r = client.get("/api/auth/oidc/login", follow_redirects=False)
    assert r.status_code == 307
    location = urlparse(r.headers["location"])
    assert f"{location.scheme}://{location.netloc}{location.path}" == f"{ISSUER}/auth"
    return {k: v[0] for k, v in parse_qs(location.query).items()}


def finish_login(client, params, state=None):
    r = client.get(
        "/api/auth/oidc/callback", params={"code": "abc", "state": state or params["state"]}, follow_redirects=False
    )
    assert r.status_code == 307
    return r.headers["location"]


def test_unreachable_provider_returns_to_login_with_reason(client, provider, monkeypatch):
    def down(*_args, **_kwargs):
        raise oidc.httpx.ConnectError("connection refused")

    monkeypatch.setattr(oidc.httpx, "head", down)
    r = client.get("/api/auth/oidc/login", follow_redirects=False)
    assert r.status_code == 307
    assert r.headers["location"] == "http://app.test/#sso_error=unreachable"


def test_token_request_uses_basic_auth_by_default(client, provider, monkeypatch):
    """TU-ID registers clients for client_secret_basic: the secret goes in the header, not the form."""
    params = start_login(client)
    provider["claims"] = {"sub": "u-9", "nonce": params["nonce"], "preferred_username": "ab12cdef"}
    finish_login(client, params)
    sent = provider["token_requests"][-1]
    assert sent["_auth"] == (CLIENT_ID, "secret") and "client_secret" not in sent

    monkeypatch.setattr(get_settings(), "oidc_token_auth", "client_secret_post")
    params = start_login(client)
    provider["claims"]["nonce"] = params["nonce"]
    finish_login(client, params)
    sent = provider["token_requests"][-1]
    assert sent["_auth"] is None and sent["client_secret"] == "secret"


def test_named_admins_without_groups(client, provider, monkeypatch, admin):
    """TU-ID sends no groups: ROBOTS_OIDC_ADMIN_USERS makes named TU-IDs admins, others keep their role."""
    monkeypatch.setattr(get_settings(), "oidc_admin_users", "AB12cdef, zz99zzzz")
    monkeypatch.setattr(get_settings(), "oidc_admin_group", None)  # as with TU-ID: no groups claim
    for username, expected in [("ab12cdef", "admin"), ("xy34ghij", "member")]:
        params = start_login(client)
        provider["claims"] = {"sub": username, "nonce": params["nonce"], "preferred_username": username}
        token = finish_login(client, params).split("#token=")[1]
        me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
        assert me["role"] == expected, username
    # A member promoted on the Users page stays admin at the next TU-ID sign-in.
    xy = next(u for u in client.get("/api/users", headers=admin).json() if u["username"] == "xy34ghij")
    client.patch(f"/api/users/{xy['id']}", headers=admin, json={"role": "admin"})
    params = start_login(client)
    provider["claims"] = {"sub": "xy34ghij", "nonce": params["nonce"], "preferred_username": "xy34ghij"}
    token = finish_login(client, params).split("#token=")[1]
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).json()["role"] == "admin"


def test_config_reports_sso(client, provider):
    assert client.get("/api/auth/config").json() == {"ldap": False, "oidc": True, "oidc_label": "TU-ID"}


def test_sso_disabled_by_default(client):
    assert client.get("/api/auth/config").json()["oidc"] is False
    assert client.get("/api/auth/oidc/login", follow_redirects=False).status_code == 404


def test_full_login_creates_user_and_uses_pkce(client, provider):
    params = start_login(client)
    assert params["code_challenge_method"] == "S256" and params["redirect_uri"] == "http://app.test/api/auth/oidc/callback"
    provider["claims"] = {
        "sub": "u-1", "nonce": params["nonce"], "preferred_username": "ab12cdef",
        "name": "Anna Becker", "email": "anna@tu.test", "groups": ["pearl-admins"],
    }
    location = finish_login(client, params)
    assert location.startswith("http://app.test/#token=")

    token = location.split("#token=")[1]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert (me["username"], me["display_name"], me["email"], me["auth_source"], me["role"]) == (
        "ab12cdef", "Anna Becker", "anna@tu.test", "oidc", "admin",
    )
    # The verifier only ever travels in the back-channel token request.
    assert provider["token_requests"][0]["code_verifier"] and "code_verifier" not in params


def test_wrong_state_rejected(client, provider):
    params = start_login(client)
    provider["claims"] = {"sub": "u", "nonce": params["nonce"]}
    assert finish_login(client, params, state="forged").endswith("#sso_error=state")


def test_wrong_nonce_rejected(client, provider):
    params = start_login(client)
    provider["claims"] = {"sub": "u", "nonce": "replayed"}
    assert finish_login(client, params).endswith("#sso_error=nonce")


def test_token_for_other_client_rejected(client, provider):
    params = start_login(client)
    provider["claims"] = {"sub": "u", "nonce": params["nonce"], "aud": "some-other-app"}
    assert finish_login(client, params).endswith("#sso_error=token")


def test_callback_without_login_cookie_rejected(client, provider):
    r = client.get("/api/auth/oidc/callback", params={"code": "abc", "state": "x"}, follow_redirects=False)
    assert r.headers["location"].endswith("#sso_error=expired")


def test_sso_cannot_take_over_local_account(client, provider, admin):
    params = start_login(client)
    provider["claims"] = {"sub": "u-9", "nonce": params["nonce"], "preferred_username": "admin", "groups": []}
    token = finish_login(client, params).split("#token=")[1]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["username"] == "admin@sso" and me["role"] == "member"
    # The local admin is untouched and still logs in with its password.
    login(client, "admin", "admin-password")


def test_deactivated_sso_user_rejected(client, provider, admin):
    params = start_login(client)
    provider["claims"] = {"sub": "u", "nonce": params["nonce"], "preferred_username": "zz99"}
    finish_login(client, params)
    uid = next(u["id"] for u in client.get("/api/users", headers=admin).json() if u["username"] == "zz99")
    client.patch(f"/api/users/{uid}", headers=admin, json={"is_active": False})

    params = start_login(client)
    provider["claims"]["nonce"] = params["nonce"]
    assert finish_login(client, params).endswith("#sso_error=inactive")
