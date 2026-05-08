from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.schemas import TemplateRead
from app.services.template_service import TemplateService

router = APIRouter(prefix="/templates", tags=["templates"])
service = TemplateService()


@router.post("/upload", response_model=TemplateRead)
async def upload_template(
    file: UploadFile = File(...),
    category: str = Form(...),
    subcategory: str | None = Form(default=None),
    language: str = Form(default="es"),
    db: AsyncSession = Depends(get_db),
):
    return await service.upload_template(db, file, category, subcategory, language)


@router.get("", response_model=list[TemplateRead])
async def list_templates(db: AsyncSession = Depends(get_db)):
    return await service.list_templates(db)


@router.get("/{template_id}", response_model=TemplateRead)
async def get_template(template_id: str, db: AsyncSession = Depends(get_db)):
    return await service.get_template(db, template_id)


@router.delete("/{template_id}", response_model=TemplateRead)
async def deactivate_template(template_id: str, db: AsyncSession = Depends(get_db)):
    return await service.deactivate_template(db, template_id)
