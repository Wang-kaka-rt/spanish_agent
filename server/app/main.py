from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal, close_redis, init_db
from app.routers import chat, contracts, health, laws, templates
from app.services.template_service import TemplateService

settings = get_settings()
template_service = TemplateService()


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.templates_dir.mkdir(parents=True, exist_ok=True)
    settings.exports_dir.mkdir(parents=True, exist_ok=True)
    if settings.auto_create_tables:
        await init_db()
    if settings.auto_ingest_templates:
        async with AsyncSessionLocal() as db:
            await template_service.ingest_resource_templates_if_empty(db, settings.resource_templates_dir)
    yield
    await close_redis()


app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(templates.router, prefix=settings.api_prefix)
app.include_router(laws.router, prefix=settings.api_prefix)
app.include_router(contracts.router, prefix=settings.api_prefix)
app.include_router(chat.router, prefix=settings.api_prefix)
