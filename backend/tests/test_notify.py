from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app import notify
from app.config import get_settings
from app.db import SessionLocal
from app.models import Reservation, utcnow


@pytest.fixture
def outbox(monkeypatch):
    """Turn both channels on and capture what would be sent."""
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", "smtp.test")
    monkeypatch.setattr(settings, "discord_webhook_url", "https://discord.test/hook")
    sent = {"email": [], "texts": [], "discord": []}

    def capture_email(_settings, to, subject, text):
        sent["email"].append((to, subject))
        sent["texts"].append(text)

    monkeypatch.setattr(notify, "_send_email", capture_email)
    monkeypatch.setattr(notify, "_send_discord", lambda s, subject, text: sent["discord"].append(subject))
    return sent


def set_email(client, headers, email, language="en"):
    # The existing tests read English mails; the language tests below switch to German explicitly.
    client.patch("/api/auth/me", headers=headers, json={"email": email, "language": language})


def test_fault_notifies_responsible_admins_and_discord(client, admin, member, robot, outbox):
    set_email(client, admin, "admin@lab.test")
    set_email(client, member, "alice@lab.test")
    alice_id = client.get("/api/auth/me", headers=member).json()["id"]
    client.patch(f"/api/robots/{robot['id']}", headers=admin, json={"responsible_user_id": alice_id})

    r = client.post("/api/tickets", headers=member, json={"robot_id": robot["id"], "kind": "fault", "title": "Gripper stuck"})
    assert r.status_code == 201
    (recipients, subject), = outbox["email"]
    assert recipients == ["admin@lab.test", "alice@lab.test"]
    assert "Gripper stuck" in subject and "Franka 1" in subject
    assert len(outbox["discord"]) == 1


def test_maintenance_ticket_does_not_mail_admins(client, admin, member, robot, outbox):
    set_email(client, admin, "admin@lab.test")
    client.post("/api/tickets", headers=member, json={"robot_id": robot["id"], "kind": "maintenance", "title": "Calibrate"})
    assert outbox["email"] == []  # no responsible person set, admins only hear about faults


def test_status_change_notifies_reporter_not_actor(client, admin, member, robot, outbox):
    set_email(client, member, "alice@lab.test")
    set_email(client, admin, "admin@lab.test")
    t = client.post("/api/tickets", headers=member, json={"robot_id": robot["id"], "kind": "maintenance", "title": "Oil"}).json()
    outbox["email"].clear()
    client.patch(f"/api/tickets/{t['id']}", headers=admin, json={"status": "resolved"})
    assert outbox["email"] == [(["alice@lab.test"], 'Franka 1: "Oil" is now resolved')]
    # A plain comment is not a status change: nothing is sent.
    outbox["email"].clear()
    client.patch(f"/api/tickets/{t['id']}", headers=admin, json={"comment": "done"})
    assert outbox["email"] == []


def test_broken_mail_server_does_not_fail_the_request(client, member, admin, robot, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", "smtp.test")
    set_email(client, admin, "admin@lab.test")

    def boom(*_):
        raise OSError("connection refused")

    monkeypatch.setattr(notify, "_send_email", boom)
    r = client.post("/api/tickets", headers=member, json={"robot_id": robot["id"], "kind": "fault", "title": "x"})
    assert r.status_code == 201


def test_nothing_sent_when_not_configured(client, member, admin, robot, monkeypatch):
    calls = []
    monkeypatch.setattr(notify, "_send_email", lambda *a: calls.append(a))
    monkeypatch.setattr(notify, "_send_discord", lambda *a: calls.append(a))
    set_email(client, admin, "admin@lab.test")
    client.post("/api/tickets", headers=member, json={"robot_id": robot["id"], "kind": "fault", "title": "x"})
    assert calls == []


def test_reminders_sent_once_and_only_when_due(client, member, robot, outbox):
    set_email(client, member, "alice@lab.test")
    me = client.get("/api/auth/me", headers=member).json()
    now = utcnow()
    with SessionLocal() as db:
        db.add_all([
            Reservation(robot_id=robot["id"], user_id=me["id"], start=now + timedelta(minutes=10), end=now + timedelta(hours=1)),
            Reservation(robot_id=robot["id"], user_id=me["id"], start=now + timedelta(hours=5), end=now + timedelta(hours=6)),
        ])
        db.commit()

    assert notify.send_due_reminders() == 1
    assert notify.send_due_reminders() == 0
    (recipients, subject), = outbox["email"]
    assert recipients == ["alice@lab.test"] and subject.startswith("Reminder: Franka 1")


def test_each_recipient_gets_their_language(client, admin, member, robot, outbox):
    set_email(client, admin, "admin@lab.test", language="en")
    set_email(client, member, "alice@lab.test", language="de")
    alice_id = client.get("/api/auth/me", headers=member).json()["id"]
    client.patch(f"/api/robots/{robot['id']}", headers=admin, json={"responsible_user_id": alice_id})

    client.post("/api/tickets", headers=admin, json={"robot_id": robot["id"], "kind": "fault", "title": "Greifer klemmt"})
    # One mail per language, each to the people who chose it.
    assert sorted(outbox["email"]) == [
        (["admin@lab.test"], "Fault reported: Franka 1 – Greifer klemmt"),
        (["alice@lab.test"], "Störung gemeldet: Franka 1 – Greifer klemmt"),
    ]
    # The shared Discord channel gets the configured language (German by default).
    assert outbox["discord"] == ["Störung gemeldet: Franka 1 – Greifer klemmt"]


def test_status_change_in_german(client, admin, member, robot, outbox):
    set_email(client, member, "alice@lab.test", language="de")
    t = client.post("/api/tickets", headers=member, json={"robot_id": robot["id"], "kind": "maintenance", "title": "Öl"}).json()
    client.patch(f"/api/tickets/{t['id']}", headers=admin, json={"status": "in_progress"})
    assert outbox["email"][-1] == (["alice@lab.test"], "Franka 1: „Öl“ ist jetzt in Bearbeitung")


def test_reminder_shows_lab_time(client, member, robot, outbox):
    """The reservation starts 14:00 in Darmstadt (12:00 UTC in summer): the mail says 14:00."""
    set_email(client, member, "alice@lab.test", language="de")
    me = client.get("/api/auth/me", headers=member).json()
    start = datetime(2026, 7, 1, 12, 0, tzinfo=UTC)
    with SessionLocal() as db:
        db.add(Reservation(robot_id=robot["id"], user_id=me["id"], start=start, end=start + timedelta(hours=1)))
        db.commit()
        reservation = db.scalars(select(Reservation)).one()
        message = notify.reservation_reminder(reservation)
    assert message.subject("de") == "Erinnerung: Franka 1 am 01.07.2026 um 14:00 Uhr"
    assert message.subject("en") == "Reminder: Franka 1 on 01 Jul 2026 at 14:00 (CEST)"
    # In winter Germany is UTC+1.
    assert notify.lab_time(datetime(2026, 12, 1, 12, 0, tzinfo=UTC), "de") == "01.12.2026 um 13:00 Uhr"
