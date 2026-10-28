"""Usage statistics. Computed in Python: at lab scale (a handful of robots, thousands of bookings) this is
fast enough and works the same on SQLite and Postgres."""

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import select

from ..auth import DB, CurrentUser
from ..config import LAB_TZ
from ..models import ExperimentLog, ExperimentResult, Reservation, Robot, Ticket, User, utcnow

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


@router.get("")
def usage_stats(_: CurrentUser, db: DB, days: Annotated[int, Query(ge=1, le=366)] = 30):
    end = utcnow()
    start = end - timedelta(days=days)
    lab_hours = _lab_hours(start, end)

    robots = db.scalars(select(Robot).order_by(Robot.name)).all()
    reservations = db.scalars(select(Reservation).where(Reservation.end > start, Reservation.start < end)).all()
    tickets = db.scalars(select(Ticket).where(Ticket.created_at >= start)).all()
    logs = db.scalars(select(ExperimentLog).where(ExperimentLog.date >= start, ExperimentLog.date <= end)).all()

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
