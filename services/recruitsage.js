/**
 * RecruitSage detection — ONE place to configure how RecruitSage emails are
 * identified. Nothing about "what a RecruitSage email looks like" should live
 * anywhere else in the codebase.
 *
 * The Gmail search query is the primary filter (server-side, cheap). The
 * isRecruitSage() predicate is a secondary client-side guard.
 */

// Configurable in .env. Default casts a reasonably wide net across sender,
// subject and body mentions. Tune this once you see a real RecruitSage email.
export const RECRUITSAGE_GMAIL_QUERY =
  process.env.RECRUITSAGE_GMAIL_QUERY || "from:updates.recruitsage@thapar.edu";

// Signals used by the secondary guard. Kept here so detection is centralized.
const SENDER_HINTS = ["recruitsage"];
const TEXT_HINTS = ["recruitsage", "recruitment notification", "new job opportunity"];

/**
 * Secondary guard: given a parsed message, decide if it's really RecruitSage.
 * Because the Gmail query can be broad, this trims false positives.
 */
export function isRecruitSage(msg) {
  const sender = (msg.sender || "").toLowerCase();
  const subject = (msg.subject || "").toLowerCase();
  const body = (msg.bodyText || "").toLowerCase();

  if (SENDER_HINTS.some((h) => sender.includes(h))) return true;
  if (TEXT_HINTS.some((h) => subject.includes(h) || body.includes(h))) return true;
  return false;
}

/**
 * Build the effective Gmail query for a sync, adding a date bound.
 * - First run (no lastSyncAt): limit to the initial lookback window.
 * - Incremental: only messages after the last sync.
 */
export function buildSyncQuery({ lastSyncAt } = {}) {
  const base = RECRUITSAGE_GMAIL_QUERY;
  if (lastSyncAt) {
    const epoch = Math.floor(new Date(lastSyncAt).getTime() / 1000);
    return `${base} after:${epoch}`;
  }
  const days = Number(process.env.GMAIL_INITIAL_LOOKBACK_DAYS || 30);
  return `${base} newer_than:${days}d`;
}
