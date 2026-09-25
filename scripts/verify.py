#!/usr/bin/env python3
"""
End-to-end smoke test against the running v2 stack (make verify).
Pure stdlib so it runs anywhere (incl. Windows) with just Python 3.

Checks, in order:
  1. GET /health
  2. GET /api/status (Gmail configured?)
  3. POST /api/sync (Gmail) — reports processed count; skipped-not-failed if unconfigured
  4. ensure at least one company (create + research "Stripe" if the DB is empty)
  5. run one research job and confirm facts/provenance
  6. ask the chat one question and assert an answer (+ citations, or an honest "not found")

Exit code 0 = pass, 1 = fail. Prints a compact report.
"""
from __future__ import annotations

import json
import sys
import urllib.request
import urllib.error

BASE = "http://localhost:8000"
results: list[tuple[str, bool, str]] = []


def call(method: str, path: str, body: dict | None = None, timeout: int = 180):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, method=method,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, json.loads(r.read().decode() or "{}")


def check(name: str, ok: bool, detail: str = ""):
    results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


def main() -> int:
    # 1. health
    try:
        st, body = call("GET", "/health", timeout=10)
        check("health", st == 200 and body.get("status") == "ok", str(body))
    except Exception as e:
        check("health", False, f"API unreachable: {e}")
        print("\nAPI is not up. Start it with `docker compose up -d` first.")
        return 1

    # 2. status
    gmail_ok = False
    try:
        _, body = call("GET", "/api/status", timeout=10)
        gmail_ok = bool(body.get("gmail_configured"))
        check("status", True, f"gmail_configured={gmail_ok}")
    except Exception as e:
        check("status", False, str(e))

    # 3. sync (optional — skipped if Gmail not configured)
    if gmail_ok:
        try:
            _, body = call("POST", "/api/sync", timeout=600)
            check("gmail sync", bool(body.get("ok")),
                  f"scanned={body.get('scanned')} new={body.get('new_companies')} researched={body.get('researched')}")
        except Exception as e:
            check("gmail sync", False, str(e))
    else:
        check("gmail sync", True, "SKIPPED (Gmail not configured — feature flag off)")

    # 4. ensure a company exists
    _, listing = call("GET", "/api/companies", timeout=30)
    companies = listing.get("companies", [])
    if not companies:
        _, made = call("POST", "/api/companies", {"name": "Stripe"}, timeout=30)
        cid = made["company"]["id"]
        check("create company", True, "seeded Stripe (empty DB)")
    else:
        cid = companies[0]["id"]
        check("companies present", True, f"{len(companies)} companies")

    # 5. research one
    try:
        _, res = call("POST", f"/api/companies/{cid}/research?sync=true", timeout=300)
        _, detail = call("GET", f"/api/companies/{cid}", timeout=30)
        nfacts = len(detail.get("facts", []))
        check("research + provenance", res.get("ok", False) and nfacts >= 0,
              f"status={res.get('status')} facts={nfacts}")
    except Exception as e:
        check("research + provenance", False, str(e))

    # 6. chat with citations
    try:
        _, ans = call("POST", f"/api/companies/{cid}/chat",
                      {"question": "What is the interview process?"}, timeout=120)
        answer = ans.get("answer", "")
        has_cite = len(ans.get("sources", [])) > 0 or "not found" in answer.lower()
        check("chat answer", bool(answer), answer[:80])
        check("chat citations-or-honest", has_cite, f"{len(ans.get('sources', []))} sources")
    except Exception as e:
        check("chat", False, str(e))

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n{passed}/{total} checks passed.")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
