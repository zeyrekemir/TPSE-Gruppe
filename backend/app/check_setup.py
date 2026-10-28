"""Checks a hub's configuration against the real services before (and after) going live.

    python -m app.check_setup                         # all checks, nothing is sent or changed
    python -m app.check_setup --ldap-user ab12cdef    # also signs in to LDAP as that user (asks for the password)
    python -m app.check_setup --mail-to me@tu-darmstadt.de --discord-test   # also sends one test message each

In Docker: docker compose exec backend python -m app.check_setup

Reads the same settings as the hub (ROBOTS_* environment variables, .env). Prints one line per check and
exits with 1 if any check failed. Secrets are never printed.
"""

import argparse
import getpass
import smtplib
import sys
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

import httpx
from sqlalchemy import inspect, text

from .config import Settings, get_settings

DEFAULT_SECRET = "change-me-in-production"


@dataclass
class Report:
    failures: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def ok(self, name: str, detail: str = "") -> None:
        print(f"  ok    {name}{f'  ({detail})' if detail else ''}")

    def warn(self, name: str, detail: str) -> None:
        self.warnings.append(name)
        print(f"  warn  {name}: {detail}")

    def fail(self, name: str, detail: str) -> None:
        self.failures.append(name)
        print(f"  FAIL  {name}: {detail}")

    def skip(self, name: str, detail: str) -> None:
        print(f"  --    {name}: {detail}")


def is_local(url: str) -> bool:
    return (urlparse(url).hostname or "") in ("localhost", "127.0.0.1", "::1")


def check_security(s: Settings, r: Report) -> None:
    production = not is_local(s.public_url)
    if s.secret_key == DEFAULT_SECRET or len(s.secret_key) < 32:
        (r.fail if production else r.warn)("secret key", "set ROBOTS_SECRET_KEY to a long random value (openssl rand -hex 32)")
    else:
        r.ok("secret key")
    if s.bootstrap_admin_password and (s.bootstrap_admin_password in ("admin", "admin-password") or len(s.bootstrap_admin_password) < 12):
        (r.fail if production else r.warn)("first admin password", "ROBOTS_BOOTSTRAP_ADMIN_PASSWORD is a default or short")
    else:
        r.ok("first admin password")
    if production and urlparse(s.public_url).scheme != "https":
        r.fail("public address", f"{s.public_url} must use https")
    else:
        r.ok("public address", s.public_url)
    # An empty list is the Docker setup (browser and API share one origin behind nginx): nothing to allow.
    if s.cors_origins and s.public_url.rstrip("/") not in [o.rstrip("/") for o in s.cors_origins]:
        r.warn("allowed origins", f"ROBOTS_CORS_ORIGINS does not contain {s.public_url}")


def check_database(r: Report) -> None:
    from alembic.config import Config
    from alembic.runtime.migration import MigrationContext
    from alembic.script import ScriptDirectory

    from .db import engine

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            current = MigrationContext.configure(connection).get_current_revision()
            tables = inspect(connection).get_table_names()
    except Exception as e:  # any driver error: the database is not usable
        r.fail("database", f"cannot connect: {e.__class__.__name__}: {e}")
        return
    # The same alembic.ini the hub migrates with (see main.run_migrations).
    head = ScriptDirectory.from_config(Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))).get_current_head()
    if current == head:
        r.ok("database", f"{engine.url.get_backend_name()}, schema up to date")
    elif current is None and "robots" in tables:
        r.warn("database", "tables exist but carry no migration stamp (created without Alembic)")
    else:
        r.warn("database", f"schema at {current}, newest is {head}: starting the hub migrates it")


def check_oidc(s: Settings, r: Report) -> None:
    if not s.oidc_issuer:
        r.skip("TU-ID (OpenID Connect)", "not configured (ROBOTS_OIDC_ISSUER empty)")
        return
    if not (s.oidc_client_id and s.oidc_client_secret):
        r.fail("TU-ID (OpenID Connect)", "ROBOTS_OIDC_CLIENT_ID and ROBOTS_OIDC_CLIENT_SECRET are both needed")
        return
    url = s.oidc_issuer.rstrip("/") + "/.well-known/openid-configuration"
    try:
        meta = httpx.get(url, timeout=10).raise_for_status().json()
        keys = httpx.get(meta["jwks_uri"], timeout=10).raise_for_status().json().get("keys", [])
    except (httpx.HTTPError, KeyError, ValueError) as e:
        r.fail("TU-ID (OpenID Connect)", f"discovery at {url} failed: {e}")
        return
    if meta.get("issuer", "").rstrip("/") != s.oidc_issuer.rstrip("/"):
        r.fail("TU-ID (OpenID Connect)", f"provider calls itself {meta.get('issuer')!r}, not {s.oidc_issuer!r}")
        return
    if "S256" not in meta.get("code_challenge_methods_supported", ["S256"]):
        r.warn("TU-ID (OpenID Connect)", "provider does not list PKCE (S256); the hub sends it anyway")
    if not keys:
        r.fail("TU-ID (OpenID Connect)", "provider publishes no signing keys")
        return
    redirect = s.public_url.rstrip("/") + "/api/auth/oidc/callback"
    r.ok("TU-ID (OpenID Connect)", f"provider reachable; redirect URI registered with HRZ must be {redirect}")
    if not s.oidc_admin_group:
        r.warn("TU-ID admins", "ROBOTS_OIDC_ADMIN_GROUP empty: TU-ID users all become members")


