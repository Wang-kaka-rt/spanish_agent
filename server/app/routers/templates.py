from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
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


@router.get("/{template_id}/file")
async def get_template_file(template_id: str, db: AsyncSession = Depends(get_db)):
    template = await service.get_template(db, template_id)
    file_path = Path(template.file_path)
    if not file_path.is_absolute():
        file_path = Path.cwd() / file_path
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template file not found")

    media_type = "application/octet-stream"
    suffix = file_path.suffix.lower()
    if suffix == ".docx":
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif suffix == ".pdf":
        media_type = "application/pdf"

    return FileResponse(file_path, media_type=media_type, filename=template.file_name)


@router.delete("/{template_id}", response_model=TemplateRead)
async def deactivate_template(template_id: str, db: AsyncSession = Depends(get_db)):
    return await service.deactivate_template(db, template_id)
