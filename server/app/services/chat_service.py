from collections.abc import AsyncGenerator

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db_models import CachedLaw, ChatSession, ContractTemplate, Message
from app.schemas.schemas import ModelConfig
from app.services.ai_service import AIService


class ChatService:
    def __init__(self) -> None:
        self.ai_service = AIService()

    async def create_session(self, db: AsyncSession, title: str | None = None) -> ChatSession:
        session = ChatSession(title=title or "Nueva conversacion")
        db.add(session)
        await db.commit()
        await db.refresh(session)
        return session

    async def list_sessions(self, db: AsyncSession) -> list[ChatSession]:
        result = await db.scalars(select(ChatSession).order_by(ChatSession.created_at.desc()))
        return list(result.all())

    async def get_history(self, db: AsyncSession, session_id: str) -> list[Message]:
        session = await db.get(ChatSession, session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        result = await db.scalars(
            select(Message).where(Message.session_id == session_id).order_by(Message.created_at.asc())
        )
        return list(result.all())

    async def delete_session(self, db: AsyncSession, session_id: str) -> None:
        session = await db.get(ChatSession, session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        await db.delete(session)
        await db.commit()

    async def stream_answer(
        self,
        db: AsyncSession,
        session_id: str,
        question: str,
        model_config: ModelConfig,
    ) -> AsyncGenerator[str, None]:
        session = await db.get(ChatSession, session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

        db.add(Message(session_id=session_id, role="user", content=question, input_tokens=len(question.split())))
        await db.commit()

        laws_result = await db.scalars(select(CachedLaw).order_by(CachedLaw.fetched_at.desc()).limit(3))
        laws = list(laws_result.all())
        templates_result = await db.execute(
            select(ContractTemplate.title).where(ContractTemplate.is_active.is_(True)).order_by(ContractTemplate.created_at.desc()).limit(5)
        )
        template_summaries = [row[0] for row in templates_result.all()]
        law_titles = ", ".join(law.title for law in laws) or "sin leyes cacheadas"
        law_payload = [{"boe_id": law.boe_id, "title": law.title, "raw_text": law.raw_text} for law in laws]

        stream_parts: list[str] = []
        async for chunk in self.ai_service.stream_answer(
            question=question,
            template_summaries=template_summaries,
            laws=law_payload,
            model_config=model_config,
        ):
            if chunk:
                stream_parts.append(chunk)
                yield chunk

        if stream_parts:
            answer = "".join(stream_parts).strip()
        else:
            answer = await self.ai_service.answer_question(
                question=question,
                template_summaries=template_summaries,
                laws=law_payload,
                model_config=model_config,
            )
        if not answer:
            answer = (
                f"Analisis inicial de la consulta: {question}. "
                f"Como contexto rapido, el sistema tiene disponibles estas normas: {law_titles}. "
                "No hubo respuesta del modelo configurado, por lo que se devuelve un resumen local de respaldo."
            )

        db.add(Message(session_id=session_id, role="assistant", content=answer, output_tokens=len(answer.split())))
        await db.commit()
        if not stream_parts:
            for chunk in self.ai_service.split_stream_chunks(answer):
                yield chunk
