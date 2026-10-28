"""Data protection rights: erasing a person (Art. 17 GDPR) and downloading one's own data (Art. 15/20)."""

from datetime import timedelta

from app.db import SessionLocal
from app.models import Reservation, utcnow
from tests.conftest import login


def me(client, headers):
    return client.get("/api/auth/me", headers=headers).json()


def book(robot_id, user_id, hours_from_now):
    start = utcnow() + timedelta(hours=hours_from_now)
    with SessionLocal() as db:
        db.add(Reservation(robot_id=robot_id, user_id=user_id, start=start, end=start + timedelta(hours=1), purpose="Grasping"))
        db.commit()


def test_export_contains_only_my_data(client, admin, member, robot):
    client.patch("/api/auth/me", headers=member, json={"email": "alice@lab.test"})
    alice = me(client, member)
    book(robot["id"], alice["id"], 5)
    book(robot["id"], me(client, admin)["id"], 9)  # someone else's
    client.post("/api/tickets", headers=member, json={"robot_id": robot["id"], "kind": "fault", "title": "Gripper stuck"})
    client.post("/api/logs", headers=member, json={"robot_id": robot["id"], "date": utcnow().isoformat(), "title": "Grasp test", "result": "success"})

    r = client.get("/api/auth/me/export", headers=member)
    assert r.status_code == 200
    assert "attachment" in r.headers["content-disposition"]
    data = r.json()
    assert data["account"]["username"] == "alice" and data["account"]["email"] == "alice@lab.test"
    assert len(data["reservations"]) == 1 and data["reservations"][0]["robot"] == "Franka 1"
    assert [t["title"] for t in data["reports"]] == ["Gripper stuck"]
    assert [log["title"] for log in data["experiment_logs"]] == ["Grasp test"]
    assert client.get("/api/auth/me/export").status_code == 401


def test_erase_removes_the_person_and_keeps_the_records(client, admin, member, robot):
    client.patch("/api/auth/me", headers=member, json={"email": "alice@lab.test"})
    alice = me(client, member)
    client.patch(f"/api/robots/{robot['id']}", headers=admin, json={"responsible_user_id": alice["id"]})
    book(robot["id"], alice["id"], -48)  # past: kept as a lab record
    book(robot["id"], alice["id"], 24)  # future: cancelled
    client.post("/api/tickets", headers=member, json={"robot_id": robot["id"], "kind": "fault", "title": "Gripper stuck"})

    r = client.post(f"/api/users/{alice['id']}/erase", headers=admin)
    assert r.status_code == 200
    erased = r.json()
    label = f"[deleted #{alice['id']}]"
    assert (erased["username"], erased["display_name"], erased["email"], erased["is_active"]) == (label, label, None, False)

    reservations = client.get("/api/reservations", headers=admin).json()
    assert len(reservations) == 1 and reservations[0]["start"] < utcnow().isoformat()
    assert client.get(f"/api/robots/{robot['id']}", headers=admin).json()["responsible_user"] is None
    tickets = client.get("/api/tickets", headers=admin).json()
    assert [t["title"] for t in tickets] == ["Gripper stuck"]  # the report stays, under the label

    # The old sign-in no longer works, and the name is free for a new account.
    assert client.post("/api/auth/login", data={"username": "alice", "password": "secret-pass"}).status_code == 401
    r = client.post("/api/users", headers=admin, json={"username": "alice", "display_name": "Alice New", "password": "another-pass"})
    assert r.status_code == 201
    login(client, "alice", "another-pass")


def test_only_admins_erase_and_not_themselves(client, admin, member):
    alice = me(client, member)
    assert client.post(f"/api/users/{alice['id']}/erase", headers=member).status_code == 403
    assert client.post(f"/api/users/{me(client, admin)['id']}/erase", headers=admin).status_code == 400
    assert client.post("/api/users/9999/erase", headers=admin).status_code == 404
