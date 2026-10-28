"""The Alembic migrations must produce exactly the schema the models describe."""

import tempfile
from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import inspect

from app.db import Base, make_engine

ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


def _run(engine, *args):
    config = Config(str(ALEMBIC_INI))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        args[0](config, *args[1:])


def test_upgrade_matches_models_and_downgrade_works():
    engine = make_engine(f"sqlite:///{(Path(tempfile.mkdtemp()) / 'm.db').as_posix()}")
    _run(engine, command.upgrade, "head")

    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    assert diff == [], f"models and migrations differ, run `alembic revision --autogenerate`: {diff}"

    _run(engine, command.downgrade, "base")
    assert set(inspect(engine).get_table_names()) <= {"alembic_version"}
