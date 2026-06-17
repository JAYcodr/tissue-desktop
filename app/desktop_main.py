import os
import platform
from pathlib import Path


def _default_desktop_data_dir() -> str:
    """Return a sensible default user-data directory for the current platform."""
    home = Path.home()
    system = platform.system()

    if system == "Darwin":
        return str(home / "Library" / "Application Support" / "tissue-desktop")

    if system == "Windows":
        appdata = os.environ.get("APPDATA") or str(home / "AppData" / "Roaming")
        return str(Path(appdata) / "tissue-desktop")

    xdg_data = os.environ.get("XDG_DATA_HOME")
    if xdg_data:
        return str(Path(xdg_data) / "tissue-desktop")
    return str(home / ".tissue-desktop")


def _bootstrap_desktop_env() -> None:
    """Ensure the desktop environment variables are set before importing the app."""
    os.environ.setdefault("TISSUE_DESKTOP", "1")
    os.environ.setdefault("TISSUE_API_PREFIX", "/api")

    data_dir = os.environ.get("TISSUE_DESKTOP_DATA_DIR")
    if not data_dir:
        data_dir = _default_desktop_data_dir()
        os.environ["TISSUE_DESKTOP_DATA_DIR"] = data_dir

    Path(data_dir).mkdir(parents=True, exist_ok=True)


_bootstrap_desktop_env()

# Import the existing FastAPI app only after the desktop env is configured,
# because app modules resolve data/log/config paths at import time.
from app.main import app as fastapi_app
from app.utils.logger import logger
from app.utils.paths import get_db_path

app = fastapi_app


def _run_alembic() -> None:
    """Run Alembic migrations against the desktop SQLite database."""
    from alembic import command
    from alembic.config import Config

    db_file = get_db_path()
    script_location = Path(__file__).resolve().parent.parent / "alembic"
    if not script_location.exists():
        # Fallback for running from the repository root / bundled working dir.
        script_location = Path.cwd() / "alembic"

    alembic_cfg = Config()
    alembic_cfg.set_main_option("script_location", str(script_location))
    alembic_cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_file.as_posix()}")

    command.upgrade(alembic_cfg, "head")
    logger.info(f"desktop_main: alembic upgrade head completed, db={db_file}")


@app.on_event("startup")
def _desktop_startup() -> None:
    # Re-run migrations on every startup to catch any runtime config changes.
    _run_alembic()


_API_PREFIX = os.environ.get("TISSUE_API_PREFIX", "")

@app.get(f"{_API_PREFIX}/common/health")
def _health() -> dict:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    host = "127.0.0.1"
    port = int(os.environ.get("TISSUE_DESKTOP_PORT", "8000"))
    uvicorn.run(app, host=host, port=port, log_level="info")
