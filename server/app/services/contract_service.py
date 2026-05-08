import html
import re
import shutil
from pathlib import Path
from typing import Any, TypedDict

from docx import Document
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.db_models import CachedLaw, Contract, ContractTemplate
from app.schemas.schemas import ContractGenerateRequest, ContractUpdateRequest, ModelConfig
from app.services.ai_service import AIService
from app.services.boe_service import BoeService

try:
    from langgraph.graph import END, StateGraph
except Exception:  # pragma: no cover
    END = None
    StateGraph = None

try:
    from weasyprint import HTML
except Exception:  # pragma: no cover
    HTML = None

settings = get_settings()

LAW_HINTS = {
    "reagrup": [{"boe_id": "BOE-A-2000-544", "title": "Ley Organica 4/2000", "category": "extranjeria"}],
    "estudio": [{"boe_id": "BOE-A-2011-7703", "title": "RD 557/2011", "category": "extranjeria"}],
    "residencia": [{"boe_id": "BOE-A-2011-7703", "title": "RD 557/2011", "category": "extranjeria"}],
    "mercantil": [{"boe_id": "BOE-A-1889-4763", "title": "Codigo Civil", "category": "civil"}],
}
MAX_GENERATION_ATTEMPTS = 3


class WorkflowState(TypedDict):
    db: AsyncSession
    title: str | None
    order_input: str
    model_config: ModelConfig
    extracted_fields: dict[str, str]
    selected_template_id: str | None
    template: ContractTemplate | None
    laws: list[dict[str, str]]
    generated_text: str
    validation_errors: list[str]
    generation_attempts: int


