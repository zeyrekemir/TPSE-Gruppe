import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from .auth import hash_password
from .config import get_settings
from .db import Base, SessionLocal, engine
from .models import Role, User
from .notify import reminder_loop
from .routers import auth, live, logs, oidc, reservations, robots, stats, tickets, users


def run_migrations():
    from alembic import command
    from alembic.config import Config

    config = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")


def init_db():
    settings = get_settings()
    if settings.auto_migrate:
        run_migrations()
    else:
        Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if settings.bootstrap_admin_username and settings.bootstrap_admin_password and not db.scalar(select(User.id)):
            db.add(
                User(
                    username=settings.bootstrap_admin_username,
                    display_name="Administrator",
                    password_hash=hash_password(settings.bootstrap_admin_password),
                    role=Role.admin,
                )
            )
            db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    reminders = asyncio.create_task(reminder_loop())
    yield
    reminders.cancel()


app = FastAPI(
    title="PEARL Robot Platform",
    description="Inventory, reservations, maintenance and experiment logs for the lab's robots.",
    version="0.2.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (auth, oidc, users, robots, live, reservations, tickets, logs, stats):
    app.include_router(module.router, prefix="/api")


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok"}
