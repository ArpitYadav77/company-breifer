# ADR 0001 — Model routing (cheap vs strong) via LiteLLM

**Status:** accepted (Phase 2)

**Context.** Email classification/extraction runs on every message (high volume, structured,
latency-sensitive, cheap). Research synthesis and chat are lower-volume but demand stronger
reasoning and grounding. Locking to one model wastes money or quality, and vendor lock-in is a risk.

**Decision.** A thin `app/llm.py` over **LiteLLM** exposes two routes: `cheap`
(classification/extraction) and `strong` (synthesis/chat), plus an embedding call. Models are
env-configurable strings (`gemini/gemini-2.5-flash`, `gemini/gemini-2.5-pro`, …), swappable
without code changes. Every call logs model, tokens, ₹ cost, latency, trace id, and prompt
version to `llm_calls` for the cost dashboard and evals.

**Consequences.** Easy A/B of models (Phase 5 compares ≥2). One place to add caching, retries,
and Langfuse tracing. Cost estimates are approximate until per-model pricing is wired in.
