import json
import re
from collections.abc import AsyncGenerator
from typing import Any

import httpx

from app.schemas.schemas import ModelConfig

MODEL_REQUEST_TIMEOUT_SECONDS = 180.0


class AIService:
    async def extract_fields(self, order_input: str, model_config: ModelConfig) -> dict[str, str] | None:
        system_prompt = (
            "You are a contract order analyst. Read the order text carefully and extract every meaningful piece of "
            "information as a flat JSON object. Use descriptive keys in Spanish or English as appropriate. "
            "Do not restrict yourself to any predefined set of keys — capture whatever the order contains. "
            "Return strict JSON only, no explanation."
        )
        user_prompt = (
            "Extract all relevant fields from the following contract order text and return strict JSON.\n\n"
            f"{order_input}"
        )
        response_text = await self._complete_text(model_config, system_prompt, user_prompt, max_tokens=800)
        if not response_text:
            return None

        return self._parse_json_object(response_text)

    async def generate_search_terms(self, order_input: str, model_config: ModelConfig) -> list[str]:
        """Generate 3-4 Spanish BOE search terms from order text in any language."""
        system_prompt = (
            "You are a Spanish legal assistant. Based on the contract order, generate 3 to 4 concise Spanish "
            "legal search terms suitable for searching the BOE (Boletín Oficial del Estado). "
            "Each term should be a short phrase or legal concept in Spanish. Return strict JSON only: "
            '{"terms": ["term1", "term2", ...]}'
        )
        user_prompt = (
            f"Contract order:\n{order_input}\n\n"
            "Generate 3-4 Spanish BOE search terms for this order."
        )
        response_text = await self._complete_text(model_config, system_prompt, user_prompt, max_tokens=200)
        if not response_text:
            return []
        data = self._parse_json_raw(response_text)
        if isinstance(data, dict):
            terms = data.get("terms", [])
            if isinstance(terms, list):
                return [str(t) for t in terms if t][:4]
        return []

    async def generate_contract(
        self,
        order_input: str,
        extracted_fields: dict[str, str],
        template_title: str,
        template_text: str,
        laws: list[dict[str, str]],
        model_config: ModelConfig,
    ) -> str | None:
        law_context = "\n\n".join(
            f"- {law['title']} ({law['boe_id']}):\n{law.get('raw_text', '')[:1800]}" for law in laws
        )
        # Pass more template content when available; cap at 6000 chars to stay within context
        template_excerpt = (template_text or "").strip()[:6000]
        has_template = bool(template_excerpt)

        system_prompt = (
            "You are a Spanish legal contract drafting assistant. "
            "Your task is to produce a complete, formal Spanish hoja de encargo (engagement letter / contract). "
            "CRITICAL RULE: If a template is provided, you MUST reproduce its EXACT heading structure, "
            "clause numbering, and section order. Do NOT change clause titles or their sequence. "
            "Only replace sample/placeholder values (names, NIE numbers, dates, fees, addresses, phone numbers) "
            "with the actual values from the order. Boilerplate clauses that do not contain variable data should "
            "be kept verbatim or near-verbatim. "
            "If a field from the order is not found in the template structure, append it in a new clause at the end. "
            "If NO template is provided, draft a standard hoja de encargo with sections: "
            "PRIMERA (Partes), SEGUNDA (Objeto), TERCERA (Honorarios), CUARTA (Obligaciones), QUINTA (Jurisdicción). "
            "Never invent specific IDs, registration numbers, or contact details not present in the order."
        )
        user_prompt = (
            f"=== ORDER INPUT ===\n{order_input}\n\n"
            f"=== EXTRACTED FIELDS ===\n{json.dumps(extracted_fields, ensure_ascii=False, indent=2)}\n\n"
            f"=== TEMPLATE TITLE ===\n{template_title}\n\n"
        )
        if has_template:
            user_prompt += (
                f"=== TEMPLATE TEXT (reproduce this structure exactly) ===\n{template_excerpt}\n\n"
            )
        if law_context.strip():
            user_prompt += f"=== RELEVANT LAWS ===\n{law_context[:4000]}\n\n"
        user_prompt += (
            "Now produce the final Spanish contract. "
            "Follow the template structure exactly. "
            "Replace sample values with real order data. "
            "Output ONLY the contract text, no explanation.\n"
        )
        return await self._complete_text(model_config, system_prompt, user_prompt, max_tokens=3000)

    async def answer_question(
        self,
        question: str,
        template_summaries: list[str],
        laws: list[dict[str, str]],
        model_config: ModelConfig,
    ) -> str | None:
        law_context = "\n\n".join(
            f"- {law['title']} ({law['boe_id']}):\n{law.get('raw_text', '')[:1200]}" for law in laws
        )
        system_prompt = (
            "You are a legal assistant specializing in Spanish immigration law and contract work. "
            "Always reply in the same language the user writes in. "
            "Be practical and mention uncertainty when needed."
        )
        user_prompt = (
            f"Question:\n{question}\n\n"
            f"Available template summaries:\n{json.dumps(template_summaries, ensure_ascii=True, indent=2)}\n\n"
            f"Available law cache:\n{law_context[:4000]}\n\n"
            "Provide a concise but useful answer."
        )
        return await self._complete_text(model_config, system_prompt, user_prompt, max_tokens=1200)

    async def stream_answer(
        self,
        question: str,
        template_summaries: list[str],
        laws: list[dict[str, str]],
        model_config: ModelConfig,
    ) -> AsyncGenerator[str, None]:
        law_context = "\n\n".join(
            f"- {law['title']} ({law['boe_id']}):\n{law.get('raw_text', '')[:1200]}" for law in laws
        )
        system_prompt = (
            "You are a legal assistant specializing in Spanish immigration law and contract work. "
            "Always reply in the same language the user writes in. "
            "Be practical and mention uncertainty when needed."
        )
        user_prompt = (
            f"Question:\n{question}\n\n"
            f"Available template summaries:\n{json.dumps(template_summaries, ensure_ascii=True, indent=2)}\n\n"
            f"Available law cache:\n{law_context[:4000]}\n\n"
            "Provide a concise but useful answer."
        )

        provider = (model_config.provider or "").strip().lower()
        if provider == "anthropic":
            async for chunk in self._stream_anthropic(model_config, system_prompt, user_prompt, max_tokens=1200):
                yield chunk
            return
        if provider in {"openai_compatible", "local"}:
            async for chunk in self._stream_openai_compatible(model_config, system_prompt, user_prompt, max_tokens=1200):
                yield chunk
            return

    def split_stream_chunks(self, text: str, target_size: int = 80) -> list[str]:
        cleaned = text.strip()
        if not cleaned:
            return []

        sentences = re.split(r"(?<=[\.\!\?\n])\s+", cleaned)
        chunks: list[str] = []
        current = ""
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            candidate = f"{current} {sentence}".strip() if current else sentence
            if len(candidate) <= target_size:
                current = candidate
                continue
            if current:
                chunks.append(current)
                current = ""
            if len(sentence) <= target_size:
                current = sentence
                continue
            words = sentence.split()
            partial = ""
            for word in words:
                next_partial = f"{partial} {word}".strip() if partial else word
                if len(next_partial) > target_size and partial:
                    chunks.append(partial)
                    partial = word
                else:
                    partial = next_partial
            if partial:
                chunks.append(partial)
        if current:
            chunks.append(current)
        return chunks

    async def _complete_text(
        self,
        model_config: ModelConfig,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
    ) -> str | None:
        provider = (model_config.provider or "").strip().lower()
        if provider == "anthropic":
            return await self._complete_anthropic(model_config, system_prompt, user_prompt, max_tokens)
        if provider in {"openai_compatible", "local"}:
            return await self._complete_openai_compatible(model_config, system_prompt, user_prompt, max_tokens)
        return None

    async def _stream_anthropic(
        self,
        model_config: ModelConfig,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
    ) -> AsyncGenerator[str, None]:
        if not model_config.api_key:
            return

        base_url = (model_config.base_url or "https://api.anthropic.com").rstrip("/")
        url = f"{base_url}/v1/messages"
        headers = {
            "content-type": "application/json",
            "x-api-key": model_config.api_key,
            "anthropic-version": "2023-06-01",
        }
        payload = {
            "model": model_config.model_id or "claude-opus-4-7",
            "max_tokens": max_tokens,
            "temperature": model_config.temperature,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
            "stream": True,
        }
        try:
            async with httpx.AsyncClient(timeout=MODEL_REQUEST_TIMEOUT_SECONDS) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        chunk = self._parse_sse_line(line, provider="anthropic")
                        if chunk:
                            yield chunk
        except Exception:
            return

    async def _stream_openai_compatible(
        self,
        model_config: ModelConfig,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
    ) -> AsyncGenerator[str, None]:
        if not model_config.base_url:
            return

        base_url = self._normalize_openai_base_url(model_config.base_url)
        url = f"{base_url}/chat/completions"
        headers = {"content-type": "application/json"}
        if model_config.api_key:
            headers["authorization"] = f"Bearer {model_config.api_key}"

        payload = {
            "model": model_config.model_id or "llama3.2",
            "temperature": model_config.temperature,
            "max_tokens": max_tokens,
            "stream": True,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        try:
            async with httpx.AsyncClient(timeout=MODEL_REQUEST_TIMEOUT_SECONDS) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        chunk = self._parse_sse_line(line, provider="openai")
                        if chunk:
                            yield chunk
        except Exception:
            return

    async def _complete_anthropic(
        self,
        model_config: ModelConfig,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
    ) -> str | None:
        if not model_config.api_key:
            return None

        base_url = (model_config.base_url or "https://api.anthropic.com").rstrip("/")
        url = f"{base_url}/v1/messages"
        headers = {
            "content-type": "application/json",
            "x-api-key": model_config.api_key,
            "anthropic-version": "2023-06-01",
        }
        payload = {
            "model": model_config.model_id or "claude-opus-4-7",
            "max_tokens": max_tokens,
            "temperature": model_config.temperature,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
        }
        try:
            async with httpx.AsyncClient(timeout=MODEL_REQUEST_TIMEOUT_SECONDS) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
            data = response.json()
            parts = data.get("content", [])
            texts = [part.get("text", "") for part in parts if part.get("type") == "text"]
            return "\n".join(texts).strip() or None
        except Exception:
            return None

    async def _test_connection(self, model_config: ModelConfig) -> str:
        """Make a minimal API call and return the response text, raising on any failure."""
        provider = (model_config.provider or "").strip().lower()
        system_prompt = "You are a test assistant."
        user_prompt = "Reply with exactly: OK"

        if provider == "anthropic":
            if not model_config.api_key:
                raise ValueError("API Key 未填写")
            base_url = (model_config.base_url or "https://api.anthropic.com").rstrip("/")
            url = f"{base_url}/v1/messages"
            headers = {
                "content-type": "application/json",
                "x-api-key": model_config.api_key,
                "anthropic-version": "2023-06-01",
            }
            payload = {
                "model": model_config.model_id or "claude-opus-4-7",
                "max_tokens": 10,
                "temperature": 0,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_prompt}],
            }
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
            data = response.json()
            parts = data.get("content", [])
            return "\n".join(p.get("text", "") for p in parts if p.get("type") == "text").strip()

        if provider in {"openai_compatible", "local"}:
            if not model_config.base_url:
                raise ValueError("Base URL 未填写")
            base_url = self._normalize_openai_base_url(model_config.base_url)
            url = f"{base_url}/chat/completions"
            headers: dict[str, str] = {"content-type": "application/json"}
            if model_config.api_key:
                headers["authorization"] = f"Bearer {model_config.api_key}"
            payload = {
                "model": model_config.model_id or "deepseek-chat",
                "max_tokens": 10,
                "temperature": 0,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            }
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"].strip()

        raise ValueError(f"未知 Provider 类型: {provider!r}")

    def _normalize_openai_base_url(self, base_url: str) -> str:
        """Ensure the base URL ends with /v1 so /chat/completions resolves correctly."""
        url = base_url.rstrip("/")
        if not url.endswith("/v1"):
            url = f"{url}/v1"
        return url

    async def _complete_openai_compatible(
        self,
        model_config: ModelConfig,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
    ) -> str | None:
        if not model_config.base_url:
            return None

        base_url = self._normalize_openai_base_url(model_config.base_url)
        url = f"{base_url}/chat/completions"
        headers = {"content-type": "application/json"}
        if model_config.api_key:
            headers["authorization"] = f"Bearer {model_config.api_key}"

        payload = {
            "model": model_config.model_id or "llama3.2",
            "temperature": model_config.temperature,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        try:
            async with httpx.AsyncClient(timeout=MODEL_REQUEST_TIMEOUT_SECONDS) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"].strip() or None
        except Exception:
            return None

    async def select_template(
        self,
        order_input: str,
        templates: list[dict[str, str]],
        model_config: ModelConfig,
    ) -> str | None:
        """Return the template_id best matching the order, or None on failure."""
        options = "\n".join(
            f"- id:{t['id']} | title:{t['title']} | category:{t.get('category', '')} | sub:{t.get('subcategory', '')} | preview:{t.get('preview', '')}"
            for t in templates
        )
        system_prompt = (
            "You are a Spanish legal assistant. Select the single most appropriate contract template "
            "for the given order based on the template title, category, and content preview. Return strict JSON only."
        )
        user_prompt = (
            f"Order:\n{order_input}\n\n"
            f"Available templates:\n{options}\n\n"
            'Return JSON: {"template_id": "<exact id value>"}'
        )
        response = await self._complete_text(model_config, system_prompt, user_prompt, max_tokens=80)
        if not response:
            return None
        parsed = self._parse_json_object(response)
        return parsed.get("template_id") if parsed else None

    async def select_laws(
        self,
        order_input: str,
        candidates: list[dict[str, str]],
        model_config: ModelConfig,
    ) -> list[str]:
        """Return list of boe_ids most relevant to the order."""
        if not candidates:
            return []
        options = "\n".join(f"- {c['boe_id']}: {c['title']}" for c in candidates)
        system_prompt = (
            "You are a Spanish legal assistant. Select the most relevant laws for the given order. "
            "Return strict JSON only."
        )
        user_prompt = (
            f"Order:\n{order_input}\n\n"
            f"Available laws:\n{options}\n\n"
            'Return JSON: {"boe_ids": ["BOE-A-...", ...]}'
        )
        response = await self._complete_text(model_config, system_prompt, user_prompt, max_tokens=200)
        if not response:
            return []
        data = self._parse_json_raw(response)
        if isinstance(data, dict):
            ids = data.get("boe_ids", [])
            if isinstance(ids, list):
                return [str(i) for i in ids if i]
        return []

    def _parse_json_raw(self, value: str) -> Any:
        for attempt in (value, value[value.find("{"):value.rfind("}") + 1] if "{" in value else ""):
            if not attempt:
                continue
            try:
                return json.loads(attempt)
            except json.JSONDecodeError:
                pass
        return None

    def _parse_json_object(self, value: str) -> dict[str, str] | None:
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return {str(key): str(item) for key, item in parsed.items() if item is not None}
        except json.JSONDecodeError:
            pass

        start = value.find("{")
        end = value.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        try:
            parsed = json.loads(value[start : end + 1])
            if isinstance(parsed, dict):
                return {str(key): str(item) for key, item in parsed.items() if item is not None}
        except json.JSONDecodeError:
            return None
        return None

    def _parse_sse_line(self, line: str, provider: str) -> str | None:
        line = line.strip()
        if not line.startswith("data:"):
            return None
        payload = line[5:].strip()
        if not payload or payload == "[DONE]":
            return None
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            return None

        if provider == "anthropic":
            if data.get("type") == "content_block_delta":
                delta = data.get("delta", {})
                return delta.get("text") or None
            return None

        choices = data.get("choices") or []
        if not choices:
            return None
        delta = choices[0].get("delta", {})
        return delta.get("content") or None
