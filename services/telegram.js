/**
 * Telegram Bot API client. Optional notification channel.
 *
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from the environment only.
 * The token is NEVER logged and NEVER returned to the frontend.
 */
import axios from "axios";

export function isTelegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function apiBase() {
  return `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
}

/**
 * Send a plain-text message to the configured chat.
 * Returns { ok: true } or { ok: false, error } — never throws, never leaks the token.
 */
export async function sendTelegramMessage(message) {
  if (!isTelegramConfigured()) {
    return { ok: false, error: "Telegram configuration missing" };
  }
  try {
    const { data } = await axios.post(
      `${apiBase()}/sendMessage`,
      {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: message,
        disable_web_page_preview: true,
      },
      { timeout: 10000 }
    );
    return { ok: Boolean(data?.ok) };
  } catch (err) {
    // Telegram error responses may echo the request URL (with the token) — so we
    // deliberately surface only a safe, generic description, never err.config/url.
    const safe = err?.response?.data?.description || err?.code || "request failed";
    return { ok: false, error: String(safe) };
  }
}

/** Best-effort bot identity for the dashboard status (no token exposed). */
export async function getBotInfo() {
  if (!isTelegramConfigured()) return null;
  try {
    const { data } = await axios.get(`${apiBase()}/getMe`, { timeout: 8000 });
    if (data?.ok) return { username: data.result.username, name: data.result.first_name };
    return null;
  } catch {
    return null;
  }
}
