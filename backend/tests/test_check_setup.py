"""The setup check (python -m app.check_setup) against real local stand-ins for TU-ID, mail and Discord."""

import json
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from app import check_setup
from app.config import get_settings
from tests.test_notify_transport import smtp_server  # noqa: F401  (fixture)
from tests.test_tools import dev_idp, free_port  # noqa: F401  (fixture)

STRONG = {
    "secret_key": "x" * 64,
    "bootstrap_admin_password": "a-long-first-password",
    "public_url": "https://robots.lab.test",
    "cors_origins": ["https://robots.lab.test"],
}


@pytest.fixture
def settings(monkeypatch):
    s = get_settings()
    for key, value in STRONG.items():
        monkeypatch.setattr(s, key, value)
    return s


def checks(capsys, s, **kwargs):
    report = check_setup.run(s, **kwargs)
    return report, capsys.readouterr().out


def test_production_defaults_fail(client, monkeypatch, capsys):
    s = get_settings()
    monkeypatch.setattr(s, "public_url", "http://robots.lab.test")
    report, out = checks(capsys, s)
    assert {"secret key", "first admin password", "public address"} <= set(report.failures)
    # Unconfigured services are skipped, not failed.
    assert "--    TU-ID (OpenID Connect): not configured" in out and "--    LDAP" in out


def test_development_defaults_only_warn(client, capsys):
    report, out = checks(capsys, get_settings())  # public URL is localhost
    assert report.failures == [] and "secret key" in report.warnings


def test_strong_settings_pass(client, settings, capsys):
    report, out = checks(capsys, settings)
    assert report.failures == []
    assert "ok    secret key" in out and "ok    public address  (https://robots.lab.test)" in out
    assert "database" not in report.failures


def test_tuid_provider_checked(client, settings, dev_idp, monkeypatch, capsys):  # noqa: F811
    monkeypatch.setattr(settings, "public_url", "https://robots.lab.test")
    report, out = checks(capsys, settings)
    assert "TU-ID (OpenID Connect)" not in report.failures
    assert "redirect URI registered with HRZ must be https://robots.lab.test/api/auth/oidc/callback" in out


def test_tuid_wrong_issuer_fails(client, settings, dev_idp, monkeypatch, capsys):  # noqa: F811
    monkeypatch.setattr(dev_idp, "ISSUER", "https://somewhere.else")
    report, _ = checks(capsys, settings)
    assert "TU-ID (OpenID Connect)" in report.failures


def test_tuid_unreachable_fails(client, settings, monkeypatch, capsys):
    for key, value in {"oidc_issuer": f"http://127.0.0.1:{free_port()}", "oidc_client_id": "c", "oidc_client_secret": "s"}.items():
        monkeypatch.setattr(settings, key, value)
    report, _ = checks(capsys, settings)
    assert "TU-ID (OpenID Connect)" in report.failures


def test_mail_login_and_test_message(client, settings, smtp_server, capsys):  # noqa: F811
    report, out = checks(capsys, settings, mail_to="me@lab.test")
    assert "e-mail" not in report.failures and "test sent to me@lab.test" in out
    (sent,) = smtp_server.messages
    assert sent["to"] == ["me@lab.test"] and sent["auth"]


def test_mail_rejected_login_fails(client, settings, smtp_server, capsys):  # noqa: F811
    smtp_server.accept_login = False
    report, _ = checks(capsys, settings)
    assert "e-mail" in report.failures and smtp_server.messages == []


def test_discord_webhook_checked_without_posting(client, settings, monkeypatch, capsys):
    posts = []

    class Hook(BaseHTTPRequestHandler):
        def do_GET(self):
            body = json.dumps({"name": "Robot Hub", "channel_id": "1"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            posts.append(self.rfile.read(int(self.headers["Content-Length"])))
            self.send_response(204)
            self.end_headers()

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Hook)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    monkeypatch.setattr(settings, "discord_webhook_url", f"http://127.0.0.1:{server.server_address[1]}/hook")
    report, out = checks(capsys, settings)
    assert "ok    Discord  (webhook 'Robot Hub')" in out and posts == []
    report, out = checks(capsys, settings, discord_test=True)
    assert "test message posted" in out and len(posts) == 1
    server.shutdown()


def test_ldap_unreachable_fails(client, settings, monkeypatch, capsys):
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    monkeypatch.setattr(settings, "ldap_url", f"ldap://127.0.0.1:{port}")
    report, out = checks(capsys, settings)
    assert "LDAP" in report.failures
    assert "is not ldaps://" in out  # plain LDAP is flagged too
