"""The helper scripts in tools/ and the demo seed, run against a real HTTP server.

- tools/robot_agent.py: the live-status sender a lab installs next to a robot
- tools/dev_oidc.py: the TU-ID stand-in, driving the complete SSO flow over real HTTP (no mocks)
- tools/smoke_test.py: the post-deployment check
- app/seed.py: the demo data
"""

import importlib.util
import socket
import subprocess
import sys
import threading
import time
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

import httpx
import pytest
import uvicorn
from sqlalchemy import func, select

from app import seed
from app.config import get_settings
from app.db import SessionLocal
from app.main import app
from app.models import Reservation, Robot, Ticket, User
from app.routers import oidc
from tests.conftest import login

TOOLS = Path(__file__).resolve().parents[2] / "tools"


def load_tool(name: str):
    spec = importlib.util.spec_from_file_location(f"tool_{name}", TOOLS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def live_url():
    """The backend on a real port, so the tools talk to it the way they do in production."""
    port = free_port()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.time() + 15
    while not server.started:
        assert time.time() < deadline, "backend did not start"
        time.sleep(0.05)
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True
    thread.join(10)


def admin_headers(url: str) -> dict:
    r = httpx.post(f"{url}/api/auth/login", data={"username": "admin", "password": "admin-password"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def make_robot_with_key(url: str) -> tuple[int, str, dict]:
    headers = admin_headers(url)
    r = httpx.post(
        f"{url}/api/robots", headers=headers, json={"name": "Franka 1", "type": "Franka Panda", "location": "Lab S2|02"}
    )
    assert r.status_code == 201, r.text
    robot = r.json()
    key = httpx.post(f"{url}/api/robots/{robot['id']}/api-key", headers=headers).json()["api_key"]
    return robot["id"], key, headers


# --- tools/robot_agent.py ---


def run_agent(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(TOOLS / "robot_agent.py"), *args], capture_output=True, text=True, timeout=30
    )


def test_robot_agent_reports_live_status(live_url):
    robot_id, key, headers = make_robot_with_key(live_url)
    result = run_agent("--url", live_url, "--robot", str(robot_id), "--key", key, "--once")
    assert result.returncode == 0, result.stderr

    live = httpx.get(f"{live_url}/api/robots/{robot_id}", headers=headers).json()["live"]
    assert live["online"] is True and live["state"] == "idle"


def test_robot_agent_stops_on_wrong_key(live_url):
    robot_id, _, _ = make_robot_with_key(live_url)
    # Without --once it would keep running; a rejected key must end it, since retrying cannot help.
    result = run_agent("--url", live_url, "--robot", str(robot_id), "--key", "rbk_wrong", "--interval", "0.1")
    assert result.returncode == 1
    assert "HTTP 401" in result.stderr


def test_robot_agent_survives_hub_outage():
    result = run_agent("--url", f"http://127.0.0.1:{free_port()}", "--robot", "1", "--key", "k", "--once")
    assert result.returncode == 0
    assert "not reachable" in result.stderr


def test_robot_agent_reports_offline_controller(monkeypatch):
    agent = load_tool("robot_agent")
    monkeypatch.setattr(agent, "reachable", lambda host: host == "172.16.0.2")
    assert agent.read_status("172.16.0.2")["state"] == "idle"
    status = agent.read_status("172.16.0.9")
    assert status["state"] == "controller_offline" and "172.16.0.9" in status["message"]
    assert agent.read_status(None)["state"] == "idle"


# --- tools/dev_oidc.py: the complete TU-ID flow over real HTTP ---


@pytest.fixture
def dev_idp(monkeypatch):
    idp = load_tool("dev_oidc")
    idp.Handler.log_message = lambda *a: None
    server = ThreadingHTTPServer(("127.0.0.1", 0), idp.Handler)
    issuer = f"http://127.0.0.1:{server.server_address[1]}"
    monkeypatch.setattr(idp, "ISSUER", issuer)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    settings = get_settings()
    for key, value in {
        "oidc_issuer": issuer,
        "oidc_client_id": idp.CLIENT_ID,
        "oidc_client_secret": idp.CLIENT_SECRET,
        "oidc_admin_group": "pearl-admins",
        "public_url": "http://app.test",
    }.items():
        monkeypatch.setattr(settings, key, value)
    oidc._discovery.cache_clear()
    oidc._jwks_client.cache_clear()
    yield idp
    server.shutdown()
    oidc._discovery.cache_clear()
    oidc._jwks_client.cache_clear()


def sso_login(client, idp_user: str) -> str:
    """Browser steps: hub -> provider's sign-in page -> pick a user -> back to the hub. Returns the redirect target."""
    r = client.get("/api/auth/oidc/login", follow_redirects=False)
    assert r.status_code == 307
    authorize = r.headers["location"]
    page = httpx.get(authorize)
    assert page.status_code == 200 and idp_user in page.text

    params = {k: v[0] for k, v in parse_qs(urlparse(authorize).query).items()}
    issuer = authorize.split("/authorize")[0]
    approve = httpx.get(f"{issuer}/approve?" + urlencode(params | {"user": idp_user}), follow_redirects=False)
    assert approve.status_code == 302
    back = urlparse(approve.headers["location"])
    assert back.path == "/api/auth/oidc/callback"

    r = client.get(back.path + "?" + back.query, follow_redirects=False)
    assert r.status_code == 307
    return r.headers["location"]


def test_tuid_login_against_dev_provider(client, dev_idp):
    location = sso_login(client, "ab12cdef")
    assert location.startswith("http://app.test/#token="), location
    token = location.split("#token=")[1]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert (me["username"], me["auth_source"], me["role"]) == ("ab12cdef", "oidc", "admin")

    # A second user without the admin group becomes a member; signing in again keeps one account each.
    member = sso_login(client, "xy34ghij").split("#token=")[1]
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {member}"}).json()["role"] == "member"
    sso_login(client, "ab12cdef")
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(User).where(User.username.in_(["ab12cdef", "xy34ghij"]))) == 2


def test_tuid_code_cannot_be_replayed(client, dev_idp):
    r = client.get("/api/auth/oidc/login", follow_redirects=False)
    authorize = r.headers["location"]
    params = {k: v[0] for k, v in parse_qs(urlparse(authorize).query).items()}
    issuer = authorize.split("/authorize")[0]
    approve = httpx.get(f"{issuer}/approve?" + urlencode(params | {"user": "xy34ghij"}), follow_redirects=False)
    back = urlparse(approve.headers["location"])
    first = client.get(back.path + "?" + back.query, follow_redirects=False).headers["location"]
    assert "#token=" in first
    # The provider hands out each code once; the hub reports the failure instead of signing in.
    again = client.get(back.path + "?" + back.query, follow_redirects=False).headers["location"]
    assert "#sso_error=" in again


# --- tools/smoke_test.py ---


def test_smoke_test_passes_against_running_hub(live_url, capsys):
    smoke = load_tool("smoke_test")
    assert smoke.run(live_url, "admin", "admin-password", frontend=False) == []
    out = capsys.readouterr().out
    assert "ok    sign in  (admin)" in out and "All checks passed." in out


def test_smoke_test_reports_failures(live_url, capsys):
    smoke = load_tool("smoke_test")
    failures = smoke.run(live_url, "admin", "wrong-password", frontend=True)
    # No web app behind the bare backend, and the password is wrong.
    assert failures == ["web app served", "sign in"]
    assert "2 check(s) failed." in capsys.readouterr().out
    assert smoke.run(f"http://127.0.0.1:{free_port()}", frontend=False) == ["API health", "sign-in options"]


# --- app/seed.py ---


def test_seed_fills_an_empty_database_once(capsys):
    seed.main()
    with SessionLocal() as db:
        counts = [db.scalar(select(func.count()).select_from(m)) for m in (Robot, Reservation, Ticket, User)]
    assert counts[0] == 5 and all(counts), counts

    seed.main()  # a second run must not duplicate anything
    assert "nothing to do" in capsys.readouterr().out
    with SessionLocal() as db:
        assert [db.scalar(select(func.count()).select_from(m)) for m in (Robot, Reservation, Ticket, User)] == counts


def test_seeded_data_is_usable_through_the_api(client):
    seed.main()
    headers = login(client, "lena", "demo-pass")
    robots = client.get("/api/robots", headers=headers).json()
    assert {r["name"] for r in robots} >= {"Franka 1", "Tiago"}
    stats = client.get("/api/stats", headers=headers).json()
    assert stats["totals"]["reservations"] > 0
