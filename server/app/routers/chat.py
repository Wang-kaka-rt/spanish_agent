import json

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, get_db
from app.schemas.schemas import ChatSessionCreateRequest, ChatSessionRead, MessageRead, ModelConfig
from app.services.chat_service import ChatService

router = APIRouter(prefix="/chat", tags=["chat"])
service = ChatService()


@router.post("/sessions", response_model=ChatSessionRead)
async def create_session(payload: ChatSessionCreateRequest, db: AsyncSession = Depends(get_db)):
    return await service.create_session(db, payload.title)


@router.get("/sessions", response_model=list[ChatSessionRead])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    return await service.list_sessions(db)


@router.get("/sessions/{session_id}/history", response_model=list[MessageRead])
async def session_history(session_id: str, db: AsyncSession = Depends(get_db)):
    return await service.get_history(db, session_id)


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, db: AsyncSession = Depends(get_db)):
    await service.delete_session(db, session_id)
    return {"success": True}


@router.websocket("/{session_id}")
async def chat_stream(websocket: WebSocket, session_id: str):
    await websocket.accept()
    try:
        while True:
            payload = await websocket.receive_text()
            data = json.loads(payload)
            question = data.get("question", "").strip()
            if not question:
                await websocket.send_text("[DONE]")
                continue
            model_config = ModelConfig.model_validate(data.get("model_config", {}))
            async with AsyncSessionLocal() as db:
                async for chunk in service.stream_answer(db, session_id, question, model_config):
                    await websocket.send_text(chunk)
            await websocket.send_text("[DONE]")
    except WebSocketDisconnect:
        return
