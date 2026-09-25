# Deploy RecruitSage (you paste keys; everything else is prepared)

Time estimates are rough. Local dev needs **none** of this — it's for the public/live app.

## 0. Local (no accounts) — ~5 min
```bash
cp apps/api/.env.example apps/api/.env   # add GEMINI_API_KEY, TAVILY_API_KEY (+ Gmail creds already wired)
cp apps/web/.env.example apps/web/.env
make up          # or: docker compose up -d --build
make verify      # or: python scripts/verify.py
```

## 1. Database — Supabase/Neon Postgres + pgvector — ~10 min
1. Create a project (Supabase or Neon).
2. SQL editor → run: `create extension if not exists vector; create extension if not exists pg_trgm;`
3. Copy the connection URI; set `DATABASE_URL=postgresql+asyncpg://…` (swap the driver to `+asyncpg`).

## 2. Backend + worker — Render or Fly.io — ~15 min
- Deploy `apps/api` (web service) and a second service for the worker (`arq app.worker.WorkerSettings`).
- Set env from `apps/api/.env.example`. Add a managed **Redis** (Upstash/Render) → `REDIS_URL`.
- Note the public API URL.

## 3. Frontend — Vercel — ~10 min
- Import `apps/web`. Set `NEXT_PUBLIC_API_URL` = the public API URL from step 2.
- Deploy. Note the web URL.

## 4. Auth (required off-localhost) — ~10 min
- Set a single-user password (or wire Google login). Per-user data isolation via row-level checks.

## 5. Gmail real-time push — ~20 min (optional; polling works without it)
1. GCP project → enable Gmail API + Pub/Sub.
2. Create a topic `gmail-push`; grant `gmail-api-push@system.gserviceaccount.com` Publisher.
3. Create a **push subscription** → endpoint `https://<api>/webhooks/gmail`.
4. Set `GMAIL_PUSH_ENABLED=true`, `GMAIL_PUBSUB_TOPIC=projects/<proj>/topics/gmail-push`, `PUBLIC_URL=https://<api>`.
5. **Publish the OAuth consent screen** (accept the "unverified app" warning) — Testing-mode refresh
   tokens expire after 7 days and sync will silently break otherwise.
6. The daily watch-renewal cron keeps `users.watch` alive (it expires after 7 days).

## 6. Telegram webhook — automatic
- Set `TELEGRAM_BOT_TOKEN` and `PUBLIC_URL`; the app registers the webhook on boot. Local dev uses long-polling.

## 7. Public demo
- Set `DEMO_MODE=true` on the public deployment — seeds sample companies from public data only,
  never the owner's emails.
