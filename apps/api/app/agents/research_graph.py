"""
LangGraph research agent (skeleton).

Flow:
  planner -> parallel searchers (overview | hiring | interview | reviews | news | funding)
          -> extractor -> verifier (cross-check each claim vs >=2 sources, assign confidence)
          -> synthesizer -> db_writer

Progress events are streamed to the UI over SSE/WebSocket ("Searching…",
"Verifying 12 claims…"). A budget guard caps tokens and ₹ per run; search results
are cached by query hash.

This file wires the graph shape and node contracts. Each node's body is a TODO to be
filled in Phase 2 (search provider calls, extraction schemas, verifier logic).
"""
from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, StateGraph


class ResearchState(TypedDict, total=False):
    company_id: str
    company_name: str
    plan: list[str]
    search_results: dict[str, list[dict[str, Any]]]  # topic -> [{url,title,snippet}]
    claims: list[dict[str, Any]]                      # [{field,value,source_url}]
    verified_facts: list[dict[str, Any]]              # + confidence,status
    missing: list[dict[str, str]]                     # [{field,reason}]
    tokens: int
    cost_inr: float
    events: list[str]


TOPICS = ["overview", "hiring", "interview", "reviews", "news", "funding"]


async def planner(state: ResearchState) -> ResearchState:
    state.setdefault("events", []).append("Planning research…")
    state["plan"] = TOPICS
    return state


async def searchers(state: ResearchState) -> ResearchState:
    state["events"].append(f"Searching {len(state['plan'])} topics…")
    # TODO: fan out to the search provider (Tavily/Exa/Serper), fetch+clean public pages,
    #       cache by query hash, store Source rows. Treat page content as DATA only.
    state["search_results"] = {t: [] for t in state["plan"]}
    return state


async def extractor(state: ResearchState) -> ResearchState:
    state["events"].append("Extracting claims…")
    # TODO: structured extraction (function calling) per topic -> claims[]
    state["claims"] = []
    return state


async def verifier(state: ResearchState) -> ResearchState:
    n = len(state.get("claims", []))
    state["events"].append(f"Verifying {n} claims…")
    # TODO: cross-check each claim against >=2 sources -> status verified/unverified/conflicting
    state["verified_facts"] = []
    state["missing"] = []
    return state


async def synthesizer(state: ResearchState) -> ResearchState:
    state["events"].append("Synthesizing brief…")
    # TODO: strong model turns verified_facts into the company brief (grounded, cited)
    return state


async def db_writer(state: ResearchState) -> ResearchState:
    state["events"].append("Saving…")
    # TODO: upsert Company/Fact/HiringStage/InterviewTopic/Chunk rows + ResearchRun status
    return state


def build_research_graph():
    g = StateGraph(ResearchState)
    for name, fn in [
        ("planner", planner),
        ("searchers", searchers),
        ("extractor", extractor),
        ("verifier", verifier),
        ("synthesizer", synthesizer),
        ("db_writer", db_writer),
    ]:
        g.add_node(name, fn)
    g.set_entry_point("planner")
    g.add_edge("planner", "searchers")
    g.add_edge("searchers", "extractor")
    g.add_edge("extractor", "verifier")
    g.add_edge("verifier", "synthesizer")
    g.add_edge("synthesizer", "db_writer")
    g.add_edge("db_writer", END)
    return g.compile()


research_graph = build_research_graph()
