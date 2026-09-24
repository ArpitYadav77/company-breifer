/**
 * Gmail → RecruitSage → company → research pipeline.
 *
 *   Gmail inbox
 *     -> search RecruitSage messages (bounded by date)
 *     -> for each UNSEEN message: parse, confirm RecruitSage, extract company
 *     -> dedupe by normalized name (no duplicate cards)
 *     -> research NEW / un-researched companies
 *     -> NotificationService (dashboard always; email optional)
 */
import { isGmailConfigured, searchMessageIds, getMessage } from "./gmail.js";
import { isRecruitSage, buildSyncQuery } from "./recruitsage.js";
import { extractCompany } from "./companyExtractor.js";
import { researchCompany } from "./companyResearch.js";
import { notifyNewCompany } from "./notifications.js";
import {
  isMessageProcessed,
  recordMessage,
  upsertCompanyDetection,
  saveResearch,
  getCompanyById,
  getSyncState,
  setSyncState,
} from "./database.js";

let running = false;

/** Research one company doc and persist it. Never throws. Returns status. */
export async function researchAndSave(company) {
  try {
    const research = await researchCompany(company.companyName);
    await saveResearch(company._id, research, "ok");
    return "ok";
  } catch (err) {
    console.warn(`Research failed for ${company.companyName}:`, err?.message);
    await saveResearch(company._id, null, "failed");
    return "failed";
  }
}

/**
 * Run one sync pass. Returns a summary object (never throws).
 */
export async function syncGmail({ maxMessages = 50 } = {}) {
  if (running) return { ok: false, reason: "A sync is already running." };
  if (!isGmailConfigured()) {
    return { ok: false, reason: "Gmail authentication required. Run scripts/gmail-auth.js." };
  }

  running = true;
  const summary = {
    ok: true,
    scanned: 0,
    newMessages: 0,
    newCompanies: 0,
    needsReview: 0,
    researched: 0,
    researchFailed: 0,
    errors: [],
  };

  try {
    const state = await getSyncState();
    const query = buildSyncQuery({ lastSyncAt: state?.lastSyncAt });

    const ids = await searchMessageIds(query, maxMessages);
    summary.scanned = ids.length;

    const toResearch = new Map(); // companyId -> company doc

    for (const { id } of ids) {
      if (await isMessageProcessed(id)) continue;
      summary.newMessages++;

      let msg;
      try {
        msg = await getMessage(id);
      } catch (err) {
        summary.errors.push(`fetch ${id}: ${err.message}`);
        continue;
      }

      // Secondary guard against false positives from a broad query.
      if (!isRecruitSage(msg)) {
        await recordMessage({ ...msg, processingStatus: "ignored" });
        continue;
      }

      const extracted = await extractCompany(msg);
      if (extracted.needsReview) {
        await recordMessage({ ...msg, processingStatus: "needs_review" });
        summary.needsReview++;
        continue;
      }

      const { company, isNew } = await upsertCompanyDetection({
        companyName: extracted.companyName,
        normalizedName: extracted.normalizedName,
        roles: extracted.roles,
        roleLocation: extracted.roleLocation,
        messageId: msg.messageId,
        receivedAt: msg.receivedAt,
      });

      await recordMessage({
        ...msg,
        companyId: company._id,
        processingStatus: "processed",
      });

      if (isNew) summary.newCompanies++;
      // Research any company that isn't already researched OK.
      if (company.researchStatus !== "ok") toResearch.set(String(company._id), company);
    }

    // Research sequentially to respect LLM/search rate limits.
    for (const company of toResearch.values()) {
      const status = await researchAndSave(company);
      if (status === "ok") {
        summary.researched++;
        const fresh = await getCompanyById(company._id);
        try {
          await notifyNewCompany(fresh);
        } catch (err) {
          summary.errors.push(`notify ${company.companyName}: ${err.message}`);
        }
      } else {
        summary.researchFailed++;
      }
    }

    await setSyncState({ lastSyncAt: new Date(), lastSummary: summary });
    return summary;
  } catch (err) {
    summary.ok = false;
    summary.errors.push(err.message);
    return summary;
  } finally {
    running = false;
  }
}
