"""Brute-force protection on the sign-in form."""

from app.throttle import LoginThrottle, login_throttle
from tests.conftest import login


def wrong(client, username="admin"):
    return client.post("/api/auth/login", data={"username": username, "password": "guess"})


def test_account_locked_after_five_wrong_passwords(client, admin):
    for _ in range(5):
        assert wrong(client).status_code == 401
    r = wrong(client)
    assert r.status_code == 429 and 0 < int(r.headers["Retry-After"]) <= 300
    # Even the right password waits: otherwise the lock would tell a guesser when they got it.
    r = client.post("/api/auth/login", data={"username": "admin", "password": "admin-password"})
    assert r.status_code == 429


def test_username_case_does_not_bypass_the_limit(client, admin):
    for name in ["admin", "Admin", "ADMIN", "aDmin", "admiN"]:
        wrong(client, name)
    assert wrong(client).status_code == 429


def test_success_clears_the_count(client, admin):
    for _ in range(4):
        wrong(client)
    login(client, "admin", "admin-password")
    for _ in range(4):
        assert wrong(client).status_code == 401  # counting starts again


def test_other_accounts_still_sign_in(client, admin, make_member):
    make_member("alice")
    for _ in range(5):
        wrong(client)
    assert wrong(client).status_code == 429
    login(client, "alice", "secret-pass")


def test_one_address_guessing_many_accounts_is_stopped():
    """Twenty misses from one address, spread over accounts that never reach their own limit."""
    throttle = LoginThrottle(max_failures=5)
    for i in range(20):
        throttle.failed(throttle.keys(f"user{i}", "10.0.0.7"))
    assert throttle.retry_after(throttle.keys("someone-else", "10.0.0.7")) > 0
    assert throttle.retry_after(throttle.keys("someone-else", "10.0.0.8")) == 0


def test_lock_and_window_expire():
    now = [1000.0]
    throttle = LoginThrottle(max_failures=3, window=60, lockout=30, clock=lambda: now[0])
    keys = throttle.keys("bob", "10.0.0.1")
    throttle.failed(keys)
    throttle.failed(keys)
    now[0] += 61  # the first two fall out of the window
    throttle.failed(keys)
    assert throttle.retry_after(keys) == 0
    throttle.failed(keys)
    throttle.failed(keys)
    assert throttle.retry_after(keys) == 30
    now[0] += 30
    assert throttle.retry_after(keys) == 0


def test_shared_throttle_is_reset_between_tests():
    assert login_throttle.retry_after(login_throttle.keys("admin", "testclient")) == 0
