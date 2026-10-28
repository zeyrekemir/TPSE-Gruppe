"""Slows down password guessing on the sign-in form.

After `max_failures` wrong passwords for one username within `window` seconds, that username must wait
`lockout` seconds; one client address gets four times as many tries (several people may share it, e.g. a lab
network). A successful sign-in clears the username's count. Kept in memory: it applies per backend process and
resets on restart, which is enough to make guessing slow.
"""

import time
from collections import defaultdict, deque


class LoginThrottle:
    def __init__(self, max_failures: int = 5, window: float = 900, lockout: float = 300, clock=time.monotonic):
        self.max_failures = max_failures
        self.window = window
        self.lockout = lockout
        self.clock = clock
        self._failures: dict[str, deque[float]] = defaultdict(deque)
        self._blocked_until: dict[str, float] = {}

    @staticmethod
    def keys(username: str, address: str) -> list[str]:
        return [f"user:{username.strip().lower()}", f"addr:{address}"]

    def _limit(self, key: str) -> int:
        return self.max_failures * (4 if key.startswith("addr:") else 1)

    def retry_after(self, keys: list[str]) -> int:
        """Seconds until these keys may try again; 0 if they may try now."""
        now = self.clock()
        wait = max((self._blocked_until.get(k, 0) - now for k in keys), default=0)
        return max(0, int(wait + 0.999))

    def failed(self, keys: list[str]) -> None:
        now = self.clock()
        for key in keys:
            attempts = self._failures[key]
            attempts.append(now)
            while attempts and attempts[0] < now - self.window:
                attempts.popleft()
            if len(attempts) >= self._limit(key):
                self._blocked_until[key] = now + self.lockout
                attempts.clear()

    def succeeded(self, keys: list[str]) -> None:
        # Only the username: a valid sign-in must not reset an address that is guessing other accounts.
        self._failures.pop(keys[0], None)
        self._blocked_until.pop(keys[0], None)

    def reset(self) -> None:
        self._failures.clear()
        self._blocked_until.clear()


login_throttle = LoginThrottle()
