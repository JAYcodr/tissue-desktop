import os

from fastapi import FastAPI

from app import middleware, db, exception
from app.scheduler import scheduler
from app.api import api_router

# DESKTOP-MODIFIED: allow Electron wrapper to mount all API routes under /api
# so the renderer can keep using the same relative paths as the Docker build.
API_PREFIX = os.environ.get("TISSUE_API_PREFIX", "")

app = FastAPI()

middleware.init(app)
exception.init(app)


@app.on_event("startup")
def on_startup():
    app.include_router(api_router, prefix=API_PREFIX)
    db.init()
    scheduler.init()


if __name__ == '__main__':
    pass
