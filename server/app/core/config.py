from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Spanish Agent Server"
    api_prefix: str = "/api"
    database_url: str = Field(default="sqlite+aiosqlite:///./storage/dev.db", alias="DATABASE_URL")
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    storage_dir: Path = Field(default=Path("storage"), alias="STORAGE_DIR")
    boe_web_base: str = Field(default="https://www.boe.es", alias="BOE_WEB_BASE")
    allowed_origins: str = Field(default="*", alias="ALLOWED_ORIGINS")
    debug: bool = Field(default=True, alias="DEBUG")
    auto_create_tables: bool = Field(default=True, alias="AUTO_CREATE_TABLES")
    auto_ingest_templates: bool = Field(default=True, alias="AUTO_INGEST_TEMPLATES")
    resources_dir: Path = Field(default=Path("../resources"), alias="RESOURCES_DIR")

    @property
    def templates_dir(self) -> Path:
        return self.storage_dir / "templates"

    @property
    def exports_dir(self) -> Path:
        return self.storage_dir / "exports"

    @property
    def resource_templates_dir(self) -> Path:
        return self.resources_dir / "HOJA DE ENCARGO"

    @property
    def allowed_origins_list(self) -> list[str]:
        if self.allowed_origins.strip() == "*":
            return ["*"]
        return [item.strip() for item in self.allowed_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
