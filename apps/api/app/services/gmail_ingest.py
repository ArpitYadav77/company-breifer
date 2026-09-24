"""
Gmail ingestion (polling) for local/dev — reuses the existing readonly OAuth token.

Flow: search RecruitSage emails -> for each UNSEEN message (idempotent on messageId):
parse -> extract company + role + role_location -> dedupe by normalized name ->
record the Email -> research NEW companies. Push (Pub/Sub) is the post-deploy upgrade.
"""
from __future__ import annotations

import asyncio
import base64
import re

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from sqlalchemy import select

from app.core.config import get_settings
from app.db import SessionLocal
from app.models import Email, EmailKind
from app.services.normalize import normalize_company_name
from app.services.research import create_company, execute_research

settings = get_settings()

# Company extraction patterns (mirror the v1 app; tuned to RecruitSage).
_PATTERNS = [
    re.compile(r"company\s*[:\-]\s*(.+?)(?:\n|$)", re.I),
    re.compile(r"^.*\bat\s+(.+?)\s*$", re.I),
    re.compile(r"new (?:job|opening|opportunity) (?:at|from)\s+(.+?)(?:\s*[-–—:|]|$)", re.I),
]
_LOC = re.compile(r"\b(?:location|job location|work location)\s*[:\-]?\s*([A-Za-z][A-Za-z .,'/&-]{1,48})", re.I)
_ROLE = re.compile(
    r"\b(software (?:engineer|developer)|data (?:analyst|scientist|engineer)|sde\s?-?\s?\d?|analyst|intern(?:ship)?|consultant|associate)\b",
    re.I,
)


def is_configured() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret and settings.gmail_refresh_token)


def _client():
    creds = Credentials(
        None,
        refresh_token=settings.gmail_refresh_token,
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        token_uri="https://oauth2.googleapis.com/token",
        scopes=["https://www.googleapis.com/auth/gmail.readonly"],
    )
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def _b64(data: str | None) -> str:
    if not data:
        return ""
    return base64.urlsafe_b64decode(data + "===").decode("utf-8", "ignore")


def _bodies(payload, acc=None):
    acc = acc if acc is not None else {"text": "", "html": ""}
    mime = payload.get("mimeType", "")
    body = payload.get("body", {})
    if mime == "text/plain" and body.get("data") and not acc["text"]:
        acc["text"] = _b64(body["data"])
    elif mime == "text/html" and body.get("data") and not acc["html"]:
        acc["html"] = _b64(body["data"])
    for part in payload.get("parts", []) or []:
        _bodies(part, acc)
    return acc


def _html_to_text(html: str) -> str:
    t = re.sub(r"<(style|script)[\s\S]*?</\1>", " ", html or "", flags=re.I)
    t = re.sub(r"<br\s*/?>", "\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"[ \t]+", " ", t).strip()


def _header(headers, name):
    for h in headers:
        if h.get("name", "").lower() == name.lower():
            return h.get("value", "")
    return ""


def _extract_company(subject: str, body: str):
    for pat in _PATTERNS:
        m = pat.search(subject) or pat.search(body)
        if m:
            cand = re.sub(r"[\"'.,;:]+$", "", m.group(1).splitlines()[0].strip())
            if 2 <= len(cand) <= 80:
                return cand
    return None


def _fetch_messages(max_messages: int):
    """Blocking Gmail calls — run via asyncio.to_thread."""
    svc = _client()
    q = f"{settings.recruitsage_gmail_query} newer_than:{settings.gmail_initial_lookback_days}d"
    resp = svc.users().messages().list(userId="me", q=q, maxResults=max_messages).execute()
    ids = [m["id"] for m in resp.get("messages", [])]
    out = []
    for mid in ids:
        m = svc.users().messages().get(userId="me", id=mid, format="full").execute()
        headers = m.get("payload", {}).get("headers", [])
        bodies = _bodies(m.get("payload", {}))
        out.append(
            {
                "message_id": m["id"],
                "thread_id": m.get("threadId"),
                "sender": _header(headers, "From"),
                "subject": _header(headers, "Subject"),
                "body": bodies["text"] or _html_to_text(bodies["html"]),
            }
        )
    return out


async def sync_gmail(max_messages: int = 30) -> dict:
    if not is_configured():
        return {"ok": False, "reason": "Gmail not configured (client id/secret/refresh token)."}

    summary = {"ok": True, "scanned": 0, "new_companies": 0, "needs_review": 0, "researched": 0, "errors": []}
    try:
        messages = await asyncio.to_thread(_fetch_messages, max_messages)
    except Exception as e:
        return {"ok": False, "reason": f"Gmail fetch failed: {e}"}

    summary["scanned"] = len(messages)
    to_research: dict[str, object] = {}

    for msg in messages:
        async with SessionLocal() as s:
            seen = (
                await s.execute(select(Email).where(Email.message_id == msg["message_id"]))
            ).scalar_one_or_none()
            if seen:
                continue

        name = _extract_company(msg["subject"] or "", msg["body"] or "")
        loc = None
        lm = _LOC.search(f"{msg['subject']}\n{msg['body']}")
        if lm:
            loc = lm.group(1).strip()
        role = None
        rm = _ROLE.search(f"{msg['subject']}\n{msg['body']}")
        if rm:
            role = rm.group(1)

        if not name:
            summary["needs_review"] += 1
            async with SessionLocal() as s:
                s.add(Email(user_id="", message_id=msg["message_id"], thread_id=msg["thread_id"],
                            sender=msg["sender"], subject=msg["subject"], kind=EmailKind.job_alert))
                await s.commit()
            continue

        company = await create_company(name)
        async with SessionLocal() as s:
            s.add(Email(user_id=company.user_id, message_id=msg["message_id"], thread_id=msg["thread_id"],
                        sender=msg["sender"], subject=msg["subject"], kind=EmailKind.job_alert,
                        company_id=company.id, role=role, role_location=loc))
            await s.commit()

        if company.research_status not in ("researched", "partial", "needs_attention"):
            to_research[company.id] = company
            summary["new_companies"] += 1

    for cid in to_research:
        try:
            await execute_research(cid)
            summary["researched"] += 1
        except Exception as e:
            summary["errors"].append(str(e))

    return summary
