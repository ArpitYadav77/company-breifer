# RecruitSage — Progress

> Read this first every session. Update after every step. Resume from "Current step".
> **Environment note:** the coding agent has **no Docker/Postgres/running stack**. It writes
> and syntax-checks code; the **runtime verification (`make verify`, Playwright, Lighthouse)
> runs on the user's machine**. Items are marked BUILT (code done, syntax-checked) vs
> VERIFIED (actually run, with the proving command).

## Current step
Phase A hardening committed. **Next action (user's machine):** `make up` (or `docker compose up -d`),
then `make verify` (or `python scripts/verify.py`); paste failures. Agent continues Phase B–E code meanwhile.

## Phase checklist
### Phase A — make it run
- [x] BUILT: healthchecks for db/redis/api/worker/web; `depends_on: service_healthy` ordering
- [x] BUILT: api binds 0.0.0.0; web binds 0.0.0.0 (`next dev -H 0.0.0.0`)
- [x] BUILT: dual API URLs — browser `NEXT_PUBLIC_API_URL=localhost:8000`, server `API_URL=api:8000`
- [x] BUILT: CORS allows web origin (dev: `*`)
- [x] BUILT: auto-migrate on api startup (`init_db`/`create_all`) — Alembic deferred to Phase F (see DECISIONS)
- [x] BUILT: `make up/down/logs/ps/verify` + `scripts/verify.py` (stdlib, cross-platform)
- [ ] VERIFIED: `make verify` passes end-to-end on host  ← **pending user run**

### Phase B — consolidate v1 into v2
- [x] BUILT: Gmail polling ingestion (`/api/sync`, reuses existing readonly token)
- [ ] Telegram in v2 (/today /brief /ask /prep /status; long-poll local, webhook when PUBLIC_URL)
- [ ] 3-min incremental poll worker via history.list (currently full-query poll)
- [ ] Pub/Sub push path behind GMAIL_PUSH_ENABLED=false + daily watch renewal (DEPLOY.md)
- [ ] v1→v2 data migration script (idempotent, dedupe via entity resolution)
- [ ] v1→v2 parity checklist; move v1 to /legacy

### Phase C — UI
- [x] BUILT: dashboard, detail drawer (provenance, salary, career, Glassdoor, links), chat box, Sync button
- [ ] design tokens + light theme + reduce-motion toggle
- [ ] 3D globe hero, /graph force graph, /pipeline Kanban, /chat global, /research SSE live progress
- [ ] command palette (Cmd/Ctrl+K), NL filter bar, skeleton/empty/error states everywhere
- [ ] Lighthouse ≥ 90; responsive to 375px; a11y (keyboard, ARIA, WCAG AA)

### Phase D — AI features
- [ ] Resume↔JD fit (local PDF), mock interview (Web Speech), prep planner (.ics), readiness score
- [ ] chat tools (search_company_knowledge, web_search_fresh, compare_companies, timeline, prep_plan, draft_email, text_to_sql read-only)
- [x] BUILT: MCP server (stdio) — list_companies/get_company_brief/search_knowledge/get_upcoming_interviews + README config (test + HTTP transport pending)

### Phase E — observability + evals (no external accounts)
- [ ] llm_calls logging (feature/model/prompt_version/tokens/cost/latency/trace); /observability cost dashboard; budget caps
- [ ] prompts in versioned files
- [ ] extraction evals (150 real emails, gitignored; silver labels; /evals review UI; P/R/F1)
- [ ] RAG evals (~60 QA; faithfulness/relevance/context-recall/citation-accuracy; vector vs hybrid+rerank)
- [ ] `make eval`; CI fast subset on cached responses; auto-generate README table

### Phase F — deploy-ready
- [ ] multi-stage Dockerfiles; Vercel + Render/Fly configs; Supabase/Neon migrations
- [ ] `.env.example` complete; `make deploy`; DEPLOY.md numbered steps
- [ ] auth when not localhost; per-user isolation; DEMO_MODE seed (public data only)

### Phase G — tests + polish + portfolio
- [ ] unit (extraction/normalize/entity-res); integration (sync/research/chat/telegram)
- [ ] Playwright e2e full flow + screenshots; final README; demo script

## Verified evidence log
- v1 app: Gmail→research→provenance dashboard→Telegram→RAG **VERIFIED** in earlier sessions (screenshots in chat history).
- v2 research: Infosys researched via Tavily+Gemini, provenance persisted, rendered in drawer — **VERIFIED** (screenshot).
- v2 chat / rich brief / Gmail polling: **BUILT, not yet VERIFIED** (needs `make verify` on host).

## Known issues / risks
- "localhost refused" reported after `docker compose restart` — root cause: `restart` can leave containers down and web/api hadn't reloaded config. Phase A healthchecks + `make up` (uses `up -d`) address this. Confirm with `docker compose ps` (all healthy).
- Gemini key has unusual `AQ.` prefix — works with LiteLLM (verified via Infosys run).
- Gemini free tier ~10 RPM — research/embeddings back off on 429; large syncs are slow by design.
- Windows: `make` may be absent — run the underlying commands (documented in Makefile header).
