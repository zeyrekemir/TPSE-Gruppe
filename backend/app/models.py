import enum
from datetime import UTC, datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, TypeDecorator
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator):
    """Stores datetimes as UTC and always returns timezone-aware values (SQLite drops tzinfo)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime not allowed")
        return value.astimezone(UTC)

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value


def _enum(cls):
    return Enum(cls, native_enum=False, length=32, values_callable=lambda e: [m.value for m in e])


class Role(str, enum.Enum):
    admin = "admin"
    member = "member"


class AuthSource(str, enum.Enum):
    local = "local"
    ldap = "ldap"
    oidc = "oidc"


class RobotStatus(str, enum.Enum):
    available = "available"
    maintenance = "maintenance"
    defect = "defect"
    retired = "retired"


class TicketKind(str, enum.Enum):
    maintenance = "maintenance"
    fault = "fault"


class TicketStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    resolved = "resolved"


class ExperimentResult(str, enum.Enum):
    success = "success"
    partial = "partial"
    failure = "failure"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(128))
    email: Mapped[str | None] = mapped_column(String(256))
    password_hash: Mapped[str | None] = mapped_column(String(128))
    role: Mapped[Role] = mapped_column(_enum(Role), default=Role.member)
    auth_source: Mapped[AuthSource] = mapped_column(_enum(AuthSource), default=AuthSource.local)
    language: Mapped[str] = mapped_column(String(2), default="de")
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Robot(Base):
    __tablename__ = "robots"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    type: Mapped[str] = mapped_column(String(128))
    location: Mapped[str] = mapped_column(String(128))
    responsible_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    documentation_url: Mapped[str | None] = mapped_column(String(512))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[RobotStatus] = mapped_column(_enum(RobotStatus), default=RobotStatus.available)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    # Live status, reported by the robot itself via the heartbeat endpoint.
    api_key_hash: Mapped[str | None] = mapped_column(String(64))
    last_seen_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    live_state: Mapped[str | None] = mapped_column(String(32))
    live_message: Mapped[str | None] = mapped_column(String(256))
    battery: Mapped[float | None]

    responsible_user: Mapped[User | None] = relationship()


class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(primary_key=True)
    robot_id: Mapped[int] = mapped_column(ForeignKey("robots.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    start: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    end: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    purpose: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    reminder_sent_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    robot: Mapped[Robot] = relationship()
    user: Mapped[User] = relationship()


class Ticket(Base):
    """A maintenance task or fault report for a robot."""

    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(primary_key=True)
    robot_id: Mapped[int] = mapped_column(ForeignKey("robots.id", ondelete="CASCADE"), index=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    kind: Mapped[TicketKind] = mapped_column(_enum(TicketKind))
    title: Mapped[str] = mapped_column(String(256))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[TicketStatus] = mapped_column(_enum(TicketStatus), default=TicketStatus.open)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    robot: Mapped[Robot] = relationship()
    reporter: Mapped[User] = relationship(foreign_keys=[reporter_id])
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id])
    events: Mapped[list["TicketEvent"]] = relationship(
        back_populates="ticket", cascade="all, delete-orphan", order_by="TicketEvent.created_at"
    )


class TicketEvent(Base):
    """History entry for a ticket: a comment and/or a status change."""

    __tablename__ = "ticket_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    old_status: Mapped[TicketStatus | None] = mapped_column(_enum(TicketStatus))
    new_status: Mapped[TicketStatus | None] = mapped_column(_enum(TicketStatus))
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    ticket: Mapped[Ticket] = relationship(back_populates="events")
    user: Mapped[User] = relationship()


class ExperimentLog(Base):
    __tablename__ = "experiment_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    robot_id: Mapped[int] = mapped_column(ForeignKey("robots.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    date: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    title: Mapped[str] = mapped_column(String(256))
    description: Mapped[str | None] = mapped_column(Text)
    result: Mapped[ExperimentResult] = mapped_column(_enum(ExperimentResult))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    robot: Mapped[Robot] = relationship()
    user: Mapped[User] = relationship()


# Flat names for API responses, so clients don't need a second lookup.
for _cls in (Reservation, Ticket, ExperimentLog):
    _cls.robot_name = property(lambda self: self.robot.name)
# Lets the UI know who may change a ticket's status (see routers/tickets.py:_can_manage).
Ticket.robot_responsible_id = property(lambda self: self.robot.responsible_user_id)
