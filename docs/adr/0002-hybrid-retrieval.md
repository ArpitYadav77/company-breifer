# ADR 0002 — Hybrid retrieval (BM25 + pgvector + rerank)

**Status:** accepted (Phase 2, implemented Phase 3)

**Context.** Company chat must answer precise questions ("What's asked in the SQL round?") and
fuzzy ones ("compare culture with Razorpay"). Pure vector search misses exact terms and
recent entities; pure keyword search misses paraphrase. We already commit to Postgres, so a
second vector service is avoidable at this scale.

**Decision.** Store `chunks` in Postgres with a `pgvector` embedding + a `tsvector` full-text
index. Retrieval = union of Postgres full-text (BM25-style `ts_rank`) and pgvector cosine
(HNSW), deduped, then a cross-encoder **reranker**, then top-k with metadata filters
(company, source type, date). Answers cite sources `[1][2]`; if retrieval is insufficient the
agent may call `web_search_fresh` and must say the answer came from a fresh search — otherwise
it replies "not found in sources".

**Consequences.** One datastore, no extra infra. Phase 5 benchmarks vector-only vs hybrid+rerank
(quality/cost/latency) and puts the table in the README. Reranker adds latency — cache per query hash.
