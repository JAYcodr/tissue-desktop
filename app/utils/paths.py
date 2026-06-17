import os
import platform
from pathlib import Path

_TISSUE_DESKTOP_ENV = "TISSUE_DESKTOP"
_TISSUE_DESKTOP_DATA_DIR_ENV = "TISSUE_DESKTOP_DATA_DIR"


def is_desktop_mode() -> bool:
    """Return True when the backend is running inside the Electron desktop app."""
    return os.environ.get(_TISSUE_DESKTOP_ENV) == "1"


def get_default_desktop_data_dir() -> Path:
    """Return the default desktop user-data directory for the current OS."""
    home = Path.home()
    system = platform.system()

    if system == "Darwin":
        return home / "Library" / "Application Support" / "tissue-desktop"

    if system == "Windows":
        appdata = os.environ.get("APPDATA") or str(home / "AppData" / "Roaming")
        return Path(appdata) / "tissue-desktop"

    # Linux / other Unix: prefer XDG_DATA_HOME, otherwise ~/.tissue-desktop
    xdg_data = os.environ.get("XDG_DATA_HOME")
    if xdg_data:
        return Path(xdg_data) / "tissue-desktop"
    return home / ".tissue-desktop"


def get_desktop_data_dir() -> Path:
    """Return the configured desktop data directory."""
    env_dir = os.environ.get(_TISSUE_DESKTOP_DATA_DIR_ENV)
    if env_dir:
        return Path(env_dir)
    return get_default_desktop_data_dir()


def ensure_desktop_data_dir() -> Path:
    """Ensure the desktop data directory exists and return it."""
    data_dir = get_desktop_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def get_data_dir() -> Path:
    """Return the runtime data directory (desktop user-data or legacy ./config)."""
    if is_desktop_mode():
        return ensure_desktop_data_dir()

    # DESKTOP-MODIFIED: preserve legacy Docker/dev behavior
    legacy = Path.cwd() / "config"
    legacy.mkdir(parents=True, exist_ok=True)
    return legacy


def get_db_path() -> Path:
    return get_data_dir() / "app.db"


def get_log_path() -> Path:
    return get_data_dir() / "app.log"


def get_config_path() -> Path:
    return get_data_dir() / "app.conf"


def get_cache_dir() -> Path:
    return get_data_dir() / "cache"


def get_default_media_paths() -> dict[str, str]:
    """Return default media paths depending on runtime mode."""
    if is_desktop_mode():
        data_dir = get_data_dir()
        return {
            "video_path": str(data_dir / "media"),
            "file_path": str(data_dir / "file"),
            "download_path": str(data_dir / "downloads"),
            "mapping_path": str(data_dir / "downloads"),
        }

    return {
        "video_path": "/data/media",
        "file_path": "/data/file",
        "download_path": "/downloads",
        "mapping_path": "/downloads",
    }
