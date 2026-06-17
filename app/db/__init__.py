from pathlib import Path
from sqlalchemy import create_engine, QueuePool
from sqlalchemy.orm import sessionmaker

from app.db.models import Base, User
from app.middleware.requestvars import g
from app.utils.paths import get_data_dir, get_db_path
from app.utils.security import get_password_hash

# DESKTOP-MODIFIED: centralize data-dir resolution via app.utils.paths
data_dir = get_data_dir()
if not data_dir.exists():
    data_dir.mkdir(parents=True, exist_ok=True)

db_file = get_db_path()
engine = create_engine(f'sqlite:///{db_file.as_posix()}',
                       pool_pre_ping=True,
                       echo=False,
                       poolclass=QueuePool,
                       pool_size=1024,
                       pool_recycle=3600,
                       pool_timeout=180,
                       max_overflow=10,
                       connect_args={"timeout": 60},
                       )

SessionFactory = sessionmaker(bind=engine, autocommit=False)


# Dependency
def get_db():
    db = SessionFactory()
    g().db = db
    try:
        yield db
    finally:
        delattr(g(), 'db')
        db.close()


def init() -> None:
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
