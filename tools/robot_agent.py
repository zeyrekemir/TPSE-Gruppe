#!/usr/bin/env python3
"""Reports a robot's live status to the PEARL Robot Hub. Standard library only, Python 3.10+.

Run it on the robot's PC (or any machine that can see the robot):

    python robot_agent.py --url https://robots.example.org --robot 3 --key rbk_3_...

The key is created by an admin on the robot's page ("Live status" -> "Create key").
By default it reports "idle" every 30 s. With --ping it checks the robot's controller (e.g. a Franka's
control box) and reports "controller_offline" when it does not answer. For more detail (running program,
errors, battery) adapt `read_status()`, e.g. to read a ROS topic or the robot's own API.
"""

import argparse
import json
import platform
import subprocess
import sys
import time
import urllib.error
import urllib.request


def reachable(host: str) -> bool:
    """One ping with a 1 s timeout."""
    count = "-n" if platform.system() == "Windows" else "-c"
    wait = ["-w", "1000"] if platform.system() == "Windows" else ["-W", "1"]
    try:
        return subprocess.run(["ping", count, "1", *wait, host], capture_output=True, timeout=5).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def read_status(ping_host: str | None = None) -> dict:
    """Return {"state": ..., "message": ..., "battery": ...}. Extend with real checks for your robot.

    state: a short lowercase word, e.g. idle, running, error, charging, emergency_stop
    battery: percent 0-100, or None for robots without a battery (e.g. arms)
    """
    if ping_host and not reachable(ping_host):
        return {"state": "controller_offline", "message": f"{ping_host} does not answer", "battery": None}
    return {"state": "idle", "message": None, "battery": None}


def send(url: str, robot: int, key: str, status: dict) -> None:
    request = urllib.request.Request(
        f"{url.rstrip('/')}/api/robots/{robot}/heartbeat",
        data=json.dumps(status).encode(),
        headers={"Content-Type": "application/json", "X-Robot-Key": key},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        response.read()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--url", required=True, help="Robot Hub address, e.g. https://robots.example.org")
    parser.add_argument("--robot", type=int, required=True, help="Robot id (from its page URL)")
    parser.add_argument("--key", required=True, help="The robot's API key")
    parser.add_argument("--interval", type=float, default=30, help="Seconds between reports (default 30)")
    parser.add_argument("--once", action="store_true", help="Send one report and exit")
    parser.add_argument("--ping", metavar="HOST", help="Robot controller to ping, e.g. 172.16.0.2")
    args = parser.parse_args()

    while True:
        try:
            send(args.url, args.robot, args.key, read_status(args.ping))
        except urllib.error.HTTPError as e:
            print(f"Hub rejected the report: HTTP {e.code}", file=sys.stderr)
            if e.code == 401:
                return 1  # wrong key: retrying won't help
        except OSError as e:
            print(f"Hub not reachable: {e}", file=sys.stderr)
        if args.once:
            return 0
        time.sleep(args.interval)


if __name__ == "__main__":
    sys.exit(main())
