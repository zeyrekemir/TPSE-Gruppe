"""Live robot status: robots (or a small agent next to them) report in with a per-robot API key.

See tools/robot_agent.py for a ready-made sender.
"""

import hashlib
import secrets
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, status

from ..auth import DB, AdminUser
from ..models import Robot, utcnow
from ..schemas import Heartbeat, RobotKey
from .robots import get_robot_or_404

router = APIRouter(prefix="/robots", tags=["live status"])


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


@router.post("/{robot_id}/api-key", response_model=RobotKey)
def create_api_key(robot_id: int, _: AdminUser, db: DB):
    """Create (or replace) the robot's key. It is shown once; only its hash is stored."""
    robot = get_robot_or_404(db, robot_id)
    key = f"rbk_{robot.id}_{secrets.token_urlsafe(32)}"
    robot.api_key_hash = hash_key(key)
    db.commit()
    return RobotKey(robot_id=robot.id, api_key=key)


@router.delete("/{robot_id}/api-key", status_code=status.HTTP_204_NO_CONTENT)
def revoke_api_key(robot_id: int, _: AdminUser, db: DB):
    robot = get_robot_or_404(db, robot_id)
    robot.api_key_hash = None
    robot.last_seen_at = None
    db.commit()


@router.post("/{robot_id}/heartbeat", status_code=status.HTTP_204_NO_CONTENT)
def heartbeat(robot_id: int, data: Heartbeat, db: DB, x_robot_key: Annotated[str, Header()] = ""):
    robot = db.get(Robot, robot_id)
    # Same answer for "no such robot" and "wrong key", so keys can't be probed per robot.
    if robot is None or not robot.api_key_hash or not secrets.compare_digest(robot.api_key_hash, hash_key(x_robot_key)):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid robot key")
    robot.last_seen_at = utcnow()
    robot.live_state = data.state
    robot.live_message = data.message
    robot.battery = data.battery
    db.commit()
