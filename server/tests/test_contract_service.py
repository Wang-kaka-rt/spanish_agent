import pytest

from app.models.db_models import ContractTemplate
from app.schemas.schemas import ContractGenerateRequest
from app.services.contract_service import ContractService


@pytest.mark.asyncio
async def test_generate_contract_falls_back_and_persists(db_session, model_config):
    template = ContractTemplate(
        title="HE Reagrupacion familiar",
        category="EXTRANJERIA",
        subcategory="REAGRUPACION FAMILIAR",
        file_name="reagrupacion.docx",
        file_path="/tmp/reagrupacion.docx",
        raw_text="Plantilla base\nPRIMERA\nSEGUNDA\nCUARTA\nQUINTA",
        language="es",
        is_active=True,
    )
    db_session.add(template)
    await db_session.commit()

    service = ContractService()

    async def fake_ai_generate_contract(*args, **kwargs):
        return None

    service.ai_service.generate_contract = fake_ai_generate_contract

    payload = ContractGenerateRequest(
        title="Contrato de prueba",
        order_input="客户王芳，NIE: Y9876543B，服务：家庭团聚居留，费用：1900欧。",
        model_config=model_config,
    )

    contract = await service.generate(db_session, payload)

    assert contract.id
    assert contract.template_id == template.id
    assert contract.title == "Contrato de prueba"
    assert "PRIMERA. Partes" in (contract.generated_text or "")
    assert "CUARTA. Honorarios" in (contract.generated_text or "")
    assert contract.laws_used
