# Decisions (autonomous mode)

One line each: decision + reason. Newest at top.

- **create_all for dev migrations, Alembic for prod (Phase F)** — greenfield dev needs no
  migration history; new tables (e.g. company_briefs) appear automatically. Alembic added
  before deploy for safe prod schema changes.
- **verify is `scripts/verify.py` (stdlib), Makefile calls it** — works on Windows without
  `make`; no extra deps; runs against the live API.
- **Gmail ingestion = polling first, push behind a flag** — Pub/Sub push needs a public URL;
  impossible on localhost. Polling reuses the existing readonly token. Push documented for deploy.
- **Browser calls API directly at localhost:8000 (CORS), not via Next proxy** — a container's
  own localhost != the api container; direct call + CORS is simpler and robust in Docker.
- **Dev CORS = `*`** — convenience locally; tightened to the web origin for prod in Phase F.
- **Seed company "Stripe" in verify when DB empty** — lets `make verify` pass without Gmail,
  using only public data (never the user's emails).
- **LiteLLM cheap=gemini-2.5-flash, strong=gemini-2.5-pro** — cheap model for classify/extract,
  strong for synth/chat; swappable via env (ADR 0001).
