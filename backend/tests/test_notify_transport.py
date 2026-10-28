"""Notifications over real network connections: a local SMTP server and a local Discord-style webhook.

test_notify.py checks who gets which message with the sending replaced; this file checks that the messages
actually go out over the wire: SMTP dialogue with login, recipients in Bcc, umlauts in the subject, and a
JSON post to the webhook. A failing server must never fail the request that caused the message.
"""

import email
import email.policy
import json
import socketserver
import threading
from datetime import timedelta
from email.header import decode_header, make_header
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from app import notify
from app.config import get_settings
from app.db import SessionLocal
from app.models import Reservation, utcnow


class SMTPHandler(socketserver.StreamRequestHandler):
    """Just enough SMTP (EHLO, AUTH PLAIN, MAIL, RCPT, DATA, QUIT) to receive what smtplib sends."""

    def reply(self, line: str):
        self.wfile.write(line.encode() + b"\r\n")

    def handle(self):
        server = self.server
        self.reply("220 test ESMTP")
        envelope = {"from": None, "to": [], "auth": None}
        while line := self.rfile.readline():
            command = line.decode().strip()
            upper = command.upper()
            if upper.startswith("EHLO") or upper.startswith("HELO"):
                self.wfile.write(b"250-test\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n")
            elif upper.startswith("AUTH PLAIN"):
                envelope["auth"] = command.split(" ", 2)[2]
                self.reply("235 Authentication successful" if server.accept_login else "535 Authentication failed")
            elif upper.startswith("MAIL FROM"):
                envelope["from"] = command.split(":", 1)[1].strip(" <>")
                self.reply("250 OK")
            elif upper.startswith("RCPT TO"):
                envelope["to"].append(command.split(":", 1)[1].strip(" <>"))
                self.reply("250 OK")
            elif upper == "DATA":
                self.reply("354 End data with <CR><LF>.<CR><LF>")
                body = []
                while (data := self.rfile.readline()) != b".\r\n":
                    body.append(data)
                message = email.message_from_bytes(b"".join(body), policy=email.policy.default)
                server.messages.append(envelope | {"message": message})
                envelope = {"from": None, "to": [], "auth": envelope["auth"]}
                self.reply("250 OK")
            elif upper == "QUIT":
                self.reply("221 Bye")
                return
            else:
                self.reply("250 OK")


@pytest.fixture
def smtp_server(monkeypatch):
    server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), SMTPHandler)
    server.daemon_threads = True
    server.messages = []
    server.accept_login = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    settings = get_settings()
    for key, value in {
        "smtp_host": "127.0.0.1",
        "smtp_port": server.server_address[1],
        "smtp_starttls": False,  # the test server speaks plain SMTP; production uses STARTTLS
        "smtp_user": "robot-hub",
        "smtp_password": "test-mail-password",
        "smtp_from": "robots@lab.test",
    }.items():
        monkeypatch.setattr(settings, key, value)
    yield server
    server.shutdown()


@pytest.fixture
def webhook(monkeypatch):
    posts = []
    status = {"code": 204}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0))
            posts.append(json.loads(self.rfile.read(length)))
            self.send_response(status["code"])
            self.end_headers()

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    monkeypatch.setattr(get_settings(), "discord_webhook_url", f"http://127.0.0.1:{server.server_address[1]}/hook")
    yield {"posts": posts, "status": status}
    server.shutdown()


def subject(message) -> str:
    return str(make_header(decode_header(message["Subject"])))


def set_profile(client, headers, address, language):
    client.patch("/api/auth/me", headers=headers, json={"email": address, "language": language})


