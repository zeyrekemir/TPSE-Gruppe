"""Usage statistics. Computed in Python: at lab scale (a handful of robots, thousands of bookings) this is
fast enough and works the same on SQLite and Postgres."""

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import select

from ..auth import DB, CurrentUser
from ..config import LAB_TZ
from ..models import (
    ExperimentLog,
    ExperimentResult,
    MemberType,
    Reservation,
    Robot,
    RobotStatus,
    RobotStatusChange,
    Role,
    Ticket,
    User,
    utcnow,
)

router = APIRouter(prefix="/stats", tags=["statistics"])

# Utilisation is measured against lab hours, not 24/7: Monday–Friday, 08:00–18:00.
WORKDAY_START, WORKDAY_END = 8, 18


def _hours(a: datetime, b: datetime) -> float:
    return max(0.0, (b - a).total_seconds() / 3600)


def _lab_hours(start: datetime, end: datetime) -> float:
    """Lab hours (Mon–Fri 08–18 local) inside [start, end)."""
    total = 0.0
    day = start.astimezone(LAB_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    while day < end:
        if day.weekday() < 5:
            open_ = day.replace(hour=WORKDAY_START)
            close = day.replace(hour=WORKDAY_END)
            total += _hours(max(open_, start), min(close, end))
        day = (day + timedelta(days=1, hours=2)).replace(hour=0)  # robust across DST changes
    return total


def _split_by_hour(start: datetime, end: datetime):
    """Yield (local datetime of the hour, hours used in it) for an interval."""
    cursor = start.astimezone(LAB_TZ)
    end = end.astimezone(LAB_TZ)
    while cursor < end:
        next_hour = (cursor + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
        stop = min(next_hour, end)
        yield cursor, _hours(cursor, stop)
        cursor = stop


DOWN_STATUSES = {RobotStatus.maintenance, RobotStatus.defect}


def status_hours(robot: Robot, changes: list[RobotStatusChange], start: datetime, end: datetime) -> dict:
    """Hours the robot spent in service (available) and out of it (maintenance or defect) inside [start, end).

    Counting starts with the robot's first history entry (written when it is added, or by the migration that
    introduced the history); a robot without any history counts with its current status. Retired time counts
    as neither."""
    up = down = 0.0
    timeline = sorted(changes, key=lambda c: c.changed_at)
    current = timeline[0].status if timeline else robot.status
    cursor = max(start, timeline[0].changed_at if timeline else robot.created_at)
    for change in timeline:
        if change.changed_at <= cursor:
            current = change.status
            continue
        if change.changed_at >= end:
            break
        hours = _hours(cursor, change.changed_at)
        if current == RobotStatus.available:
            up += hours
        elif current in DOWN_STATUSES:
            down += hours
        cursor, current = change.changed_at, change.status
    if cursor < end:
        hours = _hours(cursor, end)
        if current == RobotStatus.available:
            up += hours
        elif current in DOWN_STATUSES:
            down += hours
    return {"up": up, "down": down}


def group_of(user: User | None) -> str:
    """For the share of bookings: admins, staff or students."""
    if user is None:
        return "student"
    if user.role == Role.admin:
        return "admin"
    return "staff" if user.member_type == MemberType.staff else "student"


@router.get("")
def usage_stats(_: CurrentUser, db: DB, days: Annotated[int, Query(ge=1, le=366)] = 30):
    end = utcnow()
    start = end - timedelta(days=days)
    lab_hours = _lab_hours(start, end)

    robots = db.scalars(select(Robot).order_by(Robot.name)).all()
    reservations = db.scalars(select(Reservation).where(Reservation.end > start, Reservation.start < end)).all()
    tickets = db.scalars(select(Ticket).where(Ticket.created_at >= start)).all()
    logs = db.scalars(select(ExperimentLog).where(ExperimentLog.date >= start, ExperimentLog.date <= end)).all()
    changes_by_robot = defaultdict(list)
    for change in db.scalars(select(RobotStatusChange).where(RobotStatusChange.changed_at < end)):
        changes_by_robot[change.robot_id].append(change)
    uptime = {robot.id: status_hours(robot, changes_by_robot[robot.id], start, end) for robot in robots}

    per_robot = defaultdict(lambda: {"hours": 0.0, "lab_hours": 0.0, "count": 0})
    per_user = defaultdict(lambda: {"hours": 0.0, "count": 0})
    daily = defaultdict(float)
    heatmap = [[0.0] * 24 for _ in range(7)]  # [weekday Mon=0][hour] -> booked hours

    for r in reservations:
        a, b = max(r.start, start), min(r.end, end)
        hours = _hours(a, b)
        per_robot[r.robot_id]["hours"] += hours
        per_robot[r.robot_id]["lab_hours"] += _lab_hours(a, b)
        per_robot[r.robot_id]["count"] += 1
        per_user[r.user_id]["hours"] += hours
        per_user[r.user_id]["count"] += 1
        for local, used in _split_by_hour(a, b):
            daily[local.date().isoformat()] += used
            heatmap[local.weekday()][local.hour] += used

    tickets_by_robot = defaultdict(list)
    for t in tickets:
        tickets_by_robot[t.robot_id].append(t)
    logs_by_robot = defaultdict(list)
    for log in logs:
        logs_by_robot[log.robot_id].append(log)

    def resolve_hours(items):
        done = [_hours(t.created_at, t.resolved_at) for t in items if t.resolved_at]
        return round(sum(done) / len(done), 1) if done else None

    def success_rate(items):
        return round(sum(1 for i in items if i.result == ExperimentResult.success) / len(items), 3) if items else None

    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(per_user.keys())))}
    by_group = {"student": 0.0, "staff": 0.0, "admin": 0.0}
    for uid, v in per_user.items():
        by_group[group_of(users.get(uid))] += v["hours"]
    booked = sum(by_group.values())

    def share(up: float, down: float):
        return round(up / (up + down), 3) if up + down else None

    first_day = start.astimezone(LAB_TZ).date()
    return {
        "range": {"start": start, "end": end, "days": days, "lab_hours": round(lab_hours, 1)},
        "totals": {
            "reservations": len(reservations),
            "reserved_hours": round(sum(v["hours"] for v in per_robot.values()), 1),
            "tickets_opened": len(tickets),
            "faults_opened": sum(1 for t in tickets if t.kind.value == "fault"),
            "mean_time_to_resolve_hours": resolve_hours(tickets),
            "experiments": len(logs),
            "experiment_success_rate": success_rate(logs),
            "up_hours": round(sum(u["up"] for u in uptime.values()), 1),
            "down_hours": round(sum(u["down"] for u in uptime.values()), 1),
            "uptime": share(sum(u["up"] for u in uptime.values()), sum(u["down"] for u in uptime.values())),
        },
        # Booked hours by who booked: students, staff, admins (hours and share of all booked hours).
        "by_group": {
            group: {"hours": round(hours, 1), "share": round(hours / booked, 3) if booked else 0}
            for group, hours in by_group.items()
        },
        "robots": [
            {
                "robot_id": robot.id,
                "name": robot.name,
                "reserved_hours": round(per_robot[robot.id]["hours"], 1),
                "reservations": per_robot[robot.id]["count"],
                # Share of lab hours (Mon–Fri 08–18) the robot was booked.
                "utilization": round(per_robot[robot.id]["lab_hours"] / lab_hours, 3) if lab_hours else 0,
                "tickets_opened": len(tickets_by_robot[robot.id]),
                "mean_time_to_resolve_hours": resolve_hours(tickets_by_robot[robot.id]),
                "experiments": len(logs_by_robot[robot.id]),
                "experiment_success_rate": success_rate(logs_by_robot[robot.id]),
                # Hours in service (available) and out of service (maintenance or defect), and the share up.
                "up_hours": round(uptime[robot.id]["up"], 1),
                "down_hours": round(uptime[robot.id]["down"], 1),
                "uptime": share(uptime[robot.id]["up"], uptime[robot.id]["down"]),
            }
            for robot in robots
        ],
        "top_users": sorted(
            (
                {
                    "user_id": uid,
                    "display_name": users[uid].display_name if uid in users else "?",
                    "reserved_hours": round(v["hours"], 1),
                    "reservations": v["count"],
                }
                for uid, v in per_user.items()
            ),
            key=lambda u: -u["reserved_hours"],
        )[:10],
        "daily": [
            {"date": (first_day + timedelta(days=i)).isoformat(), "hours": round(daily[(first_day + timedelta(days=i)).isoformat()], 2)}
            for i in range(days + 1)
        ],
        "heatmap": [[round(h, 2) for h in row] for row in heatmap],
    }
