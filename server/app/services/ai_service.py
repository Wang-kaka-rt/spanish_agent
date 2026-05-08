import json
import re
from collections.abc import AsyncGenerator
from typing import Any

import httpx

from app.schemas.schemas import ModelConfig


class AIService:
    async def extract_fields(self, order_input: str, model_config: ModelConfig) -> dict[str, str] | None:
        system_prompt = (
            "You extract structured contract order fields. "
            "Return JSON only. Keys can include nombre, nie, tipo_servicio, honorarios, fecha, telefono, email."
        )
        user_prompt = (
            "Extract the relevant fields from the following contract order text and return strict JSON.\n\n"
            f"{order_input}"
        )
        response_text = await self._complete_text(model_config, system_prompt, user_prompt, max_tokens=500)
        if not response_text:
            return None

        return self._parse_json_object(response_text)

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
        system_prompt = (
            "You are a Spanish legal contract drafting assistant. "
            "Draft a complete hoja de encargo in Spanish with clear sections such as PRIMERA, SEGUNDA, TERCERA, "
            "CUARTA and QUINTA. Keep the wording formal and practical."
        )
        user_prompt = (
            f"Order input:\n{order_input}\n\n"
            f"Extracted fields:\n{json.dumps(extracted_fields, ensure_ascii=True, indent=2)}\n\n"
            f"Selected template title:\n{template_title}\n\n"
            f"Selected template text:\n{template_text[:4000]}\n\n"
            f"Relevant laws:\n{law_context[:5000]}\n\n"
            "Generate the final Spanish contract text only."
        )
        return await self._complete_text(model_config, system_prompt, user_prompt, max_tokens=2200)

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
            "You are a legal assistant for Spanish immigration and contract work. "
            "Answer in Spanish, be practical, and mention uncertainty when needed."
        )
        user_prompt = (
            f"Question:\n{question}\n\n"
            f"Available template summaries:\n{json.dumps(template_summaries, ensure_ascii=True, indent=2)}\n\n"
            f"Available law cache:\n{law_context[:4000]}\n\n"
            "Provide a concise but useful answer in Spanish."
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
            "You are a legal assistant for Spanish immigration and contract work. "
            "Answer in Spanish, be practical, and mention uncertainty when needed."
        )
        user_prompt = (
            f"Question:\n{question}\n\n"
            f"Available template summaries:\n{json.dumps(template_summaries, ensure_ascii=True, indent=2)}\n\n"
            f"Available law cache:\n{law_context[:4000]}\n\n"
            "Provide a concise but useful answer in Spanish."
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
            "model": model_config.model_id or "claude-3-5-sonnet-20241022",
            "max_tokens": max_tokens,
            "temperature": model_config.temperature,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
            "stream": True,
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
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

        base_url = model_config.base_url.rstrip("/")
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
            async with httpx.AsyncClient(timeout=60.0) as client:
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
            "model": model_config.model_id or "claude-3-5-sonnet-20241022",
            "max_tokens": max_tokens,
            "temperature": model_config.temperature,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
            data = response.json()
            parts = data.get("content", [])
            texts = [part.get("text", "") for part in parts if part.get("type") == "text"]
            return "\n".join(texts).strip() or None
        except Exception:
            return None

    async def _complete_openai_compatible(
        self,
        model_config: ModelConfig,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
    ) -> str | None:
        if not model_config.base_url:
            return None

        base_url = model_config.base_url.rstrip("/")
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
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"].strip() or None
        except Exception:
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
