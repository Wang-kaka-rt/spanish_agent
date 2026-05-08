from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.schemas.schemas import HealthResponse

router = APIRouter(prefix="/health", tags=["health"])
settings = get_settings()


@router.get("", response_model=HealthResponse)
async def health_check(db: AsyncSession = Depends(get_db)):
    database_status = "ok"
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        database_status = "degraded"

    storage_path = Path(settings.storage_dir)
    storage_status = "ok" if storage_path.exists() else "missing"
    return HealthResponse(status="ok", app=settings.app_name, database=database_status, storage=storage_status)
