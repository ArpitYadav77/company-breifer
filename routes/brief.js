import { Router } from "express";
import { gatherCompanyData } from "../services/search.js";
import { synthesizeBrief } from "../services/llm.js";
import { getCachedBrief, saveBrief } from "../services/db.js";
import { indexBrief } from "../services/rag.js";
import { buildResearchLinks } from "../services/links.js";
import { sendBriefEmail } from "../services/mailer.js";

const router = Router();

/**
 * POST /brief
 * Body: { company: string }
 * Returns: { cached: boolean, brief: <BriefSchema> }
 */
router.post("/brief", async (req, res) => {
  const company = (req.body?.company || "").trim();

  if (!company) {
    return res.status(400).json({ error: "Missing 'company' in request body." });
  }

  // Research deep-links are deterministic from the name — always available.
  const links = buildResearchLinks(company);

  try {
    // 1. Cache first.
    const cached = await getCachedBrief(company);
    if (cached) {
      return res.json({ cached: true, brief: cached, links });
    }

    // 2. Cache miss: gather → synthesize → save.
    const rawData = await gatherCompanyData(company);
    const brief = await synthesizeBrief(company, rawData);
    await saveBrief(company, brief);

    // Make the new brief searchable via RAG. Best-effort: don't fail the
    // request if indexing hiccups — the brief is already saved.
    try {
      await indexBrief(company, brief);
    } catch (indexErr) {
      console.error("Brief saved but indexing failed:", indexErr);
    }

    // Notify by email (only for NEW briefs). Best-effort; never blocks the response.
    const emailResult = await sendBriefEmail(company, brief, links);
    if (!emailResult.sent) {
      console.warn("Notification email not sent:", emailResult.reason);
    }

    return res.json({ cached: false, brief, links, emailed: emailResult.sent });
  } catch (err) {
    console.error("Failed to generate brief:", err);
    return res.status(500).json({
      error: "Failed to generate brief.",
      detail: err?.message || String(err),
    });
  }
});

export default router;
