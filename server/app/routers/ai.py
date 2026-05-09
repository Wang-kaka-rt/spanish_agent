import time

from fastapi import APIRouter
from pydantic import BaseModel

from app.schemas.schemas import ModelConfig
from app.services.ai_service import AIService

router = APIRouter(prefix="/ai", tags=["ai"])
service = AIService()


class ModelTestResponse(BaseModel):
    ok: bool
    latency_ms: int
    error: str | None = None


@router.post("/test", response_model=ModelTestResponse)
async def test_model(model_config: ModelConfig) -> ModelTestResponse:
    start = time.monotonic()
    try:
        await service._test_connection(model_config)
        latency = int((time.monotonic() - start) * 1000)
        return ModelTestResponse(ok=True, latency_ms=latency)
    except Exception as e:
        latency = int((time.monotonic() - start) * 1000)
        msg = str(e)
        # Extract HTTP status from httpx errors for clarity
        if hasattr(e, "response") and e.response is not None:  # type: ignore[union-attr]
            msg = f"HTTP {e.response.status_code} · {e.response.text[:200]}"  # type: ignore[union-attr]
        return ModelTestResponse(ok=False, latency_ms=latency, error=msg)
