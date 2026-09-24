# ADR 0003 — Gmail ingestion: Pub/Sub push (with poll fallback)

**Status:** accepted (Phase 2)

**Context.** The current app polls Gmail from localhost, which can't run in production and wastes
API quota. We need near-real-time, quota-friendly, idempotent ingestion that survives restarts.

**Decision.** Primary path is **`users.watch` + Google Cloud Pub/Sub push** to
`POST /webhooks/gmail`. On each notification we call `history.list` from the stored `historyId`
and process only the delta. The watch is renewed by a daily cron (it expires after 7 days). A
**10-minute poll** is the fallback if push is unhealthy. All processing is idempotent, keyed on
`messageId`, so duplicates and replays are safe. Refresh tokens are encrypted at rest (Fernet).

**Trade-offs.** Push needs a public HTTPS endpoint + a GCP project/topic and IAM — more setup than
polling, but real-time and far cheaper at scale. **Operational note:** OAuth apps in "Testing"
status issue refresh tokens that expire after 7 days; the consent screen must be published (accepting
the "unverified app" warning for personal use) or sync silently breaks weekly.
