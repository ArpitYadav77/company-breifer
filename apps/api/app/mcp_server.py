"""
RecruitSage MCP server (stdio) — exposes the intelligence DB as tools for Claude
Desktop or any MCP client. Read-only. Content returned is data, not instructions.

Run:  python -m app.mcp_server   (with the same .env / DATABASE_URL as the API)

Claude Desktop config (README has the full snippet):
  "recruitsage": { "command": "python", "args": ["-m", "app.mcp_server"], "cwd": "apps/api" }
"""
from __future__ import annotations

from datetime import datetime, timezone

from mcp.server.fastmcp import FastMCP
from sqlalchemy import select

from app import llm
from app.db import SessionLocal
from app.models import Application, Chunk, Company, CompanyBrief, Fact, Source
from app.services.normalize import normalize_company_name

mcp = FastMCP("recruitsage")


@mcp.tool()
async def list_companies() -> list[dict]:
    """List researched companies with industry, HQ and research status."""
    async with SessionLocal() as s:
        rows = (
            await s.execute(select(Company).order_by(Company.last_detected_at.desc()))
        ).scalars().all()
        return [
            {"name": c.name, "industry": c.industry, "hq": c.hq_location, "status": c.research_status}
            for c in rows
        ]


@mcp.tool()
async def get_company_brief(name: str) -> dict:
    """Full brief for one company: facts (with source + confidence + status) and rich fields."""
    norm = normalize_company_name(name)
    async with SessionLocal() as s:
        c = (
            await s.execute(select(Company).where(Company.normalized_name == norm))
        ).scalar_one_or_none()
        if not c:
            return {"error": f"No company matching '{name}'."}
        facts = (await s.execute(select(Fact).where(Fact.company_id == c.id))).scalars().all()
        src_ids = {f.source_id for f in facts if f.source_id}
        srcs = {
            x.id: x.url for x in (
                await s.execute(select(Source).where(Source.id.in_(src_ids)))
            ).scalars().all()
        } if src_ids else {}
        brief = await s.get(CompanyBrief, c.id)
        return {
            "name": c.name,
            "industry": c.industry,
            "hq_location": c.hq_location,
            "status": c.research_status,
            "facts": [
                {"field": f.field, "value": f.value, "confidence": f.confidence,
                 "status": f.status.value, "source": srcs.get(f.source_id)}
                for f in facts
            ],
            "brief": brief.data if brief else None,
        }


@mcp.tool()
async def search_knowledge(query: str, k: int = 5) -> list[dict]:
    """Semantic search across all stored company research chunks (pgvector)."""
    try:
        qvec = (await llm.embed([query]))[0]
    except Exception as e:
        return [{"error": f"embedding failed: {e}"}]
    async with SessionLocal() as s:
        rows = (
            await s.execute(select(Chunk).order_by(Chunk.embedding.cosine_distance(qvec)).limit(k))
        ).scalars().all()
        out = []
        for r in rows:
            src = await s.get(Source, r.source_id) if r.source_id else None
            out.append({"text": r.text[:600], "source": src.url if src else None})
        return out


@mcp.tool()
async def get_upcoming_interviews() -> list[dict]:
    """Applications with an interview date in the future, soonest first."""
    now = datetime.now(timezone.utc)
    async with SessionLocal() as s:
        rows = (
            await s.execute(
                select(Application)
                .where(Application.interview_at.is_not(None), Application.interview_at >= now)
                .order_by(Application.interview_at)
            )
        ).scalars().all()
        out = []
        for a in rows:
            c = await s.get(Company, a.company_id)
            out.append({
                "company": c.name if c else a.company_id,
                "role": a.role,
                "interview_at": a.interview_at.isoformat() if a.interview_at else None,
            })
        return out


if __name__ == "__main__":
    mcp.run()
