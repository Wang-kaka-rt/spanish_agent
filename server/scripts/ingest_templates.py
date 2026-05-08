import asyncio
from pathlib import Path

from sqlalchemy import select

from app.core.database import AsyncSessionLocal, init_db
from app.models.db_models import ContractTemplate
from app.services.template_service import TemplateService

ROOT = Path(__file__).resolve().parents[2]
RESOURCE_DIR = ROOT / "resources" / "HOJA DE ENCARGO"
service = TemplateService()


async def main() -> None:
    await init_db()
    async with AsyncSessionLocal() as db:
        imported = await service.ingest_resource_templates_if_empty(db, RESOURCE_DIR)
        if imported == 0:
            for file_path, category, subcategory in service.iter_resource_templates(RESOURCE_DIR):
                existing = await db.scalar(select(ContractTemplate).where(ContractTemplate.file_path == str(file_path)))
                if existing:
                    continue
                await service.ingest_file(db, file_path, category, subcategory)
                imported += 1
                print(f"Imported: {file_path.name}")
        print(f"Total imported: {imported}")


if __name__ == "__main__":
    asyncio.run(main())
