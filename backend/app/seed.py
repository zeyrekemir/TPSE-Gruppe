"""Fill an empty database with demo robots and records: python -m app.seed"""

import random
from datetime import timedelta

from sqlalchemy import select

from .auth import hash_password
from .db import SessionLocal
from .main import init_db
from .models import (
    ExperimentLog,
    ExperimentResult,
    Reservation,
    Robot,
    RobotStatus,
    Role,
    Ticket,
    TicketEvent,
    TicketKind,
    TicketStatus,
    User,
    utcnow,
)


def main():
    init_db()
    with SessionLocal() as db:
        if db.scalar(select(Robot.id)):
            print("Database already has robots, nothing to do.")
            return
        lena = User(username="lena", display_name="Lena Weber", password_hash=hash_password("demo-pass"))
        jonas = User(username="jonas", display_name="Jonas Becker", password_hash=hash_password("demo-pass"))
        db.add_all([lena, jonas])
        db.flush()

        robots = [
            Robot(name="Franka 1", type="Franka Emika Panda", location="S2|02 A120", responsible_user_id=lena.id,
                  documentation_url="https://frankaemika.github.io/docs/"),
            Robot(name="Franka 2", type="Franka Emika Panda", location="S2|02 A120", responsible_user_id=lena.id),
            Robot(name="xArm 7", type="UFACTORY xArm 7", location="S2|02 A122", responsible_user_id=jonas.id,
                  status=RobotStatus.maintenance),
            Robot(name="Tiago", type="PAL Robotics TIAGo", location="S2|02 A124", responsible_user_id=jonas.id,
                  description="Mobile manipulator. Charge overnight at the dock."),
            Robot(name="Tiago++", type="PAL Robotics TIAGo++", location="S2|02 A124", status=RobotStatus.defect),
        ]
        db.add_all(robots)
        db.flush()

        now = utcnow().replace(minute=0, second=0, microsecond=0)
        db.add_all([
            Reservation(robot_id=robots[0].id, user_id=jonas.id, start=now - timedelta(hours=1),
                        end=now + timedelta(hours=2), purpose="Grasping benchmark"),
            Reservation(robot_id=robots[0].id, user_id=lena.id, start=now + timedelta(days=1, hours=1),
                        end=now + timedelta(days=1, hours=4), purpose="Teleoperation demo"),
            Reservation(robot_id=robots[3].id, user_id=lena.id, start=now + timedelta(hours=3),
                        end=now + timedelta(hours=6), purpose="Navigation test"),
        ])

        # A month of past bookings on weekdays, so the statistics page has something to show.
        rng = random.Random(7)
        for days_ago in range(1, 31):
            day = (now - timedelta(days=days_ago)).replace(hour=0)
            if day.weekday() >= 5:
                continue
            for robot in robots[:4]:
                if rng.random() < 0.55:
                    start = day + timedelta(hours=rng.choice([7, 8, 9, 11, 12, 13, 14]))
                    db.add(Reservation(robot_id=robot.id, user_id=rng.choice([lena.id, jonas.id]), start=start,
                                       end=start + timedelta(hours=rng.choice([1, 2, 2, 3, 4])), purpose="Experiment"))

        fault = Ticket(robot_id=robots[4].id, reporter_id=jonas.id, kind=TicketKind.fault,
                       title="Left arm joint 4 overheating", description="Stops after ~10 min of motion.")
        fault.events.append(TicketEvent(user_id=jonas.id, new_status=TicketStatus.open))
        service = Ticket(robot_id=robots[2].id, reporter_id=jonas.id, assignee_id=jonas.id,
                         kind=TicketKind.maintenance, title="Yearly calibration", status=TicketStatus.in_progress)
        service.events += [
            TicketEvent(user_id=jonas.id, new_status=TicketStatus.open),
            TicketEvent(user_id=jonas.id, old_status=TicketStatus.open, new_status=TicketStatus.in_progress,
                        comment="Calibration kit arrived."),
        ]
        db.add_all([fault, service])

        db.add_all([
            ExperimentLog(robot_id=robots[0].id, user_id=jonas.id, date=now - timedelta(days=1),
                          title="Diffusion policy pick-and-place", result=ExperimentResult.partial,
                          description="14/20 successful grasps, misses on transparent objects."),
            ExperimentLog(robot_id=robots[3].id, user_id=lena.id, date=now - timedelta(days=2),
                          title="Door opening", result=ExperimentResult.success),
        ])

        admin = db.scalar(select(User).where(User.role == Role.admin))
        if admin:
            robots[1].responsible_user_id = admin.id
        db.commit()
        print("Demo data created. Users lena / jonas, password demo-pass.")


if __name__ == "__main__":
    main()
