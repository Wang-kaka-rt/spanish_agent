from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.schemas import BoeFetchRequest, LawRead
from app.services.boe_service import BoeService

router = APIRouter(prefix="/laws", tags=["laws"])
service = BoeService()


@router.get("/boe/search")
async def search_boe(q: str = Query(..., min_length=2)):
    return await service.search(q)


@router.post("/boe/fetch", response_model=LawRead)
async def fetch_boe(payload: BoeFetchRequest, db: AsyncSession = Depends(get_db)):
    return await service.fetch_and_cache(db, payload.boe_id, payload.title, payload.source_url, payload.category)


@router.get("", response_model=list[LawRead])
async def list_laws(db: AsyncSession = Depends(get_db)):
    return await service.list_cached(db)


@router.delete("/{law_id}")
async def delete_law(law_id: str, db: AsyncSession = Depends(get_db)):
    await service.delete_cached(db, law_id)
    return {"success": True}
