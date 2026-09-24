/**
 * NotificationService — decouples "a new company was researched" from HOW the
 * user is told. The dashboard is the primary, always-on channel (it just reads
 * the DB). Telegram and Email are optional, independent layers.
 *
 *   NotificationService
 *     ├── Dashboard  (always on — no-op here; the DB IS the dashboard's source)
 *     ├── Telegram   (optional; TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)
 *     ├── Email      (optional; ENABLE_EMAIL_NOTIFICATIONS=true)
 *     └── WhatsApp   (future)
 *
 * Telegram is sent AT MOST ONCE per unique company. The "already sent" flag is
 * persisted on the company doc (telegramNotified), so duplicates and server
 * restarts never trigger a second message.
 */
import { sendMail, emailEnabled } from "./mailer.js";
import { sendTelegramMessage, isTelegramConfigured } from "./telegram.js";
import { markTelegramNotified } from "./database.js";

const BASE_URL =
  process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;

const NA = "Not reliably available";
const UNAVAIL = "Unavailable";

function emailHtml(company) {
  const b = company.research?.basic || {};
  return `
    <div style="font-family:Arial,sans-serif">
      <h2>New RecruitSage company: ${company.companyName}</h2>
      <p>Industry: ${b.industry || "Data unavailable"}<br/>
         HQ: ${b.headquarters || "Data unavailable"}</p>
      <p>Open the dashboard for the full intelligence brief.</p>
    </div>`;
}

/** Build a concise, HONEST Telegram message. Missing data is labelled, never faked. */
export function buildTelegramMessage(company) {
  const r = company.research || {};
  const b = r.basic || {};
  const li = r.linkedin || {};
  const gd = r.glassdoor || {};

  const role = (company.lastRoles && company.lastRoles[0]) || UNAVAIL;

  const salary =
    r.salaryData?.entryLevel && r.salaryData.entryLevel.confidence !== "unavailable"
      ? r.salaryData.entryLevel.range
      : NA;

  const alumni =
    li.alumniCount != null ? `Approx. ${li.alumniCount} found` : UNAVAIL;

  const glass = gd.rating != null ? `${gd.rating}/5` : UNAVAIL;

  const growth = Array.isArray(r.careerGrowth) && r.careerGrowth.length
    ? r.careerGrowth.map((s) => s.title).filter(Boolean).slice(0, 5).join(" → ")
    : NA;

  const hiring = r.hiringProcess?.steps?.length
    ? r.hiringProcess.steps.slice(0, 6).join(" → ")
    : UNAVAIL;

  const topics = [
    ...(r.interviewQuestions?.dsa || []).slice(0, 2),
    ...(r.interviewQuestions?.csFundamentals || []).slice(0, 2),
    ...(r.interviewQuestions?.sql || []).slice(0, 1),
  ];
  const topicsText = topics.length ? topics.join("\n") : UNAVAIL;

  const lines = [
    "🚨 NEW RECRUITSAGE COMPANY",
    "",
    `🏢 ${company.companyName}`,
    "",
    `💼 Role:\n${role}`,
    "",
    `📍 Headquarters:\n${b.headquarters || NA}`,
    "",
    `💰 Salary:\n${salary}`,
    "",
    `🎓 Thapar/TIET Alumni:\n${alumni}`,
    "",
    `⭐ Glassdoor:\n${glass}`,
    "",
    `📈 5-Year Growth:\n${growth}`,
    "",
    `🧑‍💻 Hiring Process:\n${hiring}`,
    "",
    `🔥 Common Interview Topics:\n${topicsText}`,
    "",
    `🔗 Dashboard:\n${BASE_URL}`,
    li.companyUrl ? `\n🔗 LinkedIn:\n${li.companyUrl}` : "",
    gd.url ? `\n🔗 Glassdoor:\n${gd.url}` : "",
  ];
  return lines.filter((l) => l !== "").join("\n");
}

/**
 * Called when a NEW company has been detected + researched. Never throws.
 * Telegram is sent only once per company (persisted flag).
 */
export async function notifyNewCompany(company) {
  const results = { dashboard: "updated" };

  // --- Telegram (once per unique company) ---
  if (!isTelegramConfigured()) {
    results.telegram = "not configured";
  } else if (company.telegramNotified) {
    results.telegram = "already notified";
  } else {
    const r = await sendTelegramMessage(buildTelegramMessage(company));
    if (r.ok) {
      await markTelegramNotified(company._id);
      results.telegram = "sent";
    } else {
      // Failure must not break the pipeline; log a safe message (no token).
      console.warn(`Telegram notification failed for ${company.companyName}: ${r.error}`);
      results.telegram = `failed (${r.error})`;
    }
  }

  // --- Email (optional) ---
  if (emailEnabled()) {
    const r = await sendMail({
      subject: `New RecruitSage company: ${company.companyName}`,
      html: emailHtml(company),
    });
    results.email = r.sent ? "sent" : `skipped (${r.reason})`;
  } else {
    results.email = "disabled";
  }

  return results;
}
