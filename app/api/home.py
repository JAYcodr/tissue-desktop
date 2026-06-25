import time
from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app import schema
from app.schema.home import SiteVideo
from app.schema.r import R
from app.service.spider import get_spider_service
from app.utils.paths import get_log_path

router = APIRouter()


@router.get('/ranking')
def get_rankings(site_id: int, video_type: str, cycle: str, service=Depends(get_spider_service)):
    return service.get_ranking(site_id, video_type, cycle)


@router.get('/detail')
def get_detail(site_id: int, num: str, url: str, service=Depends(get_spider_service)):
    return service.get_detail(site_id, num, url)


@router.get('/search', response_model=R[list[SiteVideo]])
def search_video(num: str, service=Depends(get_spider_service)):
    return R.list(service.search_video(num))


@router.get('/actor')
def get_actor_videos(site_id: int, code: str, page: int = 1, service=Depends(get_spider_service)):
    return R.pages(service.get_actor_videos(site_id, code, page))


@router.get('/log')
async def get_logs():
    # DESKTOP-MODIFIED: resolve log path via shared helper
    log_path = get_log_path()

    def log_generator():
        with open(log_path, 'r', encoding='utf-8') as f:
            for line in f.readlines()[-50:]:
                yield 'data: %s\n\n' % line
        # Read new lines as they're appended — tail -f style, no fd leak
        with open(log_path, 'r', encoding='utf-8') as f:
            f.seek(0, 2)
            while True:
                line = f.readline()
                if line:
                    yield 'data: %s\n\n' % line.rstrip('\n')
                else:
                    time.sleep(1)

    return StreamingResponse(log_generator(), media_type="text/event-stream")
