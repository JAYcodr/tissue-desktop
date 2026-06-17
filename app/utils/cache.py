import os.path
import hashlib
from pathlib import Path

from app.utils.paths import get_cache_dir, get_data_dir

# DESKTOP-MODIFIED: cache lives in the runtime data dir
data_dir = get_data_dir()
if not data_dir.exists():
    data_dir.mkdir(parents=True, exist_ok=True)

cache_path = get_cache_dir()


def get_cache_path(parent: str, path: str):
    md = hashlib.md5()
    md.update(path.encode("utf-8"))
    return os.path.join(cache_path, parent, md.hexdigest())


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
