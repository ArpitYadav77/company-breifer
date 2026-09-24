"""HTTP routes. Thin controllers — logic lives in services/agents."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Company, CompanyBrief, Fact, HiringStage, InterviewTopic, ResearchRun, Source
from app.services.chat import answer_question
from app.services.research import create_company, execute_research

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


class CreateCompany(BaseModel):
    name: str


@router.post("/api/companies")
async def add_company(body: CreateCompany) -> dict:
    """Create a company to research (test seed until Gmail ingestion is wired)."""
    c = await create_company(body.name.strip())
    return {"company": c.model_dump()}


@router.get("/api/companies/{company_id}")
async def get_company(company_id: str, session: AsyncSession = Depends(get_session)) -> dict:
    c = await session.get(Company, company_id)
    if not c:
        return {"error": "not found"}

    facts = (await session.execute(select(Fact).where(Fact.company_id == company_id))).scalars().all()
    src_ids = {f.source_id for f in facts if f.source_id}
    sources = {
        s.id: s
        for s in (
            await session.execute(select(Source).where(Source.id.in_(src_ids)))
        ).scalars().all()
    } if src_ids else {}
    stages = (
        await session.execute(
            select(HiringStage).where(HiringStage.company_id == company_id).order_by(HiringStage.order)
        )
    ).scalars().all()
    topics = (
        await session.execute(select(InterviewTopic).where(InterviewTopic.company_id == company_id))
    ).scalars().all()
    last_run = (
        await session.execute(
            select(ResearchRun)
            .where(ResearchRun.company_id == company_id)
            .order_by(ResearchRun.started_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    brief = await session.get(CompanyBrief, company_id)

    return {
        "company": c.model_dump(),
        "brief": brief.data if brief else None,
        "facts": [
            {
                "field": f.field,
                "value": f.value,
                "confidence": f.confidence,
                "status": f.status.value,
                "source": sources[f.source_id].url if f.source_id in sources else None,
            }
            for f in facts
        ],
        "hiring_stages": [s.name for s in stages],
        "interview_topics": [{"category": t.category, "topic": t.topic} for t in topics],
        "missing": last_run.missing_fields if last_run else None,
    }


@router.post("/api/companies/{company_id}/research")
async def run_research(company_id: str, request: Request, sync: bool = False) -> dict:
    """sync=true runs inline (easy local testing); otherwise enqueue on the worker."""
    if sync:
        return await execute_research(company_id)
    await request.app.state.arq.enqueue_job("run_research", company_id)
    return {"status": "queued", "company_id": company_id}


class Ask(BaseModel):
    question: str


@router.post("/api/companies/{company_id}/chat")
async def chat(company_id: str, body: Ask) -> dict:
    """Ask RecruitSage: grounded, cited answer from this company's stored research."""
    return await answer_question(company_id, body.question)


# ---------- webhooks (stubs; Phase 2 continues) ----------
@router.post("/webhooks/gmail")
async def gmail_webhook(request: Request) -> dict:
    _ = await request.json()
    # TODO: verify Pub/Sub JWT; history.list from stored historyId; idempotent on messageId.
    return {"ok": True}


@router.post("/webhooks/telegram")
async def telegram_webhook(request: Request) -> dict:
    _ = await request.json()
    # TODO: verify secret; route /today /brief /ask /prep /status to the RAG agent.
    return {"ok": True}
