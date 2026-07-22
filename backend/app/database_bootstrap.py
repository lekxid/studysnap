from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

import app.models  # noqa: F401
from app.database import Base, engine


ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"
ALEMBIC_DIRECTORY = ALEMBIC_INI.parent / "alembic"


def build_alembic_config() -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option(
        "script_location",
        str(ALEMBIC_DIRECTORY),
    )
    return config


def main() -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    application_tables = existing_tables - {"alembic_version"}

    config = build_alembic_config()

    if not application_tables:
        print(
            "No existing StudySnap tables found. "
            "Creating the current database schema."
        )

        Base.metadata.create_all(bind=engine)

        command.stamp(
            config,
            "head",
            purge=True,
        )

        print(
            "StudySnap database initialized and stamped "
            "at the latest migration."
        )
        return

    if "alembic_version" not in existing_tables:
        raise RuntimeError(
            "The database contains application tables but has no "
            "Alembic version record. Refusing to guess its migration "
            "state. Back up and review this database manually."
        )

    print(
        "Existing migrated database found. "
        "Applying pending migrations."
    )

    command.upgrade(config, "head")

    print("StudySnap database migrations are current.")


if __name__ == "__main__":
    main()
