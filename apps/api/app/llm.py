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

import time
from typing import Any, Literal

import litellm

from app.core.config import get_settings

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
    response_schema: dict[str, Any] | None = None,
    feature: str | None = None,
    prompt_version: str | None = None,
) -> tuple[str, dict[str, Any]]:
    """Return (text, meta). meta carries tokens/cost/latency for logging into llm_calls."""
    model = _model_for(route)
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    if response_schema is not None:
        kwargs["response_format"] = {"type": "json_schema", "json_schema": response_schema}

    t0 = time.perf_counter()
    resp = await litellm.acompletion(**kwargs)
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


async def embed(texts: list[str]) -> list[list[float]]:
    resp = await litellm.aembedding(model=settings.embedding_model, input=texts)
    return [d["embedding"] for d in resp["data"]]
