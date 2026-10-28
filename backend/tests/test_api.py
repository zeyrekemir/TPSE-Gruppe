from datetime import UTC, datetime, timedelta

from tests.conftest import login


def iso(dt: datetime) -> str:
    return dt.isoformat()


def at(hours: float) -> datetime:
    """A time `hours` from now, rounded to the minute so comparisons are stable."""
    return (datetime.now(UTC) + timedelta(hours=hours)).replace(second=0, microsecond=0)


def reserve(client, headers, robot_id, start, end, purpose=None):
    return client.post(
        "/api/reservations",
        headers=headers,
        json={"robot_id": robot_id, "start": iso(start), "end": iso(end), "purpose": purpose},
    )


# --- auth & users ---

def test_login_and_me(client, admin):
    r = client.get("/api/auth/me", headers=admin)
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


def test_wrong_password_rejected(client):
    r = client.post("/api/auth/login", data={"username": "admin", "password": "nope"})
    assert r.status_code == 401


def test_requests_without_token_rejected(client):
    assert client.get("/api/robots").status_code == 401


def test_member_cannot_create_users_or_robots(client, member):
    r = client.post("/api/users", headers=member, json={"username": "bob", "display_name": "B", "password": "12345678"})
    assert r.status_code == 403
    r = client.post("/api/robots", headers=member, json={"name": "X", "type": "Y", "location": "Z"})
    assert r.status_code == 403


def test_deactivated_user_cannot_log_in(client, admin, member):
    alice = next(u for u in client.get("/api/users", headers=admin).json() if u["username"] == "alice")
    client.patch(f"/api/users/{alice['id']}", headers=admin, json={"is_active": False})
    r = client.post("/api/auth/login", data={"username": "alice", "password": "secret-pass"})
    assert r.status_code == 401
    assert client.get("/api/auth/me", headers=member).status_code == 401


def test_admin_cannot_demote_self(client, admin):
    me = client.get("/api/auth/me", headers=admin).json()
    r = client.patch(f"/api/users/{me['id']}", headers=admin, json={"role": "member"})
    assert r.status_code == 400


def test_language_preference(client, member):
    r = client.patch("/api/auth/me", headers=member, json={"language": "en"})
    assert r.json()["language"] == "en"
    assert client.patch("/api/auth/me", headers=member, json={"language": "fr"}).status_code == 422


# --- robots ---

def test_robot_crud_and_unique_name(client, admin, robot):
    r = client.post("/api/robots", headers=admin, json={"name": "Franka 1", "type": "x", "location": "y"})
    assert r.status_code == 409
    r = client.patch(
        f"/api/robots/{robot['id']}", headers=admin, json={"documentation_url": "https://wiki.example.org/franka"}
    )
    assert r.json()["documentation_url"] == "https://wiki.example.org/franka"
    assert client.delete(f"/api/robots/{robot['id']}", headers=admin).status_code == 204
    assert client.get(f"/api/robots/{robot['id']}", headers=admin).status_code == 404


def test_responsible_person_may_change_status_only(client, admin, member, robot):
    alice_id = client.get("/api/auth/me", headers=member).json()["id"]
    client.patch(f"/api/robots/{robot['id']}", headers=admin, json={"responsible_user_id": alice_id})
    r = client.patch(f"/api/robots/{robot['id']}", headers=member, json={"status": "maintenance"})
    assert r.status_code == 200 and r.json()["status"] == "maintenance"
    r = client.patch(f"/api/robots/{robot['id']}", headers=member, json={"name": "Renamed"})
    assert r.status_code == 403


def test_availability_shows_reserved_during_reservation(client, member, robot):
    assert client.get(f"/api/robots/{robot['id']}", headers=member).json()["availability"] == "available"
    reserve(client, member, robot["id"], at(-0.5), at(1))
    data = client.get(f"/api/robots/{robot['id']}", headers=member).json()
    assert data["availability"] == "reserved"
    assert data["current_reservation_id"] is not None


# --- reservations ---

