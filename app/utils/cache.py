import os.path
import hashlib
from pathlib import Path

from app.utils.paths import get_cache_dir


def _get_cache_base() -> str:
    """Return the cache directory, ensuring it exists."""
    cache_path = get_cache_dir()
    cache_path.mkdir(parents=True, exist_ok=True)
    return str(cache_path)


def get_cache_path(parent: str, path: str):
    md = hashlib.md5()
    md.update(path.encode("utf-8"))
    return os.path.join(_get_cache_base(), parent, md.hexdigest())


def cache_file(parent: str, path: str, content: bytes):
    cache_file_path = get_cache_path(parent, path)

    folder = os.path.abspath(os.path.join(cache_file_path, '..'))
    if not os.path.exists(folder):
        os.makedirs(folder)

    with open(cache_file_path, 'wb') as file:
        file.write(content)


def get_cache_file(parent: str, path: str):
    cache_file_path = get_cache_path(parent, path)
    if os.path.exists(cache_file_path):
        with open(cache_file_path, 'rb') as file:
            return file.read()
    return None


def clean_cache_file(parent: str, path: str):
    cache_file_path = get_cache_path(parent, path)
    if os.path.exists(cache_file_path):
        os.remove(cache_file_path)