def check_ldap(s: Settings, r: Report, user: str | None, password: str | None) -> None:
    if not s.ldap_url:
        r.skip("LDAP", "not configured (ROBOTS_LDAP_URL empty)")
        return
    from ldap3 import Connection, Server
    from ldap3.core.exceptions import LDAPException

    if not s.ldap_url.startswith("ldaps://"):
        r.warn("LDAP", f"{s.ldap_url} is not ldaps://: passwords would cross the network unencrypted")
    try:
        conn = Connection(Server(s.ldap_url, connect_timeout=5), receive_timeout=10)
        conn.open()
        conn.unbind()
    except LDAPException as e:
        r.fail("LDAP", f"cannot reach {s.ldap_url}: {e}")
        return
    r.ok("LDAP server", s.ldap_url)
    if not user:
        r.skip("LDAP sign-in", "run with --ldap-user <name> to test a real sign-in")
        return
    from .auth import ldap_authenticate

    info = ldap_authenticate(user, password or "", s)
    if info is None:
        r.fail("LDAP sign-in", f"{user} could not sign in (wrong password or ROBOTS_LDAP_USER_DN_TEMPLATE)")
    else:
        role = "admin" if info["is_admin"] else "member"
        r.ok("LDAP sign-in", f"{user} = {info['display_name']}, e-mail {info['email'] or 'missing'}, becomes {role}")
        if not s.ldap_admin_group_dn:
            r.warn("LDAP admins", "ROBOTS_LDAP_ADMIN_GROUP_DN empty: LDAP users all become members")


def check_smtp(s: Settings, r: Report, mail_to: str | None) -> None:
    if not s.smtp_host:
        r.skip("e-mail", "not configured (ROBOTS_SMTP_HOST empty)")
        return
    try:
        from .notify import smtp_connection

        with smtp_connection(s) as smtp:
            if s.smtp_starttls and not s.smtp_ssl:
                smtp.starttls()
            if s.smtp_user:
                smtp.login(s.smtp_user, s.smtp_password or "")
            if mail_to:
                from email.message import EmailMessage

                mail = EmailMessage()
                mail["Subject"] = "[PEARL Robot Hub] Test"
                mail["From"] = s.smtp_from
                mail["To"] = mail_to
                mail.set_content("Test message from the PEARL Robot Hub setup check. E-mail works.")
                smtp.send_message(mail)
    except (smtplib.SMTPException, OSError) as e:
        r.fail("e-mail", f"{s.smtp_host}:{s.smtp_port}: {e.__class__.__name__}: {e}")
        return
    r.ok("e-mail", f"{s.smtp_host}:{s.smtp_port}, sender {s.smtp_from}" + (f", test sent to {mail_to}" if mail_to else ""))


def check_discord(s: Settings, r: Report, send: bool) -> None:
    if not s.discord_webhook_url:
        r.skip("Discord", "not configured (ROBOTS_DISCORD_WEBHOOK_URL empty)")
        return
    try:
        # Discord answers GET on a webhook with its name and channel, without posting anything.
        info = httpx.get(s.discord_webhook_url, timeout=10).raise_for_status().json()
        if send:
            httpx.post(s.discord_webhook_url, json={"content": "PEARL Robot Hub: setup check, Discord works."}, timeout=10).raise_for_status()
    except (httpx.HTTPError, ValueError) as e:
        r.fail("Discord", f"webhook not usable: {e}")
        return
    r.ok("Discord", f"webhook {info.get('name', '?')!r}" + (", test message posted" if send else ""))


def run(settings: Settings, ldap_user=None, ldap_password=None, mail_to=None, discord_test=False) -> Report:
    report = Report()
    print("PEARL Robot Hub setup check")
    check_security(settings, report)
    check_database(report)
    check_oidc(settings, report)
    check_ldap(settings, report, ldap_user, ldap_password)
    check_smtp(settings, report, mail_to)
    check_discord(settings, report, discord_test)
    print(
        "All checks passed." if not report.failures and not report.warnings
        else f"{len(report.failures)} failed, {len(report.warnings)} warning(s)."
    )
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--ldap-user", help="sign in to LDAP as this user (the password is asked for)")
    parser.add_argument("--mail-to", help="send one test e-mail to this address")
    parser.add_argument("--discord-test", action="store_true", help="post one test message to the Discord channel")
    args = parser.parse_args()
    password = getpass.getpass(f"LDAP password for {args.ldap_user}: ") if args.ldap_user else None
    report = run(get_settings(), args.ldap_user, password, args.mail_to, args.discord_test)
    return 1 if report.failures else 0


if __name__ == "__main__":
    sys.exit(main())
