from datetime import datetime
from typing import Annotated

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, HttpUrl, StringConstraints, model_validator

from .models import AuthSource, ExperimentResult, MemberType, Role, RobotStatus, TicketKind, TicketStatus


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Users / auth ---

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserBrief(ORM):
    id: int
    username: str
    display_name: str


class UserOut(UserBrief):
    email: str | None
    role: Role
    member_type: MemberType
    auth_source: AuthSource
    language: str
    is_active: bool


class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    display_name: str = Field(min_length=1, max_length=128)
    email: str | None = None
    password: str = Field(min_length=8)
    role: Role = Role.member
    member_type: MemberType = MemberType.student
    language: str = Field(default="de", pattern="^(de|en)$")


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=128)
    email: str | None = None
    role: Role | None = None
    member_type: MemberType | None = None
    language: str | None = Field(default=None, pattern="^(de|en)$")
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8)


class MeUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=128)
    email: str | None = None
    language: str | None = Field(default=None, pattern="^(de|en)$")


# --- Robots ---

EquipmentItem = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)]
Equipment = Annotated[list[EquipmentItem], Field(max_length=50)]

class RobotBase(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    type: str = Field(min_length=1, max_length=128)
    location: str = Field(min_length=1, max_length=128)
    responsible_user_id: int | None = None
    documentation_url: HttpUrl | None = None
    description: str | None = None
    status: RobotStatus = RobotStatus.available
    firmware: str | None = Field(default=None, max_length=128)
    operating_system: str | None = Field(default=None, max_length=128)
    equipment: Equipment = []


class RobotCreate(RobotBase):
    pass


class RobotUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    type: str | None = Field(default=None, min_length=1, max_length=128)
    location: str | None = Field(default=None, min_length=1, max_length=128)
    responsible_user_id: int | None = None
    documentation_url: HttpUrl | None = None
    description: str | None = None
    status: RobotStatus | None = None
    firmware: str | None = Field(default=None, max_length=128)
    operating_system: str | None = Field(default=None, max_length=128)
    equipment: Equipment | None = None


class LastUse(ORM):
    """The latest booking that has started: who had (or has) the robot, and when."""

    user: UserBrief
    start: datetime
    end: datetime


class LiveStatus(BaseModel):
    online: bool
    state: str | None
    message: str | None
    battery: float | None
    last_seen_at: datetime | None


class Heartbeat(BaseModel):
    state: str = Field(default="idle", max_length=32, pattern=r"^[a-z_]+$")
    message: str | None = Field(default=None, max_length=256)
    battery: float | None = Field(default=None, ge=0, le=100)


class RobotKey(BaseModel):
    robot_id: int
    api_key: str


class RobotOut(ORM):
    id: int
    name: str
    type: str
    location: str
    responsible_user: UserBrief | None
    documentation_url: str | None
    description: str | None
    status: RobotStatus
    firmware: str | None = None
    operating_system: str | None = None
    equipment: list[str] = []
    last_use: LastUse | None = None
    # Status as users should see it: "reserved" if available but booked right now.
    availability: str
    current_reservation_id: int | None = None
    open_tickets: int = 0
    # null until the robot has a key; "online" means a heartbeat within live_timeout_seconds.
    live: LiveStatus | None = None
    has_api_key: bool = False
    created_at: datetime


# --- Reservations ---

class ReservationCreate(BaseModel):
    robot_id: int
    start: AwareDatetime
    end: AwareDatetime
    purpose: str | None = Field(default=None, max_length=512)
    # Replace the bookings in the way, if they all belong to people of a lower rank (see reservations.rank).
    override: bool = False

    @model_validator(mode="after")
    def _check_range(self):
        if self.end <= self.start:
            raise ValueError("end must be after start")
        return self


class ReservationUpdate(BaseModel):
    start: AwareDatetime | None = None
    end: AwareDatetime | None = None
    purpose: str | None = Field(default=None, max_length=512)
    override: bool = False


class ReservationOut(ORM):
    id: int
    robot_id: int
    robot_name: str
    user: UserBrief
    start: datetime
    end: datetime
    purpose: str | None
    created_at: datetime


class ConflictDetail(BaseModel):
    """Returned with HTTP 409 so the UI can show the clash and offer the next free slot."""

    message: str
    conflicts: list[ReservationOut]
    suggested_start: datetime | None
    suggested_end: datetime | None
    # True when the person asking outranks everyone in the way, so they may resend with override=true.
    can_override: bool = False


# --- Tickets ---

class TicketCreate(BaseModel):
    robot_id: int
    kind: TicketKind
    title: str = Field(min_length=1, max_length=256)
    description: str | None = None
    # Fault reports can take the robot out of service immediately.
    mark_robot_defect: bool = False


class TicketUpdate(BaseModel):
    status: TicketStatus | None = None
    assignee_id: int | None = None
    comment: str | None = None


class TicketEventOut(ORM):
    id: int
    user: UserBrief
    old_status: TicketStatus | None
    new_status: TicketStatus | None
    comment: str | None
    created_at: datetime


class TicketOut(ORM):
    id: int
    robot_id: int
    robot_name: str
    robot_responsible_id: int | None = None
    kind: TicketKind
    title: str
    description: str | None
    status: TicketStatus
    reporter: UserBrief
    assignee: UserBrief | None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    events: list[TicketEventOut] = []


# --- Experiment logs ---

class LogCreate(BaseModel):
    robot_id: int
    date: AwareDatetime
    title: str = Field(min_length=1, max_length=256)
    description: str | None = None
    procedure: str | None = None
    result: ExperimentResult


class LogUpdate(BaseModel):
    date: AwareDatetime | None = None
    title: str | None = Field(default=None, min_length=1, max_length=256)
    description: str | None = None
    procedure: str | None = None
    result: ExperimentResult | None = None


class AttachmentOut(ORM):
    id: int
    filename: str
    content_type: str
    size: int
    created_at: datetime


class LogOut(ORM):
    id: int
    robot_id: int
    robot_name: str
    user: UserBrief
    date: datetime
    title: str
    description: str | None
    procedure: str | None = None
    result: ExperimentResult
    attachments: list[AttachmentOut] = []
    created_at: datetime
