import os
import tempfile
from pathlib import Path

# Must be set before the app (and its engine) is imported.
# Set ROBOTS_TEST_DATABASE_URL (e.g. postgresql+psycopg://...) to run the suite against Postgres.
# WARNING: every table in that database is dropped.
_db_file = Path(tempfile.mkdtemp()) / "test.db"
os.environ["ROBOTS_DATABASE_URL"] = os.environ.get("ROBOTS_TEST_DATABASE_URL") or f"sqlite:///{_db_file.as_posix()}"
# Tests build the schema straight from the models (fast); test_migrations.py checks the migrations match.
os.environ["ROBOTS_AUTO_MIGRATE"] = "false"
os.environ["ROBOTS_BOOTSTRAP_ADMIN_USERNAME"] = "admin"
os.environ["ROBOTS_BOOTSTRAP_ADMIN_PASSWORD"] = "admin-password"

import pytest
from fastapi.testclient import TestClient

from app.config import Settings

# Tests never read a developer's backend/.env (which may switch on SSO, mail, ...).
Settings.model_config["env_file"] = None


from app.db import Base, engine
from app.main import app


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:  # runs the lifespan, which creates tables and the admin
        yield c


def login(client: TestClient, username: str, password: str) -> dict:
    r = client.post("/api/auth/login", data={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def admin(client):
    return login(client, "admin", "admin-password")


@pytest.fixture
def make_member(client, admin):
    def _make(username="alice"):
        r = client.post(
            "/api/users",
            headers=admin,
            json={"username": username, "display_name": username.title(), "password": "secret-pass"},
        )
        assert r.status_code == 201, r.text
        return login(client, username, "secret-pass")

    return _make


@pytest.fixture
def member(make_member):
    return make_member("alice")


@pytest.fixture
def robot(client, admin):
    r = client.post(
        "/api/robots",
        headers=admin,
        json={"name": "Franka 1", "type": "Franka Panda", "location": "Lab S2|02"},
    )
    assert r.status_code == 201, r.text
    return r.json()
