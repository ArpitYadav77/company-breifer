import { Router } from "express";
import { askQuestion } from "../services/rag.js";

const router = Router();

/**
 * POST /ask
 * Body: { question: string }
 * Returns: { grounded, answer, sources, topScore }
 */
router.post("/ask", async (req, res) => {
  const question = (req.body?.question || "").trim();
  if (!question) {
    return res.status(400).json({ error: "Missing 'question' in request body." });
  }

  try {
    const result = await askQuestion(question);
    return res.json(result);
  } catch (err) {
    console.error("Failed to answer question:", err);
    return res.status(500).json({
      error: "Failed to answer question.",
      detail: err?.message || String(err),
    });
  }
});

export default router;
