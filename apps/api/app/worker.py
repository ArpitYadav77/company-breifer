"""
Background worker (arq). Jobs are idempotent; failures go to a dead-letter set for retry.

Jobs:
  - run_research(company_id): execute the LangGraph research agent, stream events, write facts.
  - ingest_gmail_delta(user_id): history.list from stored historyId; process new messages.
Cron:
  - renew_gmail_watch: daily (Gmail watch expires after 7 days).
  - research_stale: re-research companies whose facts are older than settings.stale_after_days.
  - poll_gmail_fallback: every 10 min if Pub/Sub push is unhealthy.
"""
from __future__ import annotations

from arq import cron
from arq.connections import RedisSettings

from app.agents.research_graph import research_graph
from app.core.config import get_settings

settings = get_settings()


async def run_research(ctx, company_id: str) -> None:
    # TODO: load company, run the graph, persist events + facts + ResearchRun.
    await research_graph.ainvoke({"company_id": company_id})


async def ingest_gmail_delta(ctx, user_id: str) -> None:
    ...  # TODO: history.list -> classify -> extract -> upsert company -> enqueue run_research


async def renew_gmail_watch(ctx) -> None:
    ...  # TODO: users.watch for every user; store new historyId + expiry


async def research_stale(ctx) -> None:
    ...  # TODO: find companies with stale facts and enqueue run_research


class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    functions = [run_research, ingest_gmail_delta]
    cron_jobs = [
        cron(renew_gmail_watch, hour={3}, minute={0}),
        cron(research_stale, hour={4}, minute={0}),
    ]