class ContractService:
    def __init__(self) -> None:
        self.boe_service = BoeService()
        self.ai_service = AIService()
        self.graph = self._build_workflow()

    async def generate(self, db: AsyncSession, payload: ContractGenerateRequest) -> Contract:
        initial_state: WorkflowState = {
            "db": db,
            "title": payload.title,
            "order_input": payload.order_input,
            "model_config": payload.llm_config,
            "extracted_fields": {},
            "selected_template_id": None,
            "template": None,
            "laws": [],
            "generated_text": "",
            "validation_errors": [],
            "generation_attempts": 0,
        }
        state = await self._run_workflow(initial_state)
        template = state["template"]
        if template is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Template selection failed")
        if state["validation_errors"]:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Contract validation failed: {', '.join(state['validation_errors'])}",
            )

        contract = Contract(
            title=payload.title or f"Contrato {template.title}",
            template_id=template.id,
            order_input=payload.order_input,
            extracted_fields=state["extracted_fields"],
            generated_text=state["generated_text"],
            laws_used=self._serialize_laws(state["laws"]),
            status="draft",
        )
        db.add(contract)
        await db.commit()
        await db.refresh(contract)
        return contract

    async def list_contracts(self, db: AsyncSession) -> list[Contract]:
        result = await db.scalars(select(Contract).order_by(Contract.created_at.desc()))
        return list(result.all())

    async def get_contract(self, db: AsyncSession, contract_id: str) -> Contract:
        contract = await db.get(Contract, contract_id)
        if not contract:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")
        return contract

    async def update_contract(self, db: AsyncSession, contract_id: str, payload: ContractUpdateRequest) -> Contract:
        contract = await self.get_contract(db, contract_id)
        contract.generated_text = payload.generated_text
        contract.status = payload.status
        if payload.title:
            contract.title = payload.title
        await db.commit()
        await db.refresh(contract)
        return contract

    async def delete_contract(self, db: AsyncSession, contract_id: str) -> None:
        contract = await self.get_contract(db, contract_id)
        export_dir = settings.exports_dir / contract.id
        if export_dir.exists():
            shutil.rmtree(export_dir)
        await db.delete(contract)
        await db.commit()

    async def export_docx(self, db: AsyncSession, contract_id: str) -> Path:
        contract = await self.get_contract(db, contract_id)
        export_dir = settings.exports_dir / contract.id
        export_dir.mkdir(parents=True, exist_ok=True)
        file_path = export_dir / "contract.docx"

        document = Document()
        document.add_heading(contract.title, level=1)
        for paragraph in (contract.generated_text or "").split("\n\n"):
            clean = paragraph.strip()
            if clean:
                document.add_paragraph(clean)
        document.save(file_path)

        contract.export_docx_path = str(file_path)
        contract.status = "exported"
        await db.commit()
        return file_path

    async def export_pdf(self, db: AsyncSession, contract_id: str) -> Path:
        contract = await self.get_contract(db, contract_id)
        if HTML is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="WeasyPrint is not available")

        export_dir = settings.exports_dir / contract.id
        export_dir.mkdir(parents=True, exist_ok=True)
        file_path = export_dir / "contract.pdf"
        html_text = html.escape(contract.generated_text or "")
        markup = f"<html><body><h1>{html.escape(contract.title)}</h1><pre>{html_text}</pre></body></html>"
        HTML(string=markup).write_pdf(file_path)

        contract.export_pdf_path = str(file_path)
        contract.status = "exported"
        await db.commit()
        return file_path

    async def _extract_fields(self, order_input: str, model_config: ModelConfig) -> dict[str, str]:
        ai_fields = await self.ai_service.extract_fields(order_input, model_config)
        fields: dict[str, str] = {"raw_order": order_input.strip()}
        if ai_fields:
            fields.update(ai_fields)

        nie_match = re.search(r"NIE[:\s]*([A-Z]\d{7}[A-Z])", order_input, re.IGNORECASE)
        if nie_match:
            fields["nie"] = nie_match.group(1).upper()

        fee_match = re.search(r"(\d+[\.,]?\d*)\s*eu", order_input, re.IGNORECASE)
        if fee_match:
            fields["honorarios"] = fee_match.group(1)

        service_match = re.search(r"服务[:：]\s*([^，,\n]+)|servicio[:\s]*([^，,\n]+)", order_input, re.IGNORECASE)
        if service_match:
            fields["tipo_servicio"] = next(group for group in service_match.groups() if group)

        name_match = re.search(r"客户([^，,\n]+)|cliente[:\s]*([^，,\n]+)", order_input, re.IGNORECASE)
        if name_match:
            fields["nombre"] = next(group for group in name_match.groups() if group).strip()

        return fields

    async def _select_template(self, db: AsyncSession, order_input: str) -> ContractTemplate:
        result = await db.scalars(select(ContractTemplate).where(ContractTemplate.is_active.is_(True)))
        templates = list(result.all())
        if not templates:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active templates available")

        order_lower = order_input.lower()
        scored: list[tuple[int, ContractTemplate]] = []
        for template in templates:
            haystack = " ".join(filter(None, [template.title, template.category, template.subcategory or ""])).lower()
            score = sum(1 for token in order_lower.split() if len(token) > 3 and token in haystack)
            scored.append((score, template))

        scored.sort(key=lambda item: item[0], reverse=True)
        return scored[0][1]

    async def _load_template(self, db: AsyncSession, template_id: str) -> ContractTemplate:
        template = await db.get(ContractTemplate, template_id)
        if not template:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        return template

    async def _resolve_laws(self, db: AsyncSession, order_input: str) -> list[dict[str, str]]:
        order_lower = order_input.lower()
        candidates: list[dict[str, str]] = []
        for keyword, laws in LAW_HINTS.items():
            if keyword in order_lower:
                candidates.extend(laws)
        if not candidates:
            candidates = [{"boe_id": "BOE-A-1889-4763", "title": "Codigo Civil", "category": "civil"}]

        resolved: list[dict[str, str]] = []
        for candidate in candidates:
            existing = await db.scalar(select(CachedLaw).where(CachedLaw.boe_id == candidate["boe_id"]))
            if existing:
                resolved.append({"boe_id": existing.boe_id, "title": existing.title, "raw_text": existing.raw_text})
                continue
            try:
                law = await self.boe_service.fetch_and_cache(
                    db,
                    boe_id=candidate["boe_id"],
                    title=candidate["title"],
                    category=candidate.get("category"),
                )
                resolved.append({"boe_id": law.boe_id, "title": law.title, "raw_text": law.raw_text})
            except Exception:
                resolved.append({"boe_id": candidate["boe_id"], "title": candidate["title"], "raw_text": ""})

        unique: dict[str, dict[str, str]] = {item["boe_id"]: item for item in resolved}
        return list(unique.values())

    async def _generate_contract_text(
        self,
        title: str | None,
        order_input: str,
        extracted_fields: dict[str, str],
        template: ContractTemplate,
        laws: list[dict[str, str]],
        model_config: ModelConfig,
    ) -> str:
        ai_text = await self.ai_service.generate_contract(
            order_input=order_input,
            extracted_fields=extracted_fields,
            template_title=template.title,
            template_text=template.raw_text,
            laws=laws,
            model_config=model_config,
        )
        if ai_text:
            return ai_text.strip()

        return self._compose_contract(title, order_input, extracted_fields, template, laws)

    def _compose_contract(
        self,
        title: str | None,
        order_input: str,
        extracted_fields: dict[str, str],
        template: ContractTemplate,
        laws: list[dict[str, str]],
    ) -> str:
        customer = extracted_fields.get("nombre", "la parte cliente")
        service_type = extracted_fields.get("tipo_servicio", template.title)
        fee = extracted_fields.get("honorarios", "por determinar")
        law_text = ", ".join(law["title"] for law in laws)
        template_preview = (template.raw_text or "").splitlines()[:8]
        preview = "\n".join(template_preview)

        return (
            f"{title or template.title}\n\n"
            f"PRIMERA. Partes\n"
            f"Entre el despacho profesional y {customer}, con los datos aportados en el pedido, se formaliza la presente hoja de encargo.\n\n"
            f"SEGUNDA. Objeto\n"
            f"El servicio contratado corresponde a {service_type}. El contenido inicial del pedido es: {order_input.strip()}.\n\n"
            f"TERCERA. Base documental\n"
            f"Se toma como referencia la plantilla '{template.title}' y la normativa siguiente: {law_text}.\n\n"
            f"CUARTA. Honorarios\n"
            f"Los honorarios profesionales pactados ascienden a {fee} EUR, salvo ajuste posterior por acuerdo escrito entre las partes.\n\n"
            f"QUINTA. Clausulas operativas\n"
            f"La parte cliente se compromete a facilitar documentacion veraz y completa. El despacho ejecutara las actuaciones necesarias con diligencia profesional.\n\n"
            f"SEXTA. Referencia de plantilla\n"
            f"Extracto inicial de la plantilla usada:\n{preview}"
        )

    def _validate_contract(self, generated_text: str) -> None:
        required_sections = ["PRIMERA", "CUARTA", "QUINTA"]
        missing = [section for section in required_sections if section not in generated_text]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Generated contract missing sections: {', '.join(missing)}",
            )

    def _validate_contract_sections(self, generated_text: str) -> list[str]:
        required_sections = ["PRIMERA", "CUARTA", "QUINTA"]
        return [section for section in required_sections if section not in generated_text]

    def _serialize_laws(self, laws: list[dict[str, str]]) -> list[dict[str, str]]:
        return [{"boe_id": law["boe_id"], "title": law["title"]} for law in laws]

    async def _run_workflow(self, state: WorkflowState) -> WorkflowState:
        if self.graph is not None:
            return await self.graph.ainvoke(state)
        return await self._run_workflow_fallback(state)

    def _build_workflow(self):
        if StateGraph is None or END is None:
            return None

        workflow = StateGraph(WorkflowState)
        workflow.add_node("extract_fields", self._extract_fields_node)
        workflow.add_node("select_template", self._select_template_node)
        workflow.add_node("load_template", self._load_template_node)
        workflow.add_node("fetch_laws", self._fetch_laws_node)
        workflow.add_node("generate_contract", self._generate_contract_node)
        workflow.add_node("validate_contract", self._validate_contract_node)
        workflow.set_entry_point("extract_fields")
        workflow.add_edge("extract_fields", "select_template")
        workflow.add_edge("select_template", "load_template")
        workflow.add_edge("load_template", "fetch_laws")
        workflow.add_edge("fetch_laws", "generate_contract")
        workflow.add_edge("generate_contract", "validate_contract")
        workflow.add_conditional_edges(
            "validate_contract",
            self._workflow_after_validate,
            {
                "retry_generate": "generate_contract",
                "end": END,
            },
        )
        return workflow.compile()

    async def _run_workflow_fallback(self, state: WorkflowState) -> WorkflowState:
        current_state = await self._extract_fields_node(state)
        current_state = await self._select_template_node(current_state)
        current_state = await self._load_template_node(current_state)
        current_state = await self._fetch_laws_node(current_state)
        while True:
            current_state = await self._generate_contract_node(current_state)
            current_state = await self._validate_contract_node(current_state)
            if self._workflow_after_validate(current_state) == "end":
                return current_state

    async def _extract_fields_node(self, state: WorkflowState) -> WorkflowState:
        extracted_fields = await self._extract_fields(state["order_input"], state["model_config"])
        state["extracted_fields"] = extracted_fields
        return state

    async def _select_template_node(self, state: WorkflowState) -> WorkflowState:
        template = await self._select_template(state["db"], state["order_input"])
        state["selected_template_id"] = template.id
        return state

    async def _load_template_node(self, state: WorkflowState) -> WorkflowState:
        template_id = state["selected_template_id"]
        if not template_id:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Template id missing")
        state["template"] = await self._load_template(state["db"], template_id)
        return state

    async def _fetch_laws_node(self, state: WorkflowState) -> WorkflowState:
        state["laws"] = await self._resolve_laws(state["db"], state["order_input"])
        return state

    async def _generate_contract_node(self, state: WorkflowState) -> WorkflowState:
        template = state["template"]
        if template is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Template not loaded")
        state["generation_attempts"] += 1
        state["generated_text"] = await self._generate_contract_text(
            state["title"],
            state["order_input"],
            state["extracted_fields"],
            template,
            state["laws"],
            state["model_config"],
        )
        return state

    async def _validate_contract_node(self, state: WorkflowState) -> WorkflowState:
        state["validation_errors"] = self._validate_contract_sections(state["generated_text"])
        return state

    def _workflow_after_validate(self, state: WorkflowState) -> str:
        if state["validation_errors"] and state["generation_attempts"] < MAX_GENERATION_ATTEMPTS:
            return "retry_generate"
        return "end"
