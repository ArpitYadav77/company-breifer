import { google } from "googleapis";
import { getClientCreds, hasClientCreds } from "./googleCreds.js";

/**
 * OPTIONAL outgoing email via the Gmail API (OAuth2). Requires gmail.send scope
 * (re-run gmail-auth.js with ENABLE_EMAIL_NOTIFICATIONS=true) and a refresh
 * token in .env. Off unless ENABLE_EMAIL_NOTIFICATIONS=true.
 */

const REDIRECT = "http://localhost:5555";

// Outgoing email is OPT-IN. Ingestion (reading RecruitSage) never needs this.
export function emailEnabled() {
  return process.env.ENABLE_EMAIL_NOTIFICATIONS === "true";
}

function isConfigured() {
  return Boolean(hasClientCreds() && process.env.GMAIL_REFRESH_TOKEN);
}

/** Generic send. Returns { sent, reason? }. Never throws. */
export async function sendMail({ to, subject, html }) {
  if (!emailEnabled()) return { sent: false, reason: "Email notifications disabled." };
  if (!isConfigured()) return { sent: false, reason: "Gmail not configured." };
  const recipient = to || process.env.NOTIFY_EMAIL;
  const from = process.env.GMAIL_SENDER || recipient;
  if (!recipient) return { sent: false, reason: "No recipient set." };
  try {
    const gmail = gmailClient();
    const raw = toRawMessage({ from, to: recipient, subject, html });
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err?.message || String(err) };
  }
}

function gmailClient() {
  const { clientId, clientSecret } = getClientCreds() || {};
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT);
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth: oauth2 });
}

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const list = (arr) =>
  Array.isArray(arr) && arr.length
    ? `<ul>${arr.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
    : "<p>—</p>";

/** Build the HTML body of the notification. */
function renderHtml(company, brief, links) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:640px;color:#111">
    <h2>New company brief: ${esc(company)}</h2>
    <p><b>Snapshot:</b> ${esc(brief.snapshot)}</p>
    <p><b>Headquarters:</b> ${esc(brief.headquarters)}</p>
    <p><b>5-year growth:</b> ${esc(brief.growth_5yr)}</p>
    <p><b>Salary / comp:</b> ${esc(brief.comp_notes)}</p>
    <p><b>Glassdoor:</b> ${esc(brief.glassdoor_summary)}</p>
    <p><b>Confidence:</b> ${esc(brief.sources_confidence)}</p>

    <h3>Hiring process</h3>${list(brief.interview_format)}
    <h3>Common interview questions</h3>${list(brief.common_questions)}
    <h3>Recent news</h3>${list(brief.recent_news)}
    <h3>Culture signals</h3>${list(brief.culture_signals)}
    <h3>Watch out for</h3>${list(brief.watch_out_for)}

    <h3>Research links</h3>
    <ul>
      <li><a href="${links.linkedinCompany}">LinkedIn company page (followers)</a></li>
      <li><a href="${links.thaparAlumni}">Thapar / TIET alumni at ${esc(company)} (LinkedIn)</a></li>
      <li><a href="${links.glassdoor}">Glassdoor reviews</a></li>
    </ul>
  </div>`;
}

/** Encode a MIME message as base64url for the Gmail API. */
function toRawMessage({ from, to, subject, html }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ];
  return Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Send the notification. Returns { sent: boolean, reason?: string }.
 * Never throws — email failures must not break brief generation.
 */
export async function sendBriefEmail(company, brief, links) {
  // Gated by emailEnabled() inside sendMail — no mail leaves unless opted in.
  return sendMail({
    to: process.env.NOTIFY_EMAIL,
    subject: `New brief: ${company}`,
    html: renderHtml(company, brief, links),
  });
}
