"""E-mail and Discord notifications. Each channel stays silent until its settings are filled in.

Messages are sent after the response (FastAPI BackgroundTasks) or from the reminder loop, so a slow or
broken mail server never blocks or fails a request; errors are only logged.

Every message is written in German and English: each recipient gets it in the language they chose in the
app, the shared Discord channel in ROBOTS_DISCORD_LANGUAGE. Times are given in the lab's time zone.
"""

import asyncio
import logging
import smtplib
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from email.message import EmailMessage

import httpx
from sqlalchemy import select

from .config import LAB_TZ, Settings, get_settings
from .db import SessionLocal
from .models import Reservation, Role, Ticket, TicketKind, TicketStatus, User, utcnow

log = logging.getLogger(__name__)

LANGUAGES = ("de", "en")


@dataclass
class Message:
    texts: dict[str, tuple[str, str]]  # language -> (subject, text)
    emails: list[tuple[str, str]] = field(default_factory=list)  # (address, language)
    discord: bool = False

    def subject(self, language: str) -> str:
        return self.texts[language][0]


def recipient(user: User | None) -> tuple[str, str] | None:
    """A user's address and language, or None if they have no address."""
    if user is None or not user.email:
        return None
    return user.email, user.language if user.language in LANGUAGES else "de"


def send(message: Message, settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    by_language: dict[str, set[str]] = defaultdict(set)
    for address, language in message.emails:
        by_language[language].add(address)
    if settings.smtp_host:
        for language, addresses in sorted(by_language.items()):
            subject, text = message.texts[language]
            try:
                _send_email(settings, sorted(addresses), subject, text)
            except Exception:
                log.exception("Sending e-mail failed: %s", subject)
    if message.discord and settings.discord_webhook_url:
        subject, text = message.texts[settings.discord_language if settings.discord_language in LANGUAGES else "de"]
        try:
            _send_discord(settings, subject, text)
        except Exception:
            log.exception("Posting to Discord failed: %s", subject)


def smtp_connection(settings: Settings) -> smtplib.SMTP:
    """Plain SMTP (STARTTLS follows) or, with ROBOTS_SMTP_SSL, TLS from the start (port 465)."""
    if settings.smtp_ssl:
        return smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15)
    return smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)


def _send_email(settings: Settings, recipients: list[str], subject: str, text: str) -> None:
    mail = EmailMessage()
    mail["Subject"] = f"[PEARL Robot Hub] {subject}"
    mail["From"] = settings.smtp_from
    mail["To"] = settings.smtp_from
    mail["Bcc"] = ", ".join(recipients)
    mail.set_content(text)
    with smtp_connection(settings) as smtp:
        if settings.smtp_starttls and not settings.smtp_ssl:
            smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password or "")
        # Deliver to the recipients only: by default smtplib also sends to the To address (the hub itself).
        smtp.send_message(mail, to_addrs=recipients)


def _send_discord(settings: Settings, subject: str, text: str) -> None:
    # Only the subject (robot and ticket title): the body names people, and Discord is an outside (US) service.
    content = f"**{subject}**"[:1900]
    response = httpx.post(settings.discord_webhook_url, json={"content": content}, timeout=10)
    response.raise_for_status()


def link(path: str) -> str:
    return get_settings().public_url.rstrip("/") + path


def lab_time(moment: datetime, language: str) -> str:
    """A moment in the lab's local time, written the way each language writes it."""
    local = moment.astimezone(LAB_TZ)
    if language == "de":
        return local.strftime("%d.%m.%Y um %H:%M Uhr")
    return local.strftime("%d %b %Y at %H:%M ") + f"({local.tzname()})"


def _admins(db) -> list[User]:
    return list(db.scalars(select(User).where(User.role == Role.admin, User.is_active, User.email.is_not(None))))


