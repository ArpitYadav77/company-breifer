"""
Provider-agnostic LLM layer (LiteLLM). Two routes:
  - cheap  : classification / extraction (structured, low cost)
  - strong : synthesis / chat

Every call is billed and logged (tokens, cost, latency, trace, prompt_version) so the
cost dashboard and evals have real data. Prompts are versioned in app/prompts/*.

SECURITY: email and web content are passed as DATA. The system prompt instructs the
model to never follow instructions found inside that content (prompt-injection defense).
"""
from __future__ import annotations

import asyncio
import re
import time
from typing import Any, Literal

import litellm

from app.core.config import get_settings


def _retry_after(err: Exception, default: float) -> float:
    m = re.search(r"retry.{0,12}?([\d.]+)\s*s", str(err), re.I)
    return float(m.group(1)) if m else default


async def _with_retry(fn, *, tries: int = 5, base: float = 20.0):
    """Retry on per-minute 429s with backoff. Fail fast on daily-quota 429s (retryDelay
    of minutes/hours) — waiting those out is pointless; surface it instead."""
    for i in range(tries):
        try:
            return await fn()
        except litellm.RateLimitError as e:
            delay = _retry_after(e, base * (i + 1))
            if delay > 120 or i == tries - 1:  # daily quota or out of tries
                raise
            await asyncio.sleep(min(delay, 65))

settings = get_settings()
Route = Literal["cheap", "strong"]

# Rough INR/1K token estimates for the cost dashboard; refine per model/provider.
_PRICE_INR = {settings.llm_cheap_model: 0.02, settings.llm_strong_model: 0.35}


def _model_for(route: Route) -> str:
    return settings.llm_strong_model if route == "strong" else settings.llm_cheap_model


async def complete(
    *,
    route: Route,
    system: str,
    user: str,
    json_mode: bool = False,
    feature: str | None = None,
    prompt_version: str | None = None,
) -> tuple[str, dict[str, Any]]:
    """Return (text, meta). meta carries tokens/cost/latency for logging into llm_calls."""
    model = _model_for(route)
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    t0 = time.perf_counter()
    resp = await _with_retry(lambda: litellm.acompletion(**kwargs))
    latency_ms = int((time.perf_counter() - t0) * 1000)

    text = resp.choices[0].message.content or ""
    usage = getattr(resp, "usage", None)
    tin = getattr(usage, "prompt_tokens", 0) or 0
    tout = getattr(usage, "completion_tokens", 0) or 0
    cost_inr = (tin + tout) / 1000 * _PRICE_INR.get(model, 0.1)

    meta = {
        "model": model,
        "feature": feature,
        "prompt_version": prompt_version,
        "tokens_in": tin,
        "tokens_out": tout,
        "cost_inr": round(cost_inr, 4),
        "latency_ms": latency_ms,
        "trace_id": getattr(resp, "id", None),
    }
    # TODO(phase 5): persist meta into llm_calls and forward a Langfuse trace (PII-redacted).
    return text, meta


EMBED_DIM = 768  # must match models.Chunk.embedding Vector(768)


async def embed(texts: list[str]) -> list[list[float]]:
    # gemini-embedding-001 defaults to 3072 dims; request 768 to match the column.
    resp = await _with_retry(
        lambda: litellm.aembedding(model=settings.embedding_model, input=texts, dimensions=EMBED_DIM)
    )
    return [d["embedding"] for d in resp["data"]]
