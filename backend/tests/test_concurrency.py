"""Parallel bookings of the same slot: exactly one may win. Only meaningful on Postgres (row locks)."""

import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import reservations

pytestmark = pytest.mark.skipif(
    not os.environ.get("ROBOTS_TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="needs Postgres (SQLite serialises writes anyway)",
)


def test_parallel_bookings_only_one_wins(client, member, robot, monkeypatch):
    real_find = reservations.find_conflicts

    def slow_find(*args, **kwargs):
        # Widen the gap between "check" and "insert" so a missing lock reliably shows up.
        result = real_find(*args, **kwargs)
        time.sleep(0.3)
        return result

    monkeypatch.setattr(reservations, "find_conflicts", slow_find)

    start = (datetime.now(UTC) + timedelta(hours=5)).replace(microsecond=0)
    body = {"robot_id": robot["id"], "start": start.isoformat(), "end": (start + timedelta(hours=1)).isoformat()}

    def book(_):
        with TestClient(app) as c:  # one client per thread, so requests really overlap
            return c.post("/api/reservations", headers=member, json=body).status_code

    with ThreadPoolExecutor(max_workers=6) as pool:
        codes = list(pool.map(book, range(6)))

    assert sorted(codes) == [201] + [409] * 5
