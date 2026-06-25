from configparser import ConfigParser
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from app.utils.paths import get_config_path, get_default_media_paths


class SettingApp(BaseModel):
    timeout: int = 60
    video_path: str = Field(default_factory=lambda: get_default_media_paths()["video_path"])

    video_size_minimum: int = 100
    video_format: str = '.mp4,.mkv,.mov'


class SettingFile(BaseModel):
    path: str = Field(default_factory=lambda: get_default_media_paths()["file_path"])
    trans_mode: str = 'copy'


class SettingDownload(BaseModel):
    host: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    trans_mode: str = 'copy'
    download_path: str = Field(default_factory=lambda: get_default_media_paths()["download_path"])
    mapping_path: str = Field(default_factory=lambda: get_default_media_paths()["mapping_path"])
    trans_auto: bool = False
    delete_auto: bool = False
    category: Optional[str] = ''
    tracker_subscribe: Optional[str] = ''


class SettingNotify(BaseModel):
    type: str = 'telegram'

    webhook_url: Optional[str] = None

    telegram_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None


class SettingCookieCloud(BaseModel):
    enabled: bool = False
    host: Optional[str] = None
    uuid: Optional[str] = None
    password: Optional[str] = None


class Setting(BaseModel):
    app: SettingApp = SettingApp()
    file: SettingFile = SettingFile()
    download: SettingDownload = SettingDownload()
    notify: SettingNotify = SettingNotify()
    cookiecloud: SettingCookieCloud = SettingCookieCloud()

    def __init__(self):
        settings = Setting.read()
        super().__init__(**settings)

    @staticmethod
    def read():
        parser = ConfigParser()
        parser.read(get_config_path())
        sections = parser.sections()
        setting = {}
        for section in sections:
            setting[section] = dict(parser.items(section))

        return setting

    @staticmethod
    def write_section(section: str, setting: dict):
        parser = ConfigParser()
        parser.read(get_config_path())
        parser[section] = setting
        with open(get_config_path(), 'w') as file:
            parser.write(file)
