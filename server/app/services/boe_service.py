import re
from typing import Any
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.db_models import CachedLaw

settings = get_settings()
BOE_ID_PATTERN = re.compile(r"BOE-[A-Z]-\d{4}-\d+")


class BoeService:
    async def search(self, query: str) -> list[dict[str, Any]]:
        query = query.strip()
        if not query:
            return []
        if BOE_ID_PATTERN.fullmatch(query.upper()):
            boe_id = query.upper()
            return [{
                "boe_id": boe_id,
                "title": boe_id,
                "source_url": f"{settings.boe_web_base}/buscar/act.php?id={boe_id}",
            }]

        search_url = (
            f"{settings.boe_web_base}/buscar/legislacion.php?campo%5B0%5D=TIT&dato%5B0%5D={quote_plus(query)}"
        )
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            response = await client.get(search_url)
            response.raise_for_status()

        soup = BeautifulSoup(response.text, "lxml")
        results: list[dict[str, Any]] = []
        for item in soup.select("li.resultado-busqueda, li.resultado")[:10]:
            link = item.select_one("a")
            if not link:
                continue
            href = link.get("href", "")
            text = link.get_text(" ", strip=True)
            match = BOE_ID_PATTERN.search(item.get_text(" ", strip=True).upper()) or BOE_ID_PATTERN.search(href.upper())
            if not match:
                continue
            source_url = href if href.startswith("http") else f"{settings.boe_web_base}{href}"
            results.append({"boe_id": match.group(0), "title": text, "source_url": source_url})
        return results

    async def fetch_and_cache(
        self,
        db: AsyncSession,
        boe_id: str,
        title: str | None = None,
        source_url: str | None = None,
        category: str | None = None,
    ) -> CachedLaw:
        existing = await db.scalar(select(CachedLaw).where(CachedLaw.boe_id == boe_id))
        if existing:
            return existing

        source_url = source_url or f"{settings.boe_web_base}/buscar/act.php?id={boe_id}"
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(source_url)
            response.raise_for_status()

        soup = BeautifulSoup(response.text, "lxml")
        content_block = soup.select_one("#textoxslt") or soup.select_one("main") or soup.select_one("body")
        raw_text = content_block.get_text("\n", strip=True) if content_block else ""
        if not raw_text:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to parse BOE content")

        law = CachedLaw(
            boe_id=boe_id,
            title=title or boe_id,
            category=category,
            raw_text=raw_text,
            source_url=source_url,
        )
        db.add(law)
        await db.commit()
        await db.refresh(law)
        return law

    async def list_cached(self, db: AsyncSession) -> list[CachedLaw]:
        result = await db.scalars(select(CachedLaw).order_by(CachedLaw.fetched_at.desc()))
        return list(result.all())

    async def delete_cached(self, db: AsyncSession, law_id: str) -> None:
        law = await db.get(CachedLaw, law_id)
        if not law:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Law not found")
        await db.delete(law)
        await db.commit()