KIND = {
    "de": {TicketKind.fault: "Störung", TicketKind.maintenance: "Wartung"},
    "en": {TicketKind.fault: "Fault", TicketKind.maintenance: "Maintenance"},
}
STATUS = {
    "de": {TicketStatus.open: "offen", TicketStatus.in_progress: "in Bearbeitung", TicketStatus.resolved: "erledigt"},
    "en": {TicketStatus.open: "open", TicketStatus.in_progress: "in progress", TicketStatus.resolved: "resolved"},
}


# --- Messages for domain events (built inside the request, while the session is open) ---

def ticket_created(db, ticket: Ticket) -> Message:
    robot = ticket.robot
    people = [robot.responsible_user] + (_admins(db) if ticket.kind == TicketKind.fault else [])
    url = link(f"/robots/{robot.id}")
    details = f"\n\n{ticket.description}" if ticket.description else ""
    reporter = ticket.reporter.display_name

    def text(language: str) -> tuple[str, str]:
        kind = KIND[language][ticket.kind]
        if language == "de":
            return (
                f"{kind} gemeldet: {robot.name} – {ticket.title}",
                f"{reporter} hat eine {kind} an {robot.name} ({robot.location}) gemeldet.{details}\n\n{url}",
            )
        return (
            f"{kind} reported: {robot.name} – {ticket.title}",
            f"{reporter} reported a {kind.lower()} on {robot.name} ({robot.location}).{details}\n\n{url}",
        )

    return Message(
        texts={language: text(language) for language in LANGUAGES},
        emails=[r for r in map(recipient, people) if r],
        discord=True,
    )


def ticket_status_changed(ticket: Ticket, by: User) -> Message:
    people = [ticket.reporter, ticket.assignee]
    url = link(f"/robots/{ticket.robot_id}")

    def text(language: str) -> tuple[str, str]:
        status = STATUS[language][ticket.status]
        if language == "de":
            return f'{ticket.robot.name}: „{ticket.title}“ ist jetzt {status}', f"Geändert von {by.display_name}.\n\n{url}"
        return f'{ticket.robot.name}: "{ticket.title}" is now {status}', f"Changed by {by.display_name}.\n\n{url}"

    return Message(
        texts={language: text(language) for language in LANGUAGES},
        emails=[r for r in map(recipient, people) if r and r[0] != by.email],
        discord=ticket.kind == TicketKind.fault,
    )


def reservation_reminder(reservation: Reservation) -> Message:
    robot = reservation.robot
    url = link("/calendar")

    def text(language: str) -> tuple[str, str]:
        start = lab_time(reservation.start, language)
        if language == "de":
            return (
                f"Erinnerung: {robot.name} am {start}",
                f"Deine Reservierung von {robot.name} ({robot.location}) beginnt am {start}.\n\n{url}",
            )
        return (
            f"Reminder: {robot.name} on {start}",
            f"Your reservation of {robot.name} ({robot.location}) starts on {start}.\n\n{url}",
        )

    found = recipient(reservation.user)
    return Message(texts={language: text(language) for language in LANGUAGES}, emails=[found] if found else [])


# --- Reminder loop ---

def send_due_reminders(settings: Settings | None = None) -> int:
    """Send one reminder per reservation that starts within `reminder_minutes`. Returns how many were sent."""
    settings = settings or get_settings()
    if settings.reminder_minutes <= 0 or not settings.smtp_host:
        return 0
    now = utcnow()
    sent = 0
    with SessionLocal() as db:
        due = db.scalars(
            select(Reservation).where(
                Reservation.reminder_sent_at.is_(None),
                Reservation.start > now,
                Reservation.start <= now + timedelta(minutes=settings.reminder_minutes),
            )
        ).all()
        for reservation in due:
            send(reservation_reminder(reservation), settings)
            reservation.reminder_sent_at = now
            sent += 1
        db.commit()
    return sent


async def reminder_loop(interval_seconds: int = 60) -> None:
    while True:
        try:
            await asyncio.to_thread(send_due_reminders)
        except Exception:
            log.exception("Reminder run failed")
        await asyncio.sleep(interval_seconds)
