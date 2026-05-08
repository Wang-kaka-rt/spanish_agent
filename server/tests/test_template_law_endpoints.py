import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.core.database import get_db
from app.models.db_models import CachedLaw, ContractTemplate
from app.routers import laws as laws_router
from app.routers import templates as templates_router


@pytest.mark.asyncio
async def test_template_list_and_deactivate_endpoints(db_session):
    app = FastAPI()
    app.include_router(templates_router.router, prefix="/api")

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    template = ContractTemplate(
        title="HE Prueba",
        category="GESTORIA",
        subcategory="GENERAL",
        file_name="test.docx",
        file_path="/tmp/test.docx",
        raw_text="Texto de plantilla",
        language="es",
        is_active=True,
    )
    db_session.add(template)
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        list_response = await client.get("/api/templates")
        assert list_response.status_code == 200
        payload = list_response.json()
        assert len(payload) == 1
        assert payload[0]["title"] == "HE Prueba"

        deactivate_response = await client.delete(f"/api/templates/{template.id}")
        assert deactivate_response.status_code == 200
        assert deactivate_response.json()["is_active"] is False


@pytest.mark.asyncio
async def test_law_search_list_and_delete_endpoints(db_session):
    app = FastAPI()
    app.include_router(laws_router.router, prefix="/api")

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    law = CachedLaw(
        boe_id="BOE-A-2000-544",
        title="Ley Organica 4/2000",
        category="extranjeria",
        raw_text="Texto legal de prueba",
        source_url="https://www.boe.es/",
    )
    db_session.add(law)
    await db_session.commit()

    async def fake_search(query: str):
        return [{"boe_id": "BOE-A-2000-544", "title": f"Resultado para {query}", "source_url": "https://www.boe.es/"}]

    laws_router.service.search = fake_search

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        search_response = await client.get("/api/laws/boe/search", params={"q": "Ley 4/2000"})
        assert search_response.status_code == 200
        assert search_response.json()[0]["boe_id"] == "BOE-A-2000-544"

        list_response = await client.get("/api/laws")
        assert list_response.status_code == 200
        assert len(list_response.json()) == 1

        delete_response = await client.delete(f"/api/laws/{law.id}")
        assert delete_response.status_code == 200
        assert delete_response.json()["success"] is True
