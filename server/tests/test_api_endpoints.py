import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.core.database import get_db
from app.models.db_models import CachedLaw, ContractTemplate
from app.routers import chat as chat_router
from app.routers import contracts as contracts_router
from app.routers import health as health_router


@pytest.mark.asyncio
async def test_health_and_contract_generate_endpoints(db_session):
    app = FastAPI()
    app.include_router(health_router.router, prefix="/api")
    app.include_router(contracts_router.router, prefix="/api")

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

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
    law = CachedLaw(
        boe_id="BOE-A-2000-544",
        title="Ley Organica 4/2000",
        category="extranjeria",
        raw_text="Texto legal de prueba.",
        source_url="https://www.boe.es/",
    )
    db_session.add(template)
    db_session.add(law)
    await db_session.commit()

    async def fake_generate_contract(*args, **kwargs):
        return None

    contracts_router.service.ai_service.generate_contract = fake_generate_contract

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        health_response = await client.get("/api/health")
        assert health_response.status_code == 200
        assert health_response.json()["status"] == "ok"

        response = await client.post(
            "/api/contracts/generate",
            json={
                "title": "Contrato API",
                "order_input": "客户王芳，NIE: Y9876543B，服务：家庭团聚居留，费用：1900欧。",
                "model_config": {
                    "provider": "local",
                    "base_url": "",
                    "model_id": "test-model",
                    "temperature": 0.1,
                },
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["title"] == "Contrato API"
        assert "PRIMERA. Partes" in payload["generated_text"]


@pytest.mark.asyncio
async def test_chat_session_endpoints(db_session):
    app = FastAPI()
    app.include_router(chat_router.router, prefix="/api")

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        create_response = await client.post("/api/chat/sessions", json={"title": "API Chat"})
        assert create_response.status_code == 200
        session_payload = create_response.json()
        assert session_payload["title"] == "API Chat"

        list_response = await client.get("/api/chat/sessions")
        assert list_response.status_code == 200
        sessions = list_response.json()
        assert len(sessions) == 1
        assert sessions[0]["id"] == session_payload["id"]
