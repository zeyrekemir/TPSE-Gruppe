"""Features from the client's first meeting: staff over students, robot specification, who used a robot last,
log procedure and attachments, uptime/downtime and the student/staff share."""

from datetime import timedelta

import pytest
from sqlalchemy import select, update

from app import notify
from app.config import get_settings
from app.db import SessionLocal
from app.models import Reservation, RobotStatusChange, utcnow


def _iso(delta_hours: float) -> str:
    return (utcnow() + timedelta(hours=delta_hours)).isoformat()


def _user_id(client, headers) -> int:
    return client.get("/api/auth/me", headers=headers).json()["id"]


@pytest.fixture
def staff(client, admin, make_member):
    headers = make_member("bob")
    client.patch(f"/api/users/{_user_id(client, headers)}", headers=admin, json={"member_type": "staff"})
    return headers


@pytest.fixture
def outbox(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", "smtp.test")
    sent = []
    monkeypatch.setattr(notify, "_send_email", lambda _s, to, subject, text: sent.append((to, subject)))
    return sent


def _book(client, headers, robot, start=2, end=4, **extra):
    return client.post(
        "/api/reservations",
        headers=headers,
        json={"robot_id": robot["id"], "start": _iso(start), "end": _iso(end), **extra},
    )


# --- Staff and students ---

def test_new_people_are_students_and_admins_can_make_them_staff(client, admin, member):
    me = client.get("/api/auth/me", headers=member).json()
    assert me["member_type"] == "student"
    r = client.patch(f"/api/users/{me['id']}", headers=admin, json={"member_type": "staff"})
    assert r.status_code == 200 and r.json()["member_type"] == "staff"
    # Members cannot promote themselves.
    assert client.patch(f"/api/users/{me['id']}", headers=member, json={"member_type": "staff"}).status_code == 403


def test_staff_override_a_students_booking_and_the_student_is_told(client, admin, member, staff, robot, outbox):
    client.patch("/api/auth/me", headers=member, json={"email": "alice@lab.test", "language": "en"})
    assert _book(client, member, robot).status_code == 201

    clash = _book(client, staff, robot, 3, 5)
    assert clash.status_code == 409
    assert clash.json()["detail"]["can_override"] is True

    r = _book(client, staff, robot, 3, 5, override=True)
    assert r.status_code == 201, r.text
    bookings = client.get("/api/reservations", headers=admin, params={"robot_id": robot["id"]}).json()
    assert [b["user"]["username"] for b in bookings] == ["bob"]
    (to, subject), = outbox
    assert to == ["alice@lab.test"] and subject.startswith("Reservation replaced: Franka 1")


def test_students_cannot_override_staff_or_each_other(client, make_member, staff, robot):
    student = make_member("carol")
    assert _book(client, staff, robot).status_code == 201
    clash = _book(client, student, robot, 3, 5, override=True)
    assert clash.status_code == 409
    assert clash.json()["detail"]["can_override"] is False

    other = make_member("dave")
    assert _book(client, other, robot, 10, 12).status_code == 201
    assert _book(client, student, robot, 11, 13, override=True).status_code == 409


def test_staff_cannot_override_other_staff_but_admins_can(client, admin, make_member, staff, robot):
    colleague = make_member("erin")
    client.patch(f"/api/users/{_user_id(client, colleague)}", headers=admin, json={"member_type": "staff"})
    assert _book(client, staff, robot).status_code == 201
    assert _book(client, colleague, robot, 3, 5, override=True).status_code == 409
    assert _book(client, admin, robot, 3, 5, override=True).status_code == 201


def test_moving_a_booking_onto_a_students_slot_can_override_too(client, member, staff, robot):
    assert _book(client, member, robot, 2, 4).status_code == 201
    mine = _book(client, staff, robot, 6, 8).json()
    move = {"start": _iso(3), "end": _iso(5)}
    assert client.patch(f"/api/reservations/{mine['id']}", headers=staff, json=move).status_code == 409
    r = client.patch(f"/api/reservations/{mine['id']}", headers=staff, json=move | {"override": True})
    assert r.status_code == 200, r.text


# --- Robot specification and last use ---

def test_robot_specification_and_equipment(client, admin, member, robot):
    r = client.patch(
        f"/api/robots/{robot['id']}",
        headers=admin,
        json={"firmware": "5.6.0", "operating_system": "Ubuntu 22.04", "equipment": [" Franka Hand ", "RealSense D435"]},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["firmware"] == "5.6.0" and body["operating_system"] == "Ubuntu 22.04"
    assert body["equipment"] == ["Franka Hand", "RealSense D435"]

    # The responsible person may keep the specification current; other members may not.
    client.patch(f"/api/robots/{robot['id']}", headers=admin, json={"responsible_user_id": _user_id(client, member)})
    assert client.patch(f"/api/robots/{robot['id']}", headers=member, json={"equipment": []}).status_code == 200
    assert client.patch(f"/api/robots/{robot['id']}", headers=member, json={"name": "Mine"}).status_code == 403

    assert client.patch(f"/api/robots/{robot['id']}", headers=admin, json={"equipment": [""]}).status_code == 422
    assert client.patch(f"/api/robots/{robot['id']}", headers=admin, json={"equipment": ["x"] * 51}).status_code == 422


def test_robot_shows_who_used_it_last(client, admin, member, staff, robot):
    assert client.get(f"/api/robots/{robot['id']}", headers=member).json()["last_use"] is None
    _book(client, member, robot, 1, 2)
    # Bookings cannot be made in the past, so move them back in the database.
    with SessionLocal() as db:
        db.execute(
            update(Reservation).values(start=utcnow() - timedelta(hours=5), end=utcnow() - timedelta(hours=4))
        )
        db.commit()
    _book(client, staff, robot, 10, 11)  # upcoming: not a "last use"
    last = client.get(f"/api/robots/{robot['id']}", headers=member).json()["last_use"]
    assert last["user"]["username"] == "alice"


# --- Log procedure and attachments ---

@pytest.fixture
def log(client, member, robot):
    r = client.post(
        "/api/logs",
        headers=member,
        json={
            "robot_id": robot["id"],
            "date": _iso(0),
            "title": "Grasp test",
            "procedure": "1. Home pose\n2. Grasp 50 times",
            "result": "success",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["procedure"].startswith("1. Home pose")
    return r.json()


def test_attachments_upload_list_download_delete(client, member, make_member, log):
    url = f"/api/logs/{log['id']}/attachments"
    r = client.post(url, headers=member, files={"file": ("../plot.png", b"\x89PNG data", "image/png")})
    assert r.status_code == 201, r.text
    attachment = r.json()
    assert attachment["filename"] == "plot.png" and attachment["size"] == 9

    other = make_member("frank")
    listed = client.get("/api/logs", headers=other).json()[0]["attachments"]
    assert [a["filename"] for a in listed] == ["plot.png"]

    got = client.get(f"{url}/{attachment['id']}", headers=other)
    assert got.status_code == 200 and got.content == b"\x89PNG data"
    assert got.headers["content-disposition"].startswith("attachment;")
    assert got.headers["x-content-type-options"] == "nosniff"

    # Only the author (or an admin) adds or removes files.
    assert client.post(url, headers=other, files={"file": ("x.txt", b"x", "text/plain")}).status_code == 403
    assert client.delete(f"{url}/{attachment['id']}", headers=other).status_code == 403
    assert client.delete(f"{url}/{attachment['id']}", headers=member).status_code == 204
    assert client.get(f"{url}/{attachment['id']}", headers=member).status_code == 404


def test_html_attachments_are_never_served_as_html(client, member, log):
    url = f"/api/logs/{log['id']}/attachments"
    a = client.post(url, headers=member, files={"file": ("x.html", b"<script>alert(1)</script>", "text/html")}).json()
    got = client.get(f"{url}/{a['id']}", headers=member)
    assert got.headers["content-type"] == "application/octet-stream"


def test_attachment_limits(client, member, log, monkeypatch):
    from app.routers import logs

    url = f"/api/logs/{log['id']}/attachments"
    monkeypatch.setattr(logs, "MAX_ATTACHMENT_BYTES", 10)
    assert client.post(url, headers=member, files={"file": ("big.bin", b"x" * 11)}).status_code == 413
    assert client.post(url, headers=member, files={"file": ("empty.bin", b"")}).status_code == 400
    monkeypatch.setattr(logs, "MAX_ATTACHMENTS_PER_LOG", 1)
    assert client.post(url, headers=member, files={"file": ("a.bin", b"a")}).status_code == 201
    assert client.post(url, headers=member, files={"file": ("b.bin", b"b")}).status_code == 400


def test_deleting_a_log_deletes_its_files(client, member, log):
    client.post(f"/api/logs/{log['id']}/attachments", headers=member, files={"file": ("a.bin", b"a")})
    assert client.delete(f"/api/logs/{log['id']}", headers=member).status_code == 204
    with SessionLocal() as db:
        from app.models import LogAttachment

        assert db.scalars(select(LogAttachment)).all() == []


# --- Status history, uptime, student/staff share ---

def test_every_status_change_is_recorded(client, admin, member, robot):
    client.patch(f"/api/robots/{robot['id']}", headers=admin, json={"status": "maintenance"})
    client.patch(f"/api/robots/{robot['id']}", headers=admin, json={"location": "elsewhere"})  # no status change
    t = client.post(
        "/api/tickets",
        headers=member,
        json={"robot_id": robot["id"], "kind": "fault", "title": "Stuck", "mark_robot_defect": True},
    ).json()
    client.patch(f"/api/tickets/{t['id']}", headers=admin, json={"status": "resolved"})
    with SessionLocal() as db:
        history = db.scalars(select(RobotStatusChange.status).order_by(RobotStatusChange.id)).all()
    assert [s.value for s in history] == ["available", "maintenance", "defect", "available"]


def test_uptime_and_downtime(client, admin, robot):
    now = utcnow()
    with SessionLocal() as db:
        # 10 h available, then 2 h defect, then available again until now.
        db.execute(update(RobotStatusChange).values(changed_at=now - timedelta(hours=14)))
        from app.models import RobotStatus

        db.add(RobotStatusChange(robot_id=robot["id"], status=RobotStatus.defect, changed_at=now - timedelta(hours=4)))
        db.add(RobotStatusChange(robot_id=robot["id"], status=RobotStatus.available, changed_at=now - timedelta(hours=2)))
        db.commit()
    stats = client.get("/api/stats", headers=admin, params={"days": 7}).json()
    row = stats["robots"][0]
    assert row["down_hours"] == pytest.approx(2, abs=0.1)
    assert row["up_hours"] == pytest.approx(12, abs=0.1)
    assert row["uptime"] == pytest.approx(12 / 14, abs=0.01)
    assert stats["totals"]["down_hours"] == pytest.approx(2, abs=0.1)


def test_booked_hours_by_students_and_staff(client, member, staff, robot):
    _book(client, member, robot, 1, 4)  # 3 h by a student
    _book(client, staff, robot, 5, 6)  # 1 h by staff
    with SessionLocal() as db:  # move both into the past, inside the stats window
        for r in db.scalars(select(Reservation)):
            r.start -= timedelta(hours=10)
            r.end -= timedelta(hours=10)
        db.commit()
    groups = client.get("/api/stats", headers=member, params={"days": 7}).json()["by_group"]
    assert groups["student"] == {"hours": 3.0, "share": 0.75}
    assert groups["staff"] == {"hours": 1.0, "share": 0.25}
    assert groups["admin"]["hours"] == 0


def test_erasing_a_person_makes_them_a_student_again(client, admin, staff):
    uid = _user_id(client, staff)
    assert client.post(f"/api/users/{uid}/erase", headers=admin).json()["member_type"] == "student"

