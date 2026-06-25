#!/usr/bin/env python3
"""Build the Tissue Python backend as a standalone executable with PyInstaller.

The resulting binary is written to ``backend_dist/`` and is consumed by
``electron-builder`` via ``extraResources``.  In production the Electron main
process spawns this executable instead of a system Python interpreter.

Environment variables:
    TISSUE_BUILD_PYTHON:
        Optional path to the Python interpreter used for building.  Useful when
        the default ``.venv`` interpreter is a static build that PyInstaller
        cannot use (e.g. PlatformIO Python on macOS).  CI should use a standard
        CPython 3.11 installed via ``actions/setup-python``.
"""

import os
import platform
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIST = PROJECT_ROOT / "backend_dist"
BUILD_WORK_DIR = PROJECT_ROOT / "build" / "pyinstaller"
ENTRYPOINT = BUILD_WORK_DIR / ".pyinstaller_entrypoint.py"

VENV_PYTHON = (
    PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
    if platform.system() == "Windows"
    else PROJECT_ROOT / ".venv" / "bin" / "python"
)


def get_build_python() -> str:
    """Return the Python interpreter to use for the build."""
    env_override = os.environ.get("TISSUE_BUILD_PYTHON")
    if env_override:
        return env_override
    if VENV_PYTHON.exists():
        return str(VENV_PYTHON)
    return sys.executable


def ensure_pyinstaller(python: str) -> None:
    """Install PyInstaller if it is not already present in the build environment."""
    try:
        subprocess.run(
            [python, "-m", "PyInstaller", "--version"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("PyInstaller not found, installing...")
        subprocess.check_call(
            [python, "-m", "pip", "install", "--quiet", "pyinstaller>=6.0"]
        )


def write_entrypoint() -> None:
    """Create a small launcher that runs the desktop FastAPI app via uvicorn."""
    BUILD_WORK_DIR.mkdir(parents=True, exist_ok=True)
    ENTRYPOINT.write_text(
        textwrap.dedent(
            """
            import os

            import uvicorn

            # Make sure the bundled app package is importable before uvicorn
            # tries to resolve the app object by import string.
            import app.desktop_main  # noqa: F401

            host = os.environ.get("TISSUE_DESKTOP_HOST", "127.0.0.1")
            port = int(os.environ.get("TISSUE_DESKTOP_PORT", "8000"))
            uvicorn.run(
                app.desktop_main.app,
                host=host,
                port=port,
                log_level="info",
            )
            """
        ).strip(),
        encoding="utf-8",
    )


def build_env_for_analysis() -> dict[str, str]:
    """Return environment variables that keep PyInstaller analysis hermetic.

    Importing ``app.desktop_main`` at build time runs Alembic migrations and
    creates log/database files.  Point those side effects at a temporary
    directory so they do not pollute the repository or the real data dir.
    """
    analysis_data_dir = BUILD_WORK_DIR / "analysis-data"
    analysis_data_dir.mkdir(parents=True, exist_ok=True)
    return {
        **os.environ,
        "TISSUE_DESKTOP": "1",
        "TISSUE_DESKTOP_DATA_DIR": str(analysis_data_dir),
        "TISSUE_API_PREFIX": "/api",
    }


def main() -> None:
    python = get_build_python()
    print(f"Building backend with Python: {python}")
    ensure_pyinstaller(python)

    write_entrypoint()

    # Fresh output directory.
    if BACKEND_DIST.exists():
        shutil.rmtree(BACKEND_DIST)
    BACKEND_DIST.mkdir(parents=True, exist_ok=True)

    sep = os.pathsep
    # Use absolute paths so PyInstaller resolves them regardless of specpath.
    data_args = [
        "--add-data",
        f"{PROJECT_ROOT / 'alembic'}{sep}alembic",
        "--add-data",
        f"{PROJECT_ROOT / 'alembic.ini'}{sep}.",
    ]

    hidden_imports = [
        "app.desktop_main",
        "app.main",
        "qbittorrent_api",
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "sqlalchemy.dialects.sqlite",
        "alembic",
        "passlib.handlers.bcrypt",
        "pkg_resources",
    ]

    collect_all = [
        "lxml",
        "curl_cffi",
        "PIL",
        "charset_normalizer",
        "yaml",
    ]

    cmd = [
        python,
        "-m",
        "PyInstaller",
        "--name",
        "tissue-backend",
        "--onefile",
        "--clean",
        "--noconfirm",
        "--distpath",
        str(BACKEND_DIST),
        "--workpath",
        str(BUILD_WORK_DIR / "work"),
        "--specpath",
        str(BUILD_WORK_DIR),
        "--paths",
        str(PROJECT_ROOT),
        "--collect-submodules",
        "app",
        *data_args,
    ]

    for name in hidden_imports:
        cmd.extend(["--hidden-import", name])
    for pkg in collect_all:
        cmd.extend(["--collect-all", pkg])

    cmd.append(str(ENTRYPOINT))

    print("Running PyInstaller...")
    subprocess.check_call(cmd, cwd=PROJECT_ROOT, env=build_env_for_analysis())

    print(f"Backend bundle written to: {BACKEND_DIST}")
    for item in BACKEND_DIST.iterdir():
        print(f"  - {item.name}")


if __name__ == "__main__":
    main()
