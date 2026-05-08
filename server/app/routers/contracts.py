from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.schemas import ContractGenerateRequest, ContractRead, ContractUpdateRequest
from app.services.contract_service import ContractService

router = APIRouter(prefix="/contracts", tags=["contracts"])
service = ContractService()


@router.post("/generate", response_model=ContractRead)
async def generate_contract(payload: ContractGenerateRequest, db: AsyncSession = Depends(get_db)):
    return await service.generate(db, payload)


@router.get("", response_model=list[ContractRead])
async def list_contracts(db: AsyncSession = Depends(get_db)):
    return await service.list_contracts(db)


@router.get("/{contract_id}", response_model=ContractRead)
async def get_contract(contract_id: str, db: AsyncSession = Depends(get_db)):
    return await service.get_contract(db, contract_id)


@router.put("/{contract_id}", response_model=ContractRead)
async def update_contract(contract_id: str, payload: ContractUpdateRequest, db: AsyncSession = Depends(get_db)):
    return await service.update_contract(db, contract_id, payload)


@router.get("/{contract_id}/export/docx")
async def export_docx(contract_id: str, db: AsyncSession = Depends(get_db)):
    file_path = await service.export_docx(db, contract_id)
    return FileResponse(file_path, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")


@router.get("/{contract_id}/export/pdf")
async def export_pdf(contract_id: str, db: AsyncSession = Depends(get_db)):
    file_path = await service.export_pdf(db, contract_id)
    return FileResponse(file_path, media_type="application/pdf")


@router.delete("/{contract_id}")
async def delete_contract(contract_id: str, db: AsyncSession = Depends(get_db)):
    await service.delete_contract(db, contract_id)
    return {"success": True}
