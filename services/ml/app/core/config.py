# app/core/config.py
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATA_DIR: str = "data/raw"
    ARTIFACTS_DIR: str = "services/ml/artifacts"
    RANDOM_STATE: int = 42
    MAX_DATE: str | None = None

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
BASE_PATH = Path.cwd()