def test_fault_mail_goes_out_over_smtp(client, admin, member, robot, smtp_server):
    set_profile(client, admin, "admin@lab.test", "de")
    set_profile(client, member, "alice@lab.test", "en")
    alice = client.get("/api/auth/me", headers=member).json()["id"]
    client.patch(f"/api/robots/{robot['id']}", headers=admin, json={"responsible_user_id": alice})

    r = client.post("/api/tickets", headers=member, json={"robot_id": robot["id"], "kind": "fault", "title": "Greifer klemmt"})
    assert r.status_code == 201

    by_recipient = {m["to"][0]: m for m in smtp_server.messages}
    assert sorted(by_recipient) == ["admin@lab.test", "alice@lab.test"]
    german, english = by_recipient["admin@lab.test"], by_recipient["alice@lab.test"]
    # Umlauts survive the trip (encoded header), each in the recipient's language.
    assert subject(german["message"]) == "[PEARL Robot Hub] Störung gemeldet: Franka 1 – Greifer klemmt"
    assert subject(english["message"]) == "[PEARL Robot Hub] Fault reported: Franka 1 – Greifer klemmt"
    assert "/robots/" in german["message"].get_content()
    # Logged in, sent from the configured address, recipients only in the envelope (Bcc is stripped).
    assert german["auth"] and german["from"] == "robots@lab.test"
    assert german["message"]["Bcc"] is None and german["message"]["To"] == "robots@lab.test"


def test_reminder_goes_out_over_smtp(client, member, robot, smtp_server):
    set_profile(client, member, "alice@lab.test", "de")
    me = client.get("/api/auth/me", headers=member).json()
    now = utcnow()
    with SessionLocal() as db:
        db.add(Reservation(robot_id=robot["id"], user_id=me["id"], start=now + timedelta(minutes=5), end=now + timedelta(hours=1)))
        db.commit()
    assert notify.send_due_reminders() == 1
    (sent,) = smtp_server.messages
    assert sent["to"] == ["alice@lab.test"] and subject(sent["message"]).startswith("[PEARL Robot Hub] Erinnerung: Franka 1 am ")


def test_rejected_mail_login_does_not_fail_the_request(client, admin, member, robot, smtp_server):
    smtp_server.accept_login = False
    set_profile(client, admin, "admin@lab.test", "de")
    r = client.post("/api/tickets", headers=member, json={"robot_id": robot["id"], "kind": "fault", "title": "x"})
    assert r.status_code == 201 and smtp_server.messages == []


def test_implicit_tls_for_port_465(monkeypatch):
    """smtp.tu-darmstadt.de speaks TLS from the first byte on 465: ROBOTS_SMTP_SSL picks SMTP_SSL."""
    settings = get_settings()
    opened = []
    monkeypatch.setattr(notify.smtplib, "SMTP_SSL", lambda host, port, timeout: opened.append(("ssl", host, port)))
    monkeypatch.setattr(notify.smtplib, "SMTP", lambda host, port, timeout: opened.append(("plain", host, port)))
    for key, value in {"smtp_host": "smtp.tu-darmstadt.de", "smtp_port": 465, "smtp_ssl": True}.items():
        monkeypatch.setattr(settings, key, value)
    notify.smtp_connection(settings)
    monkeypatch.setattr(settings, "smtp_ssl", False)
    notify.smtp_connection(settings)
    assert opened == [("ssl", "smtp.tu-darmstadt.de", 465), ("plain", "smtp.tu-darmstadt.de", 465)]


def test_discord_post_goes_out_over_http(client, admin, robot, webhook):
    r = client.post("/api/tickets", headers=admin, json={"robot_id": robot["id"], "kind": "fault", "title": "Not-Aus defekt"})
    assert r.status_code == 201
    (post,) = webhook["posts"]
    assert post["content"].startswith("**Störung gemeldet: Franka 1 – Not-Aus defekt**")


def test_discord_error_does_not_fail_the_request(client, admin, robot, webhook):
    webhook["status"]["code"] = 500
    r = client.post("/api/tickets", headers=admin, json={"robot_id": robot["id"], "kind": "fault", "title": "x"})
    assert r.status_code == 201 and len(webhook["posts"]) == 1
