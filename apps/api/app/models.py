"""
RecruitSage v2 data model — provenance-first.

Every displayed fact traces to a Source with a confidence and a status
(verified / unverified / conflicting). hq_location and role_location are separate.
Chunks carry pgvector embeddings for hybrid (BM25 + vector) retrieval.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, Column, Index, Text
from sqlmodel import Field, SQLModel

EMBED_DIM = 768


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------- enums ----------
class FactStatus(str, Enum):
    verified = "verified"      # >= 2 sources agree
    unverified = "unverified"  # single source
    conflicting = "conflicting"


class ResearchStatus(str, Enum):
    pending = "pending"
    researching = "researching"
    researched = "researched"
    partial = "partial"
    needs_attention = "needs_attention"
    failed = "failed"


class EmailKind(str, Enum):
    application_confirmation = "application_confirmation"
    oa_invite = "oa_invite"
    interview_invite = "interview_invite"
    rejection = "rejection"
    offer = "offer"
    job_alert = "job_alert"
    not_recruitment = "not_recruitment"


class AppStage(str, Enum):
    applied = "applied"
    oa = "oa"
    interview = "interview"
    offer = "offer"
    rejected = "rejected"


# ---------- core ----------
class User(SQLModel, table=True):
    __tablename__ = "users"
    id: str = Field(default_factory=_uuid, primary_key=True)
    email: str = Field(index=True, unique=True)
    google_refresh_token_enc: str | None = None  # Fernet-encrypted at rest
    gmail_history_id: str | None = None
    gmail_watch_expires_at: datetime | None = None
    created_at: datetime = Field(default_factory=_now)


class Company(SQLModel, table=True):
    __tablename__ = "companies"
    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    name: str
    normalized_name: str = Field(index=True)
    industry: str | None = None
    hq_location: str | None = None       # company global HQ — never a job location
    hq_note: str | None = None           # "Global HQ" / "India office"
    founded_year: str | None = None
    website: str | None = None
    research_status: ResearchStatus = Field(default=ResearchStatus.pending)
    research_updated_at: datetime | None = None
    first_detected_at: datetime = Field(default_factory=_now)
    last_detected_at: datetime = Field(default_factory=_now)
    telegram_notified: bool = False
    __table_args__ = (Index("ix_company_user_norm", "user_id", "normalized_name", unique=True),)


class CompanyAlias(SQLModel, table=True):
    __tablename__ = "company_aliases"
    id: str = Field(default_factory=_uuid, primary_key=True)
    company_id: str = Field(foreign_key="companies.id", index=True)
    alias: str
    source: str = "email"  # email | manual | resolver


class Source(SQLModel, table=True):
    __tablename__ = "sources"
    id: str = Field(default_factory=_uuid, primary_key=True)
    url: str
    title: str | None = None
    domain: str | None = Field(default=None, index=True)
    reliability: float = 0.5  # 0..1 domain trust
    content_hash: str | None = None
    fetched_at: datetime = Field(default_factory=_now)


class Fact(SQLModel, table=True):
    """A single displayed fact, traceable to a source. Conflicts are kept, not resolved silently."""
    __tablename__ = "facts"
    id: str = Field(default_factory=_uuid, primary_key=True)
    company_id: str = Field(foreign_key="companies.id", index=True)
    field: str = Field(index=True)  # industry | hq_location | founded_year | website | glassdoor_rating | ...
    value: str
    source_id: str | None = Field(default=None, foreign_key="sources.id")
    confidence: float = 0.0
    status: FactStatus = Field(default=FactStatus.unverified)
    extracted_at: datetime = Field(default_factory=_now)
    is_stale: bool = False


class HiringStage(SQLModel, table=True):
    __tablename__ = "hiring_stages"
    id: str = Field(default_factory=_uuid, primary_key=True)
    company_id: str = Field(foreign_key="companies.id", index=True)
    order: int
    name: str
    varies_by: str | None = None
    source_id: str | None = Field(default=None, foreign_key="sources.id")


class InterviewTopic(SQLModel, table=True):
    __tablename__ = "interview_topics"
    id: str = Field(default_factory=_uuid, primary_key=True)
    company_id: str = Field(foreign_key="companies.id", index=True)
    category: str  # dsa | cs_fundamentals | sql | projects | behavioral
    topic: str
    source_id: str | None = Field(default=None, foreign_key="sources.id")


class CompanyBrief(SQLModel, table=True):
    """Richer, semi-structured brief fields (salary, career path, Glassdoor summary,
    LinkedIn/alumni deep-links). Kept as JSON so the shape can evolve without migrations."""
    __tablename__ = "company_briefs"
    company_id: str = Field(foreign_key="companies.id", primary_key=True)
    data: dict = Field(default_factory=dict, sa_column=Column(JSON))
    updated_at: datetime = Field(default_factory=_now)


# ---------- email / applications ----------
class Email(SQLModel, table=True):
    __tablename__ = "emails"
    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    message_id: str = Field(index=True, unique=True)  # idempotency key
    thread_id: str | None = None
    sender: str | None = None
    subject: str | None = None
    received_at: datetime | None = None
    kind: EmailKind = Field(default=EmailKind.not_recruitment)
    company_id: str | None = Field(default=None, foreign_key="companies.id")
    role: str | None = None
    role_location: str | None = None  # the JOB location, separate from company HQ
    processed_at: datetime = Field(default_factory=_now)


class Application(SQLModel, table=True):
    __tablename__ = "applications"
    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    company_id: str = Field(foreign_key="companies.id", index=True)
    role: str | None = None
    role_location: str | None = None
    stage: AppStage = Field(default=AppStage.applied)
    interview_at: datetime | None = None
    updated_at: datetime = Field(default_factory=_now)


# ---------- research + RAG ----------
class ResearchRun(SQLModel, table=True):
    __tablename__ = "research_runs"
    id: str = Field(default_factory=_uuid, primary_key=True)
    company_id: str = Field(foreign_key="companies.id", index=True)
    status: ResearchStatus = Field(default=ResearchStatus.researching)
    missing_fields: str | None = None  # csv of fields + reason (for Partial)
    tokens: int = 0
    cost_inr: float = 0.0
    trace_id: str | None = None
    started_at: datetime = Field(default_factory=_now)
    finished_at: datetime | None = None


class Chunk(SQLModel, table=True):
    __tablename__ = "chunks"
    id: str = Field(default_factory=_uuid, primary_key=True)
    company_id: str = Field(foreign_key="companies.id", index=True)
    source_id: str | None = Field(default=None, foreign_key="sources.id")
    text: str = Field(sa_column=Column(Text))
    embedding: list[float] | None = Field(default=None, sa_column=Column(Vector(EMBED_DIM)))


class ChatSession(SQLModel, table=True):
    __tablename__ = "chat_sessions"
    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    company_id: str | None = Field(default=None, foreign_key="companies.id")  # null = global chat
    created_at: datetime = Field(default_factory=_now)


class ChatMessage(SQLModel, table=True):
    __tablename__ = "chat_messages"
    id: str = Field(default_factory=_uuid, primary_key=True)
    session_id: str = Field(foreign_key="chat_sessions.id", index=True)
    role: str  # user | assistant | tool
    content: str = Field(sa_column=Column(Text))
    citations: str | None = None  # json: [{source_id, url, title}]
    created_at: datetime = Field(default_factory=_now)


# ---------- observability / evals ----------
class LLMCall(SQLModel, table=True):
    __tablename__ = "llm_calls"
    id: str = Field(default_factory=_uuid, primary_key=True)
    model: str
    feature: str | None = None  # classify | extract | research | chat | rerank
    prompt_version: str | None = None
    tokens_in: int = 0
    tokens_out: int = 0
    cost_inr: float = 0.0
    latency_ms: int = 0
    trace_id: str | None = None
    created_at: datetime = Field(default_factory=_now)


class EvalRun(SQLModel, table=True):
    __tablename__ = "eval_runs"
    id: str = Field(default_factory=_uuid, primary_key=True)
    suite: str  # extraction | chat | research
    metric: str
    value: float
    git_sha: str | None = None
    created_at: datetime = Field(default_factory=_now)


# HNSW index for vector search is created in a migration:
#   CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);
