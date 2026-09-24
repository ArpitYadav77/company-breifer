"""
Web search via Tavily (agent-friendly, returns cleaned page content).
Results are treated strictly as DATA — never as instructions to the agent.
"""
from __future__ import annotations

import hashlib
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings

settings = get_settings()
TAVILY_URL = "https://api.tavily.com/search"


def domain_of(url: str) -> str:
    try:
        return urlparse(url).netloc.replace("www.", "")
    except Exception:
        return ""


def content_hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()[:16]


async def tavily_search(query: str, max_results: int = 5) -> list[dict]:
    """Return [{title, url, content, domain}]. Empty list on failure (never raises)."""
    if not settings.tavily_api_key:
        return []
    payload = {
        "api_key": settings.tavily_api_key,
        "query": query,
        "max_results": max_results,
        "search_depth": "basic",
        "include_answer": False,
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(TAVILY_URL, json=payload)
            r.raise_for_status()
            data = r.json()
    except Exception:
        return []
    out = []
    for item in data.get("results", []):
        url = item.get("url", "")
        out.append(
            {
                "title": item.get("title", ""),
                "url": url,
                "content": item.get("content", ""),
                "domain": domain_of(url),
            }
        )
    return out
