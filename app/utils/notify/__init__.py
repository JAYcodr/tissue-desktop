from app.schema import VideoNotify, Setting, SubscribeNotify, CookieNotify
from app.utils.logger import logger
from app.utils.notify.base import Base
from app.utils.notify.telegram import Telegram
from app.utils.notify.webhook import Webhook


def match_notification() -> Base | None:
    setting = Setting().notify

    match setting.type:
        case 'telegram':
            return Telegram(setting)
        case 'webhook':
            return Webhook(setting)
        case _:
            logger.warning(f"未知通知类型: {setting.type}")
            return None


def send_video(video: VideoNotify):
    try:
        notification = match_notification()
        if notification:
            notification.send_video(video)
    except Exception as e:
        logger.error(f"消息发送失败：视频整理成功 — {e}")


def send_subscribe(subscribe: SubscribeNotify):
    try:
        notification = match_notification()
        if notification:
            notification.send_subscribe(subscribe)
    except Exception as e:
        logger.error(f"消息发送失败：订阅下载成功 — {e}")


def send_cookie(cookie: CookieNotify):
    try:
        notification = match_notification()
        if notification:
            notification.send_cookie(cookie)
    except Exception as e:
        logger.error(f"消息发送失败：Cookie失效 — {e}")
