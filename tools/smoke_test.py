#!/usr/bin/env python3
"""Checks a running Robot Hub after a deployment. Standard library only, Python 3.10+.

    python tools/smoke_test.py --url https://robots.example.org
    python tools/smoke_test.py --url http://localhost:8080 --user admin --password ...

Without credentials it checks that the site and the API answer; with them it also signs in and reads
robots, reservations, tickets and statistics. Exit code 0 when everything passed, 1 otherwise.
"""

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request


class Hub:
    def __init__(self, url: str, timeout: float = 10):
        self.url = url.rstrip("/")
        self.timeout = timeout
        self.token: str | None = None

    def request(self, path: str, data: dict | None = None, form: bool = False) -> tuple[int, bytes, str]:
        headers = {}
        body = None
        if data is not None:
            if form:
                body = urllib.parse.urlencode(data).encode()
                headers["Content-Type"] = "application/x-www-form-urlencoded"
            else:
                body = json.dumps(data).encode()
                headers["Content-Type"] = "application/json"
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = urllib.request.Request(self.url + path, data=body, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return response.status, response.read(), response.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            return e.code, e.read(), e.headers.get("Content-Type", "")

    def json(self, path: str, **kwargs):
        status, body, _ = self.request(path, **kwargs)
        if status != 200:
            raise AssertionError(f"{path}: HTTP {status} {body[:200]!r}")
        return json.loads(body)


def run(url: str, user: str | None = None, password: str | None = None, frontend: bool = True) -> list[str]:
    """Run the checks; returns the failures (empty when everything passed). Prints one line per check."""
    hub = Hub(url)
    failures: list[str] = []

    def check(name: str, fn):
        try:
            detail = fn()
            print(f"  ok    {name}{f'  ({detail})' if detail else ''}")
        except (AssertionError, OSError, ValueError, KeyError) as e:
            print(f"  FAIL  {name}: {e}")
            failures.append(name)

    def health():
        assert hub.json("/api/health").get("status") == "ok", "unexpected health answer"

    def site():
        status, body, content_type = hub.request("/")
        assert status == 200 and "text/html" in content_type, f"HTTP {status}, {content_type}"
        assert b'<div id="root">' in body, "index.html without the app's root element"

    def auth_config():
        cfg = hub.json("/api/auth/config")
        return ", ".join(f"{k}={v}" for k, v in cfg.items())

    print(f"Robot Hub smoke test: {hub.url}")
    check("API health", health)
    if frontend:
        check("web app served", site)
    check("sign-in options", auth_config)

    if user and password:
        def sign_in():
            hub.token = hub.json("/api/auth/login", data={"username": user, "password": password}, form=True)[
                "access_token"
            ]
            return hub.json("/api/auth/me")["role"]

        check("sign in", sign_in)
        if hub.token:
            check("robots", lambda: f"{len(hub.json('/api/robots'))} robots")
            check("reservations", lambda: f"{len(hub.json('/api/reservations'))} reservations")
            check("tickets", lambda: f"{len(hub.json('/api/tickets?open_only=true'))} open")
            check("statistics", lambda: "ok" if "robots" in hub.json("/api/stats") else "no robots section")
    print("All checks passed." if not failures else f"{len(failures)} check(s) failed.")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--url", required=True, help="Hub address, e.g. https://robots.example.org")
    parser.add_argument("--user", help="Account to sign in with (optional)")
    parser.add_argument("--password", help="Its password")
    parser.add_argument("--api-only", action="store_true", help="Skip the web app check (backend without nginx)")
    args = parser.parse_args()
    return 1 if run(args.url, args.user, args.password, frontend=not args.api_only) else 0


if __name__ == "__main__":
    sys.exit(main())
