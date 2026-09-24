/**
 * Configurable background polling. Off by default (interval 0). When enabled,
 * runs one Gmail sync every GMAIL_POLL_INTERVAL_MINUTES. Overlap is prevented by
 * the `running` guard inside syncGmail, so a slow sync won't stack up.
 */
import { syncGmail } from "./sync.js";
import { isGmailConfigured } from "./gmail.js";

let timer = null;

export function startPolling() {
  const minutes = Number(process.env.GMAIL_POLL_INTERVAL_MINUTES || 0);
  if (!minutes || minutes <= 0) {
    console.log("Gmail polling disabled (set GMAIL_POLL_INTERVAL_MINUTES > 0 to enable).");
    return;
  }
  if (!isGmailConfigured()) {
    console.log("Gmail polling not started: Gmail not configured yet.");
    return;
  }

  console.log(`Gmail polling every ${minutes} min.`);
  timer = setInterval(async () => {
    try {
      const s = await syncGmail();
      if (s.newCompanies || s.needsReview) {
        console.log(
          `[poll] new companies: ${s.newCompanies}, researched: ${s.researched}, needs review: ${s.needsReview}`
        );
      }
    } catch (err) {
      console.warn("[poll] sync error:", err?.message);
    }
  }, minutes * 60 * 1000);

  if (timer.unref) timer.unref();
}

export function stopPolling() {
  if (timer) clearInterval(timer);
  timer = null;
}
