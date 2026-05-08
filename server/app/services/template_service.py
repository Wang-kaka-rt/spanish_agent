from pathlib import Path
from typing import Iterable
from uuid import uuid4

import aiofiles
from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.db_models import ContractTemplate
from app.services.document_parser import DocumentParser

settings = get_settings()


class TemplateService:
    async def count_templates(self, db: AsyncSession) -> int:
        result = await db.scalar(select(func.count()).select_from(ContractTemplate))
        return int(result or 0)

    async def list_templates(self, db: AsyncSession) -> list[ContractTemplate]:
        result = await db.scalars(select(ContractTemplate).order_by(ContractTemplate.created_at.desc()))
        return list(result.all())

    async def get_template(self, db: AsyncSession, template_id: str) -> ContractTemplate:
        template = await db.get(ContractTemplate, template_id)
        if not template:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        return template

    async def upload_template(
        self,
        db: AsyncSession,
        file: UploadFile,
        category: str,
        subcategory: str | None = None,
        language: str = "es",
    ) -> ContractTemplate:
        suffix = Path(file.filename or "").suffix.lower()
        if suffix not in {".docx", ".pdf"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only DOCX and PDF are supported")

        storage_name = f"{uuid4()}_{file.filename}"
        target = settings.templates_dir / storage_name
        async with aiofiles.open(target, "wb") as out_file:
            while chunk := await file.read(1024 * 1024):
                await out_file.write(chunk)

        raw_text = DocumentParser.parse(target)
        template = ContractTemplate(
            title=Path(file.filename or storage_name).stem,
            category=category,
            subcategory=subcategory,
            file_name=file.filename or storage_name,
            file_path=str(target),
            raw_text=raw_text,
            language=language,
        )
        db.add(template)
        await db.commit()
        await db.refresh(template)
        return template

    async def deactivate_template(self, db: AsyncSession, template_id: str) -> ContractTemplate:
        template = await self.get_template(db, template_id)
        template.is_active = False
        await db.commit()
        await db.refresh(template)
        return template

    async def ingest_file(
        self,
        db: AsyncSession,
        file_path: Path,
        category: str,
        subcategory: str | None = None,
        language: str = "es",
    ) -> ContractTemplate:
        raw_text = DocumentParser.parse(file_path)
        template = ContractTemplate(
            title=file_path.stem,
            category=category,
            subcategory=subcategory,
            file_name=file_path.name,
            file_path=str(file_path),
            raw_text=raw_text,
            language=language,
        )
        db.add(template)
        await db.commit()
        await db.refresh(template)
        return template

    def iter_resource_templates(self, resource_root: Path) -> Iterable[tuple[Path, str, str | None]]:
        for file_path in resource_root.rglob("*"):
            if file_path.suffix.lower() not in {".docx", ".pdf"}:
                continue
            relative = file_path.relative_to(resource_root)
            parts = relative.parts
            category = parts[0] if parts else "GENERAL"
            subcategory = parts[1] if len(parts) > 2 else None
            yield file_path, category, subcategory

    async def ingest_resource_templates_if_empty(self, db: AsyncSession, resource_root: Path) -> int:
        if not resource_root.exists():
            return 0
        if await self.count_templates(db) > 0:
            return 0

        imported = 0
        for file_path, category, subcategory in self.iter_resource_templates(resource_root):
            existing = await db.scalar(select(ContractTemplate).where(ContractTemplate.file_path == str(file_path)))
            if existing:
                continue
            await self.ingest_file(db, file_path, category, subcategory)
            imported += 1
        return imported
