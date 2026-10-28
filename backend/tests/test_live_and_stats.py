from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.config import get_settings
from app.db import SessionLocal
from app.models import ExperimentLog, ExperimentResult, Reservation, Robot, Ticket, TicketKind, TicketStatus, utcnow

# --- live status ---


def make_key(client, admin, robot_id):
    r = client.post(f"/api/robots/{robot_id}/api-key", headers=admin)
    assert r.status_code == 200
    return r.json()["api_key"]


def beat(client, robot_id, key, **body):
    return client.post(f"/api/robots/{robot_id}/heartbeat", headers={"X-Robot-Key": key}, json=body)


def test_robot_without_key_has_no_live_status(client, member, robot):
    data = client.get(f"/api/robots/{robot['id']}", headers=member).json()
    assert data["live"] is None and data["has_api_key"] is False


def test_heartbeat_makes_robot_online(client, admin, member, robot):
    key = make_key(client, admin, robot["id"])
    data = client.get(f"/api/robots/{robot['id']}", headers=member).json()
    assert data["live"]["online"] is False  # key exists, nothing heard yet

    assert beat(client, robot["id"], key, state="running", battery=81.5, message="pick-and-place").status_code == 204
    live = client.get(f"/api/robots/{robot['id']}", headers=member).json()["live"]
    assert (live["online"], live["state"], live["battery"], live["message"]) == (True, "running", 81.5, "pick-and-place")


def test_robot_goes_offline_after_timeout(client, admin, member, robot, monkeypatch):
    key = make_key(client, admin, robot["id"])
    beat(client, robot["id"], key)
    with SessionLocal() as db:
        db.get(Robot, robot["id"]).last_seen_at = utcnow() - timedelta(seconds=get_settings().live_timeout_seconds + 5)
        db.commit()
    assert client.get(f"/api/robots/{robot['id']}", headers=member).json()["live"]["online"] is False


def test_heartbeat_rejects_bad_keys(client, admin, robot):
    key = make_key(client, admin, robot["id"])
    assert beat(client, robot["id"], "rbk_wrong").status_code == 401
    assert beat(client, 9999, key).status_code == 401
    assert client.post(f"/api/robots/{robot['id']}/heartbeat", json={}).status_code == 401
    # A new key replaces the old one; revoking removes it.
    new_key = make_key(client, admin, robot["id"])
    assert beat(client, robot["id"], key).status_code == 401
    assert beat(client, robot["id"], new_key).status_code == 204
    client.delete(f"/api/robots/{robot['id']}/api-key", headers=admin)
    assert beat(client, robot["id"], new_key).status_code == 401


def test_only_admins_manage_keys(client, member, robot):
    assert client.post(f"/api/robots/{robot['id']}/api-key", headers=member).status_code == 403


def test_heartbeat_validation(client, admin, robot):
    key = make_key(client, admin, robot["id"])
    assert beat(client, robot["id"], key, battery=150).status_code == 422
    assert beat(client, robot["id"], key, state="Not A State!").status_code == 422


# --- statistics ---

BERLIN = ZoneInfo("Europe/Berlin")


def last_wednesday_10am():
    today = datetime.now(BERLIN).replace(hour=10, minute=0, second=0, microsecond=0)
    days_back = (today.weekday() - 2) % 7 or 7  # strictly in the past
    return today - timedelta(days=days_back)


@pytest.fixture
def history(client, member, robot):
    """Two booked hours on a past Wednesday 10–12 (Berlin), one resolved fault, two experiments."""
    me = client.get("/api/auth/me", headers=member).json()
    start = last_wednesday_10am()
    with SessionLocal() as db:
        db.add(Reservation(robot_id=robot["id"], user_id=me["id"], start=start, end=start + timedelta(hours=2)))
        ticket = Ticket(robot_id=robot["id"], reporter_id=me["id"], kind=TicketKind.fault, title="x",
                        status=TicketStatus.resolved)
        ticket.created_at = utcnow() - timedelta(hours=10)
        ticket.resolved_at = ticket.created_at + timedelta(hours=4)
        db.add(ticket)
        db.add_all([
            ExperimentLog(robot_id=robot["id"], user_id=me["id"], date=start, title="a", result=ExperimentResult.success),
            ExperimentLog(robot_id=robot["id"], user_id=me["id"], date=start, title="b", result=ExperimentResult.failure),
        ])
        db.commit()
    return start


def test_stats(client, member, robot, history):
    s = client.get("/api/stats", headers=member, params={"days": 30}).json()
    assert s["totals"]["reservations"] == 1
    assert s["totals"]["reserved_hours"] == 2
    assert s["totals"]["mean_time_to_resolve_hours"] == 4
    assert s["totals"]["experiment_success_rate"] == 0.5

    (franka,) = s["robots"]
    assert franka["reserved_hours"] == 2 and franka["tickets_opened"] == 1
    # Utilisation is relative to lab hours (Mon–Fri 08–18) in the window.
    assert franka["utilization"] == pytest.approx(2 / s["range"]["lab_hours"], abs=0.001)

    assert s["heatmap"][2][10] == 1 and s["heatmap"][2][11] == 1  # Wednesday, 10:00 and 11:00
    assert sum(map(sum, s["heatmap"])) == 2
    assert s["top_users"][0]["display_name"] == "Alice"
    assert sum(d["hours"] for d in s["daily"]) == 2
    assert next(d for d in s["daily"] if d["date"] == history.date().isoformat())["hours"] == 2


def test_stats_window_clips_old_bookings(client, member, robot, history):
    s = client.get("/api/stats", headers=member, params={"days": 1}).json()
    assert s["totals"]["reserved_hours"] == 0


def test_stats_requires_login(client):
    assert client.get("/api/stats").status_code == 401
