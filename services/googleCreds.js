/**
 * Resolves the Google OAuth client id/secret.
 * Priority: .env (GMAIL_CLIENT_ID/SECRET) -> credentials.json (as downloaded
 * from Google Cloud, "installed" or "web" shape).
 *
 * The refresh token is NOT here — it lives in .env (GMAIL_REFRESH_TOKEN) after
 * you run scripts/gmail-auth.js. credentials.json must be gitignored.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let cache;
export function getClientCreds() {
  if (cache !== undefined) return cache;

  if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET) {
    cache = {
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
    };
    return cache;
  }

  const file = process.env.GOOGLE_CREDENTIALS_PATH || path.join(root, "credentials.json");
  try {
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    const c = json.installed || json.web || json;
    if (c.client_id && c.client_secret) {
      cache = { clientId: c.client_id, clientSecret: c.client_secret };
      return cache;
    }
  } catch {
    // no file / unreadable
  }
  cache = null;
  return cache;
}

export function hasClientCreds() {
  return Boolean(getClientCreds());
}
