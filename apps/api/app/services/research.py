"""
Run the research agent and persist results with provenance.

Also provides create_company() + a demo user, so you can test research end-to-end
before Gmail Pub/Sub ingestion is wired (Phase 2 continues with real ingestion).
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import delete, select

from app import llm
from app.agents.research_graph import research_graph
from app.db import SessionLocal
from urllib.parse import quote_plus

from app.models import (
    Company,
    CompanyBrief,
    Fact,
    FactStatus,
    HiringStage,
    InterviewTopic,
    ResearchRun,
    ResearchStatus,
    Source,
    User,
    Chunk,
)

_THAPAR = "Thapar Institute of Engineering and Technology"


def build_links(name: str) -> dict:
    """Deterministic, ToS-safe deep-links (no scraping). Mirrors the v1 app."""
    q = quote_plus(name)
    return {
        "linkedin_company_url": f"https://www.linkedin.com/search/results/companies/?keywords={q}",
        "alumni_search_url": (
            "https://www.linkedin.com/search/results/people/?keywords="
            f"{quote_plus(name + ' ' + _THAPAR)}&origin=GLOBAL_SEARCH_HEADER"
        ),
        "glassdoor_url": f"https://www.glassdoor.com/Search/results.htm?keyword={q}",
    }
from app.services.normalize import normalize_company_name
from app.services.search import content_hash, domain_of

DEMO_EMAIL = "demo@recruitsage.local"


async def get_or_create_demo_user(session) -> User:
    u = (await session.execute(select(User).where(User.email == DEMO_EMAIL))).scalar_one_or_none()
    if not u:
        u = User(email=DEMO_EMAIL)
        session.add(u)
        await session.flush()
    return u


async def create_company(name: str) -> Company:
    """Create or return a company for the demo user (deduped by normalized name)."""
    norm = normalize_company_name(name)
    async with SessionLocal() as session:
        user = await get_or_create_demo_user(session)
        existing = (
            await session.execute(
                select(Company).where(Company.user_id == user.id, Company.normalized_name == norm)
            )
        ).scalar_one_or_none()
        if existing:
            return existing
        c = Company(user_id=user.id, name=name, normalized_name=norm)
        session.add(c)
        await session.commit()
        await session.refresh(c)
        return c


def _status_map(s: str | None) -> FactStatus:
    return {"verified": FactStatus.verified, "conflicting": FactStatus.conflicting}.get(
        s or "", FactStatus.unverified
    )


async def execute_research(company_id: str) -> dict:
    """Run the LangGraph agent for a company and persist facts/sources/stages/topics/chunks."""
    async with SessionLocal() as session:
        company = await session.get(Company, company_id)
        if not company:
            return {"ok": False, "reason": "company not found"}

        run = ResearchRun(company_id=company_id, status=ResearchStatus.researching)
        session.add(run)
        company.research_status = ResearchStatus.researching
        await session.commit()

        # --- run the pure agent graph ---
        state = await research_graph.ainvoke({"company_name": company.name})
        ex = state.get("extraction", {}) or {}
        facts = state.get("facts", []) or []
        results = state.get("all_results", []) or []

        # Replace prior research rows for this company (idempotent re-runs).
        for model in (Fact, HiringStage, InterviewTopic, Chunk):
            await session.execute(delete(model).where(model.company_id == company_id))

        # Sources: register every URL we relied on.
        url_to_source: dict[str, str] = {}
        for r in results:
            url = r.get("url")
            if not url or url in url_to_source:
                continue
            src = Source(
                url=url, title=r.get("title"), domain=domain_of(url),
                content_hash=content_hash(r.get("content", "")),
            )
            session.add(src)
            await session.flush()
            url_to_source[url] = src.id

        # Facts with provenance.
        has_conflict = False
        for f in facts:
            if f.get("status") == "conflicting":
                has_conflict = True
            session.add(
                Fact(
                    company_id=company_id,
                    field=str(f.get("field")),
                    value=str(f.get("value", "")),
                    source_id=url_to_source.get(f.get("source")),
                    confidence=float(f.get("confidence", 0.0) or 0.0),
                    status=_status_map(f.get("status")),
                )
            )

        # Hiring stages + interview topics.
        for i, name in enumerate(ex.get("hiring_stages") or []):
            session.add(HiringStage(company_id=company_id, order=i, name=str(name)))
        for cat, topics in (ex.get("interview_topics") or {}).items():
            for t in topics or []:
                session.add(InterviewTopic(company_id=company_id, category=cat, topic=str(t)))

        # Update the canonical company fields.
        company.industry = ex.get("industry") or company.industry
        company.hq_location = ex.get("hq_location") or company.hq_location
        company.hq_note = ex.get("hq_note") or company.hq_note
        company.founded_year = ex.get("founded_year") or company.founded_year
        company.website = ex.get("website") or company.website

        # Rich brief (salary, career path, Glassdoor summary, deterministic deep-links).
        links = build_links(company.name)
        rating = next((f.get("value") for f in facts if f.get("field") == "glassdoor_rating"), None)
        brief_data = {
            "salary": ex.get("salary"),
            "career_growth": ex.get("career_growth") or [],
            "glassdoor": {
                "rating": rating,
                "summary": ex.get("glassdoor_summary"),
                "positives": ex.get("glassdoor_positives") or [],
                "negatives": ex.get("glassdoor_negatives") or [],
                "url": links["glassdoor_url"],
            },
            "linkedin": {
                "company_url": links["linkedin_company_url"],
                "alumni_search_url": links["alumni_search_url"],
                "followers": None,  # never scraped
                "alumni_count": None,  # link-out only, honest
            },
        }
        existing_brief = await session.get(CompanyBrief, company_id)
        if existing_brief:
            existing_brief.data = brief_data
            existing_brief.updated_at = datetime.now(timezone.utc)
        else:
            session.add(CompanyBrief(company_id=company_id, data=brief_data))

        # Chunks for RAG (best-effort embeddings).
        texts = [state.get("brief_text", "")] + [r.get("content", "")[:1500] for r in results[:8]]
        texts = [t for t in texts if t.strip()]
        try:
            vectors = await llm.embed(texts) if texts else []
            for t, v in zip(texts, vectors):
                session.add(Chunk(company_id=company_id, text=t, embedding=v))
        except Exception:
            for t in texts:
                session.add(Chunk(company_id=company_id, text=t))

        # Final status.
        missing = state.get("missing", [])
        if not results:
            status = ResearchStatus.failed
        elif has_conflict:
            status = ResearchStatus.needs_attention
        elif missing:
            status = ResearchStatus.partial
        else:
            status = ResearchStatus.researched

        company.research_status = status
        company.research_updated_at = datetime.now(timezone.utc)
        run.status = status
        run.missing_fields = ", ".join(f"{m['field']}: {m['reason']}" for m in missing) or None
        run.finished_at = datetime.now(timezone.utc)
        await session.commit()

        return {
            "ok": True,
            "status": status.value,
            "facts": len(facts),
            "sources": len(url_to_source),
            "events": state.get("events", []),
        }
