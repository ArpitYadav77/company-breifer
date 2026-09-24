/**
 * ONE-TIME Gmail authorization.
 *
 * Prerequisite (do this in Google Cloud Console — only you can):
 *   1. Create/select a project at https://console.cloud.google.com
 *   2. APIs & Services → Enable "Gmail API"
 *   3. OAuth consent screen → User type "External" → add ayadav2_be23@thapar.edu
 *      (the inbox you read) under "Test users" → scope: .../auth/gmail.readonly
 *   4. Credentials → Create OAuth client ID → Application type "Desktop app"
 *   5. Copy the Client ID + Client secret into .env as:
 *        GMAIL_CLIENT_ID=...
 *        GMAIL_CLIENT_SECRET=...
 *
 * Then run:  node scripts/gmail-auth.js
 * It opens a consent page, you sign in, and it prints GMAIL_REFRESH_TOKEN
 * for you to paste into .env. Run this once; the app reuses the token after.
 */
import "dotenv/config";
import http from "node:http";
import { google } from "googleapis";
import { getClientCreds } from "../services/googleCreds.js";

const PORT = 5555;
const REDIRECT = `http://localhost:${PORT}`;

// Minimal scope: READ-ONLY, to ingest RecruitSage emails. gmail.send is added
// ONLY if you opted into outgoing email notifications.
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
if (process.env.ENABLE_EMAIL_NOTIFICATIONS === "true") {
  SCOPES.push("https://www.googleapis.com/auth/gmail.send");
}

const creds = getClientCreds();
if (!creds) {
  console.error(
    "No OAuth client found. Put credentials.json in the project root, or set\n" +
      "GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env."
  );
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(creds.clientId, creds.clientSecret, REDIRECT);

const authUrl = oauth2.generateAuthUrl({
  access_type: "offline", // needed to receive a refresh token
  prompt: "consent", // force a refresh token every time
  scope: SCOPES,
});

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, REDIRECT);
    const code = url.searchParams.get("code");
    if (!code) {
      res.writeHead(400).end("No code received.");
      return;
    }
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h2>Authorized. You can close this tab and return to the terminal.</h2>");

    console.log("\n=== SUCCESS ===");
    if (tokens.refresh_token) {
      console.log("\nPaste this into your .env:\n");
      console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    } else {
      console.log(
        "No refresh_token returned. Revoke access at https://myaccount.google.com/permissions and re-run."
      );
    }
    console.log("\nAlso set GMAIL_SENDER to the Gmail you just authorized.\n");
    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500).end("Auth error: " + err.message);
    console.error(err);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log("Open this URL in your browser to authorize:\n");
  console.log(authUrl + "\n");
  console.log(`(Waiting for the redirect on ${REDIRECT} ...)`);
});
