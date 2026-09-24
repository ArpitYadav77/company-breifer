/**
 * Gmail READ access (gmail.readonly) for ingesting RecruitSage emails.
 *
 * This is the INPUT side of the system. It only reads; it never sends.
 * (Optional outgoing email lives in mailer.js and is off by default.)
 */
import { google } from "googleapis";
import { getClientCreds, hasClientCreds } from "./googleCreds.js";

const REDIRECT = "http://localhost:5555";

export function isGmailConfigured() {
  return Boolean(hasClientCreds() && process.env.GMAIL_REFRESH_TOKEN);
}

function gmailClient() {
  const { clientId, clientSecret } = getClientCreds() || {};
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT);
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth: oauth2 });
}

/** Lightweight check that auth works and returns the connected address. */
export async function getProfile() {
  const gmail = gmailClient();
  const { data } = await gmail.users.getProfile({ userId: "me" });
  return { email: data.emailAddress, messagesTotal: data.messagesTotal };
}

/** List message IDs matching a Gmail search query. */
export async function searchMessageIds(query, maxResults = 50) {
  const gmail = gmailClient();
  const ids = [];
  let pageToken;
  do {
    const { data } = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: Math.min(100, maxResults - ids.length),
      pageToken,
    });
    (data.messages || []).forEach((m) => ids.push({ id: m.id, threadId: m.threadId }));
    pageToken = data.nextPageToken;
  } while (pageToken && ids.length < maxResults);
  return ids;
}

const headerVal = (headers, name) =>
  (headers.find((h) => h.name.toLowerCase() === name.toLowerCase()) || {}).value || "";

function decodeB64(data) {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/** Recursively pull the first text/plain and text/html bodies from a payload. */
function extractBodies(payload, acc = { text: "", html: "" }) {
  if (!payload) return acc;
  const mime = payload.mimeType || "";
  if (mime === "text/plain" && payload.body?.data && !acc.text) {
    acc.text = decodeB64(payload.body.data);
  } else if (mime === "text/html" && payload.body?.data && !acc.html) {
    acc.html = decodeB64(payload.body.data);
  }
  for (const part of payload.parts || []) extractBodies(part, acc);
  return acc;
}

/** Very small HTML → text so extraction works on HTML-only emails. */
export function htmlToText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Fetch one message and return a normalized shape. */
export async function getMessage(id) {
  const gmail = gmailClient();
  const { data } = await gmail.users.messages.get({ userId: "me", id, format: "full" });
  const headers = data.payload?.headers || [];
  const bodies = extractBodies(data.payload);
  const text = bodies.text || htmlToText(bodies.html);

  return {
    messageId: data.id,
    threadId: data.threadId,
    sender: headerVal(headers, "From"),
    subject: headerVal(headers, "Subject"),
    receivedAt: data.internalDate ? new Date(Number(data.internalDate)) : new Date(),
    snippet: data.snippet || "",
    bodyText: text,
    bodyHtml: bodies.html,
  };
}
