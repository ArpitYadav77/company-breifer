import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import briefRoutes from "./routes/brief.js";
import askRoutes from "./routes/ask.js";
import companyRoutes from "./routes/companies.js";
import { startPolling } from "./services/poller.js";
import { isTelegramConfigured } from "./services/telegram.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Primary: RecruitSage dashboard API (/api/status, /api/companies, /api/sync, ...)
app.use("/api", companyRoutes);
// Legacy/secondary: manual brief generator + RAG ask (kept, not the main flow).
app.use("/api", briefRoutes);
app.use("/api", askRoutes);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`RecruitSage intelligence dashboard on http://localhost:${PORT}`);
  if (isTelegramConfigured()) {
    console.log("Telegram notifications enabled.");
  } else {
    console.log(
      "Telegram notifications disabled: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing."
    );
  }
  startPolling();
});
