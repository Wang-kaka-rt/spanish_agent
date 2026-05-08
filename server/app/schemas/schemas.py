from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    status: str
    app: str
    database: str
    storage: str


class ModelConfig(BaseModel):
    provider: str = "anthropic"
    api_key: str | None = None
    base_url: str | None = None
    model_id: str | None = None
    temperature: float = 0.1


class TemplateRead(BaseModel):
    id: str
    title: str
    category: str
    subcategory: str | None = None
    file_name: str
    file_path: str
    raw_text: str
    language: str
    is_active: bool
    created_at: datetime
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class LawRead(BaseModel):
    id: str
    boe_id: str
    title: str
    category: str | None = None
    raw_text: str
    source_url: str | None = None
    fetched_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BoeFetchRequest(BaseModel):
    boe_id: str
    title: str | None = None
    source_url: str | None = None
    category: str | None = None


class ContractGenerateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str | None = None
    order_input: str = Field(min_length=10)
    llm_config: ModelConfig = Field(default_factory=ModelConfig, alias="model_config")


class ContractUpdateRequest(BaseModel):
    title: str | None = None
    generated_text: str
    status: str = "draft"


class ContractRead(BaseModel):
    id: str
    title: str
    template_id: str | None = None
    order_input: str
    extracted_fields: dict[str, Any]
    generated_text: str | None = None
    laws_used: list[dict[str, Any]]
    status: str
    export_docx_path: str | None = None
    export_pdf_path: str | None = None
    created_at: datetime
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class ChatSessionCreateRequest(BaseModel):
    title: str | None = None


class ChatSessionRead(BaseModel):
    id: str
    title: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MessageRead(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
