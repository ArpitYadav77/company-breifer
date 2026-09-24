"""HTTP routes. Thin controllers — logic lives in services/agents."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Company

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/api/companies")
async def list_companies(session: AsyncSession = Depends(get_session)) -> dict:
    rows = (
        await session.execute(select(Company).order_by(Company.last_detected_at.desc()))
    ).scalars().all()
    return {"companies": [c.model_dump() for c in rows]}


@router.get("/api/companies/{company_id}")
async def get_company(company_id: str, session: AsyncSession = Depends(get_session)) -> dict:
    c = await session.get(Company, company_id)
    if not c:
        return {"error": "not found"}
    # TODO: join facts (with source + confidence + status), hiring_stages, interview_topics
    return {"company": c.model_dump()}


@router.post("/api/companies/{company_id}/research")
async def enqueue_research(company_id: str, request: Request) -> dict:
    # Enqueue a background research run (arq). Idempotent per company.
    redis = request.app.state.arq
    await redis.enqueue_job("run_research", company_id)
    return {"status": "queued", "company_id": company_id}


# ---------- webhooks ----------
@router.post("/webhooks/gmail")
async def gmail_webhook(request: Request) -> dict:
    """
    Google Pub/Sub push target. Verify the JWT, decode the message, then process
    incrementally with history.list from the stored historyId. Idempotent on messageId.
    """
    _ = await request.json()
    # TODO: verify Pub/Sub JWT; enqueue "ingest_gmail_delta" for the user.
    return {"ok": True}


@router.post("/webhooks/telegram")
async def telegram_webhook(request: Request) -> dict:
    """Telegram webhook. Commands: /today /brief /ask /prep /status."""
    _ = await request.json()
    # TODO: verify secret header; route command to the same RAG agent as the web chat.
    return {"ok": True}