def test_reservation_conflict_suggests_next_free_slot(client, member, make_member, robot):
    bob = make_member("bob")
    assert reserve(client, member, robot["id"], at(1), at(3)).status_code == 201
    assert reserve(client, member, robot["id"], at(3), at(4)).status_code == 201

    r = reserve(client, bob, robot["id"], at(2), at(3))
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert len(detail["conflicts"]) == 1
    # Two back-to-back bookings until +4h, so the first free 1h slot starts at +4h.
    assert datetime.fromisoformat(detail["suggested_start"]) == at(4)
    assert datetime.fromisoformat(detail["suggested_end"]) == at(5)

    # Touching edges are not conflicts.
    assert reserve(client, bob, robot["id"], at(4), at(5)).status_code == 201


def test_suggested_slot_fits_in_gap(client, member, robot):
    reserve(client, member, robot["id"], at(1), at(2))
    reserve(client, member, robot["id"], at(3), at(4))
    r = reserve(client, member, robot["id"], at(1.5), at(2.5))
    assert datetime.fromisoformat(r.json()["detail"]["suggested_start"]) == at(2)


def test_reservation_validation(client, member, admin, robot):
    assert reserve(client, member, robot["id"], at(2), at(1)).status_code == 422
    assert reserve(client, member, robot["id"], at(-3), at(-2)).status_code == 400
    r = client.post(
        "/api/reservations",
        headers=member,
        json={"robot_id": robot["id"], "start": "2030-01-01T10:00:00", "end": "2030-01-01T11:00:00"},
    )
    assert r.status_code == 422, "naive datetimes must be rejected"
    client.patch(f"/api/robots/{robot['id']}", headers=admin, json={"status": "defect"})
    assert reserve(client, member, robot["id"], at(1), at(2)).status_code == 400


def test_booking_rules_limit_members_not_admins(client, member, admin, robot, monkeypatch):
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "max_reservation_hours", 4)
    monkeypatch.setattr(settings, "max_advance_days", 14)

    r = reserve(client, member, robot["id"], at(1), at(6))
    assert r.status_code == 400 and "at most 4 hours" in r.json()["detail"]
    r = reserve(client, member, robot["id"], at(24 * 20), at(24 * 20 + 1))
    assert r.status_code == 400 and "14 days ahead" in r.json()["detail"]
    ok = reserve(client, member, robot["id"], at(1), at(5))
    assert ok.status_code == 201
    # Stretching an existing booking past the limit is caught too.
    r = client.patch(f"/api/reservations/{ok.json()['id']}", headers=member, json={"end": iso(at(7))})
    assert r.status_code == 400
    # Admins may book outside the rules (e.g. maintenance windows).
    assert reserve(client, admin, robot["id"], at(30), at(40)).status_code == 201


def test_only_owner_or_admin_can_change_reservation(client, member, make_member, admin, robot):
    bob = make_member("bob")
    res = reserve(client, member, robot["id"], at(1), at(2)).json()
    assert client.delete(f"/api/reservations/{res['id']}", headers=bob).status_code == 403
    r = client.patch(f"/api/reservations/{res['id']}", headers=member, json={"end": iso(at(3))})
    assert r.status_code == 200
    assert client.delete(f"/api/reservations/{res['id']}", headers=admin).status_code == 204


def test_moving_reservation_into_conflict(client, member, robot):
    reserve(client, member, robot["id"], at(1), at(2))
    second = reserve(client, member, robot["id"], at(3), at(4)).json()
    r = client.patch(f"/api/reservations/{second['id']}", headers=member, json={"start": iso(at(1.5))})
    assert r.status_code == 409


def test_calendar_window_filter(client, member, robot):
    reserve(client, member, robot["id"], at(1), at(2))
    reserve(client, member, robot["id"], at(30), at(31))
    r = client.get("/api/reservations", headers=member, params={"start": iso(at(0)), "end": iso(at(24))})
    assert len(r.json()) == 1


# --- tickets ---

