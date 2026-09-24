/**
 * Dashboard API.
 *   GET  /api/status                 - Gmail auth + last sync info
 *   GET  /api/companies              - latest N unique companies + needs-review
 *   GET  /api/companies/:id          - one full company
 *   POST /api/sync                   - run a Gmail sync now
 *   POST /api/companies/:id/refresh  - re-run research for one company
 */
import { Router } from "express";
import { isGmailConfigured, getProfile } from "../services/gmail.js";
import { syncGmail, researchAndSave } from "../services/sync.js";
import {
  getLatestCompanies,
  getAllCompanies,
  getCompanyById,
  getNeedsReviewMessages,
  getSyncState,
} from "../services/database.js";
import { RECRUITSAGE_GMAIL_QUERY } from "../services/recruitsage.js";
import { isTelegramConfigured, getBotInfo, sendTelegramMessage } from "../services/telegram.js";

const router = Router();
const LIMIT = Number(process.env.DASHBOARD_COMPANY_LIMIT || 5);

router.get("/status", async (_req, res) => {
  const configured = isGmailConfigured();
  const state = await getSyncState();
  let account = process.env.NOTIFY_EMAIL || null;
  let authOk = false;
  if (configured) {
    try {
      const p = await getProfile();
      account = p.email;
      authOk = true;
    } catch (err) {
      authOk = false;
    }
  }
  // Telegram status (never exposes the token).
  const telegramConfigured = isTelegramConfigured();
  let telegram = { configured: telegramConfigured, connected: false, botName: null };
  if (telegramConfigured) {
    const bot = await getBotInfo();
    telegram = {
      configured: true,
      connected: Boolean(bot),
      botName: bot ? bot.name || bot.username : null,
    };
  }

  res.json({
    gmailConfigured: configured,
    gmailAuthOk: authOk,
    account,
    lastSyncAt: state?.lastSyncAt || null,
    lastSummary: state?.lastSummary || null,
    recruitsageQuery: RECRUITSAGE_GMAIL_QUERY,
    pollIntervalMinutes: Number(process.env.GMAIL_POLL_INTERVAL_MINUTES || 0),
    telegram,
  });
});

/** Dev endpoint: send a Telegram test message. Never exposes the token. */
router.post("/notifications/test", async (_req, res) => {
  if (!isTelegramConfigured()) {
    return res.status(400).json({ success: false, error: "Telegram configuration missing" });
  }
  const r = await sendTelegramMessage("RecruitSage Telegram test successful.");
  if (r.ok) return res.json({ success: true, message: "Telegram message sent" });
  return res.status(502).json({ success: false, error: r.error || "Telegram send failed" });
});

router.get("/companies", async (_req, res) => {
  try {
    const [all, needsReview, state] = await Promise.all([
      getAllCompanies(), // newest first; the UI slices/searches this dynamically
      getNeedsReviewMessages(20),
      getSyncState(),
    ]);
    const stats = {
      total: all.length,
      researched: all.filter((c) => c.researchStatus === "ok").length,
      pending: all.filter((c) => c.researchStatus !== "ok" && c.researchStatus !== "failed").length,
      failed: all.filter((c) => c.researchStatus === "failed").length,
      needsReview: needsReview.length,
      newThisSync: state?.lastSummary?.newCompanies || 0,
    };
    res.json({ companies: all, needsReview, stats, limit: LIMIT });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/companies/:id", async (req, res) => {
  try {
    const company = await getCompanyById(req.params.id);
    if (!company) return res.status(404).json({ error: "Not found." });
    res.json({ company });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/sync", async (_req, res) => {
  const summary = await syncGmail();
  const code = summary.ok ? 200 : 400;
  res.status(code).json(summary);
});

router.post("/companies/:id/refresh", async (req, res) => {
  try {
    const company = await getCompanyById(req.params.id);
    if (!company) return res.status(404).json({ error: "Not found." });
    const status = await researchAndSave(company);
    const fresh = await getCompanyById(company._id);
    res.json({ status, company: fresh });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
