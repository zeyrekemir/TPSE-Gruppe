"""LDAP login against ldap3's in-memory mock server (no real directory needed)."""

import pytest
from ldap3 import MOCK_SYNC, OFFLINE_SLAPD_2_4, Connection, Server

from app import auth
from app.config import get_settings
from tests.conftest import login

PEOPLE = "ou=people,dc=pearl,dc=org"
ADMINS = "cn=robot-admins,ou=groups,dc=pearl,dc=org"


@pytest.fixture
def ldap(monkeypatch):
    server = Server("fake-ldap", get_info=OFFLINE_SLAPD_2_4)
    seed = Connection(server, client_strategy=MOCK_SYNC)
    seed.bind()

    def add(uid, name, password, mail=None, groups=()):
        attrs = {"objectClass": ["inetOrgPerson"], "uid": uid, "cn": name, "sn": name, "userPassword": password}
        if mail:
            attrs["mail"] = mail
        if groups:
            attrs["memberOf"] = list(groups)
        seed.strategy.add_entry(f"uid={uid},{PEOPLE}", attrs)

    add("mmuster", "Max Mustermann", "ldap-pass", mail="max@pearl.org")
    add("boss", "Prof Boss", "boss-pass", groups=[ADMINS])

    settings = get_settings()
    monkeypatch.setattr(settings, "ldap_url", "ldap://fake-ldap")
    monkeypatch.setattr(settings, "ldap_user_dn_template", "uid={username}," + PEOPLE)
    monkeypatch.setattr(settings, "ldap_admin_group_dn", ADMINS)
    monkeypatch.setattr(
        auth,
        "ldap_connection",
        lambda _s, dn, pw: Connection(server, user=dn, password=pw, client_strategy=MOCK_SYNC),
    )
    return add


def test_ldap_login_creates_member(client, ldap):
    headers = login(client, "mmuster", "ldap-pass")
    me = client.get("/api/auth/me", headers=headers).json()
    assert me["auth_source"] == "ldap"
    assert me["display_name"] == "Max Mustermann"
    assert me["email"] == "max@pearl.org"
    assert me["role"] == "member"


def test_ldap_wrong_password(client, ldap):
    r = client.post("/api/auth/login", data={"username": "mmuster", "password": "wrong"})
    assert r.status_code == 401


def test_ldap_unknown_user(client, ldap):
    r = client.post("/api/auth/login", data={"username": "nobody", "password": "x"})
    assert r.status_code == 401


def test_ldap_empty_password_never_binds(client, ldap):
    # An empty password would be an anonymous bind on many servers.
    r = client.post("/api/auth/login", data={"username": "mmuster", "password": ""})
    assert r.status_code in (401, 422)


def test_ldap_admin_group_grants_admin(client, ldap):
    headers = login(client, "boss", "boss-pass")
    assert client.get("/api/auth/me", headers=headers).json()["role"] == "admin"


def test_ldap_group_change_is_applied_on_next_login(client, admin, ldap):
    login(client, "mmuster", "ldap-pass")
    users = client.get("/api/users", headers=admin).json()
    max_id = next(u["id"] for u in users if u["username"] == "mmuster")
    # A local promotion is overridden by the directory, which is the source of truth.
    client.patch(f"/api/users/{max_id}", headers=admin, json={"role": "admin"})
    headers = login(client, "mmuster", "ldap-pass")
    assert client.get("/api/auth/me", headers=headers).json()["role"] == "member"


def test_ldap_user_password_cannot_be_set_locally(client, admin, ldap):
    login(client, "mmuster", "ldap-pass")
    max_id = next(u["id"] for u in client.get("/api/users", headers=admin).json() if u["username"] == "mmuster")
    r = client.patch(f"/api/users/{max_id}", headers=admin, json={"password": "new-password"})
    assert r.status_code == 400


def test_deactivated_ldap_user_rejected(client, admin, ldap):
    login(client, "mmuster", "ldap-pass")
    max_id = next(u["id"] for u in client.get("/api/users", headers=admin).json() if u["username"] == "mmuster")
    client.patch(f"/api/users/{max_id}", headers=admin, json={"is_active": False})
    r = client.post("/api/auth/login", data={"username": "mmuster", "password": "ldap-pass"})
    assert r.status_code == 401


def test_local_account_does_not_fall_back_to_ldap(client, ldap):
    # "admin" exists locally; a matching LDAP entry must not let someone in with the LDAP password.
    ldap("admin", "Impostor", "ldap-admin-pass")
    r = client.post("/api/auth/login", data={"username": "admin", "password": "ldap-admin-pass"})
    assert r.status_code == 401


def test_dn_injection_is_escaped(client, ldap):
    r = client.post("/api/auth/login", data={"username": "mmuster,ou=people", "password": "ldap-pass"})
    assert r.status_code == 401


def test_ldap_server_down(client, ldap, monkeypatch):
    from ldap3.core.exceptions import LDAPSocketOpenError

    def broken(*_):
        raise LDAPSocketOpenError("unreachable")

    monkeypatch.setattr(auth, "ldap_connection", broken)
    r = client.post("/api/auth/login", data={"username": "mmuster", "password": "ldap-pass"})
    assert r.status_code == 401
