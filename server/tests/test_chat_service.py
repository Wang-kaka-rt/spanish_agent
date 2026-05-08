import pytest

from app.models.db_models import CachedLaw, ChatSession, ContractTemplate, Message
from app.services.chat_service import ChatService


@pytest.mark.asyncio
async def test_stream_answer_saves_messages_and_returns_chunks(db_session, model_config):
    session = ChatSession(title="Test Chat")
    db_session.add(session)
    db_session.add(
        ContractTemplate(
            title="HE Reagrupacion familiar",
            category="EXTRANJERIA",
            subcategory="REAGRUPACION FAMILIAR",
            file_name="reagrupacion.docx",
            file_path="/tmp/reagrupacion.docx",
            raw_text="Plantilla de prueba",
            language="es",
            is_active=True,
        )
    )
    db_session.add(
        CachedLaw(
            boe_id="BOE-A-2000-544",
            title="Ley Organica 4/2000",
            category="extranjeria",
            raw_text="Texto legal de prueba para reagrupacion familiar.",
            source_url="https://www.boe.es/",
        )
    )
    await db_session.commit()

    service = ChatService()

    async def fake_answer_question(*args, **kwargs):
        return (
            "Primera parte de la respuesta. "
            "Segunda parte con mas contexto practico. "
            "Tercera parte con cierre."
        )

    service.ai_service.answer_question = fake_answer_question

    chunks = []
    async for chunk in service.stream_answer(
        db_session,
        session.id,
        "Que documentos necesito para una reagrupacion familiar?",
        model_config,
    ):
        chunks.append(chunk)

    messages = (await db_session.execute(Message.__table__.select())).all()

    assert len(chunks) >= 2
    assert "".join(part if index == 0 else f" {part}" for index, part in enumerate(chunks)).replace("  ", " ").startswith(
        "Primera parte de la respuesta."
    )
    assert len(messages) == 2
