from pathlib import Path
from sqlalchemy import create_engine, QueuePool
from sqlalchemy.orm import sessionmaker

from app.db.models import Base, User
from app.middleware.requestvars import g
from app.utils.paths import get_data_dir, get_db_path
from app.utils.security import get_password_hash

# DESKTOP-MODIFIED: lazily initialised — engine/SessionFactory are set by
# _ensure_db_initialized() instead of at module-import time, so the import
# order relative to environment variable bootstrap does not matter.
engine = None
SessionFactory = None


def _ensure_db_initialized():
    """Create the database engine and session factory on first use."""
    global engine, SessionFactory
    if engine is not None:
        return

    data_dir = get_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)

    db_file = get_db_path()
    engine = create_engine(f'sqlite:///{db_file.as_posix()}',
                           pool_pre_ping=True,
                           echo=False,
                           poolclass=QueuePool,
                           pool_size=20,
                           pool_recycle=3600,
                           pool_timeout=30,
                           max_overflow=10,
                           connect_args={"timeout": 60},
                           )
    SessionFactory = sessionmaker(bind=engine, autocommit=False)


# Dependency
def get_db():
    _ensure_db_initialized()
    db = SessionFactory()
    g().db = db
    try:
        yield db
    finally:
        delattr(g(), 'db')
        db.close()


def init() -> None:
    _ensure_db_initialized()
    with SessionFactory() as db:
        user = db.query(User).filter_by(username='admin').one_or_none()
        if not user:
            user = User()
            user.username = 'admin'
            user.password = get_password_hash("password")
            user.name = "管理员"
            user.is_admin = True
            db.add(user)
            db.commit()