def test_fault_report_marks_robot_defect_and_resolution_restores_it(client, member, admin, robot):
    r = client.post(
        "/api/tickets",
        headers=member,
        json={"robot_id": robot["id"], "kind": "fault", "title": "Gripper stuck", "mark_robot_defect": True},
    )
    ticket = r.json()
    assert client.get(f"/api/robots/{robot['id']}", headers=member).json()["status"] == "defect"
    assert client.get(f"/api/robots/{robot['id']}", headers=member).json()["open_tickets"] == 1

    client.patch(f"/api/tickets/{ticket['id']}", headers=admin, json={"status": "in_progress"})
    r = client.patch(f"/api/tickets/{ticket['id']}", headers=admin, json={"status": "resolved", "comment": "Replaced"})
    data = r.json()
    assert data["resolved_at"] is not None
    assert [(e["old_status"], e["new_status"]) for e in data["events"]] == [
        (None, "open"),
        ("open", "in_progress"),
        ("in_progress", "resolved"),
    ]
    assert client.get(f"/api/robots/{robot['id']}", headers=member).json()["status"] == "available"


def test_robot_stays_defect_while_other_tickets_open(client, member, admin, robot):
    ids = [
        client.post(
            "/api/tickets",
            headers=member,
            json={"robot_id": robot["id"], "kind": "fault", "title": t, "mark_robot_defect": True},
        ).json()["id"]
        for t in ("A", "B")
    ]
    client.patch(f"/api/tickets/{ids[0]}", headers=admin, json={"status": "resolved"})
    assert client.get(f"/api/robots/{robot['id']}", headers=member).json()["status"] == "defect"


def test_ticket_reports_robot_responsible(client, admin, member, robot):
    alice_id = client.get("/api/auth/me", headers=member).json()["id"]
    client.patch(f"/api/robots/{robot['id']}", headers=admin, json={"responsible_user_id": alice_id})
    t = client.post("/api/tickets", headers=admin, json={"robot_id": robot["id"], "kind": "fault", "title": "x"}).json()
    assert t["robot_responsible_id"] == alice_id
    # ...and the backend agrees she may change its status.
    assert client.patch(f"/api/tickets/{t['id']}", headers=member, json={"status": "in_progress"}).status_code == 200


def test_others_may_comment_but_not_change_status(client, member, make_member, robot):
    bob = make_member("bob")
    t = client.post(
        "/api/tickets", headers=member, json={"robot_id": robot["id"], "kind": "maintenance", "title": "Calibrate"}
    ).json()
    assert client.patch(f"/api/tickets/{t['id']}", headers=bob, json={"comment": "Me too"}).status_code == 200
    assert client.patch(f"/api/tickets/{t['id']}", headers=bob, json={"status": "resolved"}).status_code == 403
    assert client.patch(f"/api/tickets/{t['id']}", headers=member, json={"status": "resolved"}).status_code == 200


def test_ticket_filters(client, member, robot):
    client.post("/api/tickets", headers=member, json={"robot_id": robot["id"], "kind": "fault", "title": "x"})
    assert len(client.get("/api/tickets", headers=member, params={"status": "open"}).json()) == 1
    assert len(client.get("/api/tickets", headers=member, params={"status": "resolved"}).json()) == 0


# --- experiment logs ---

def test_experiment_logs(client, member, make_member, robot):
    bob = make_member("bob")
    r = client.post(
        "/api/logs",
        headers=member,
        json={"robot_id": robot["id"], "date": iso(at(-2)), "title": "Grasping", "result": "partial"},
    )
    assert r.status_code == 201
    entry = r.json()
    assert entry["robot_name"] == "Franka 1"
    assert entry["user"]["username"] == "alice"
    assert client.patch(f"/api/logs/{entry['id']}", headers=bob, json={"result": "success"}).status_code == 403
    assert len(client.get("/api/logs", headers=bob, params={"robot_id": robot["id"]}).json()) == 1


def test_deleting_robot_removes_its_records(client, admin, member, robot):
    reserve(client, member, robot["id"], at(1), at(2))
    client.post("/api/logs", headers=member, json={"robot_id": robot["id"], "date": iso(at(-1)), "title": "t", "result": "success"})
    client.delete(f"/api/robots/{robot['id']}", headers=admin)
    assert client.get("/api/reservations", headers=admin).json() == []
    assert client.get("/api/logs", headers=admin).json() == []
