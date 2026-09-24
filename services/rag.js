import { GoogleGenAI } from "@google/genai";
import { chunkBrief } from "./chunker.js";
import { embedDocuments, embedQuery } from "./embeddings.js";
import { upsertChunks, search } from "./vectorStore.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const ANSWER_MODEL = "gemini-2.5-flash";

// Retrieval gate. If the best chunk scores below this, we treat retrieval as
// "empty" and refuse instead of letting the model guess.
// TODO: tune this threshold once you've run a few real questions.
const MIN_SCORE = 0.55;
// Aggregate questions ("which of ALL my companies...") need enough breadth to
// catch every matching company, so keep this generous.
const TOP_K = 12;

/**
 * Chunk + embed + store one brief so it becomes searchable.
 * Call this whenever a brief is created/updated.
 */
export async function indexBrief(company, brief) {
  const chunks = chunkBrief(company, brief);
  if (!chunks.length) return 0;

  const vectors = await embedDocuments(chunks.map((c) => c.text));
  const withVectors = chunks.map((c, i) => ({ ...c, embedding: vectors[i] }));
  await upsertChunks(company, withVectors);
  return withVectors.length;
}

/**
 * Answer a natural-language question grounded in the stored briefs.
 * Returns { grounded: boolean, answer: string, sources: [...], topScore: number }.
 *
 * FAILURE MODE handled here: if nothing relevant is retrieved, we do NOT call the
 * LLM to invent an answer — we return a plain "I don't have that" response.
 */
export async function askQuestion(question) {
  const q = (question || "").trim();
  if (!q) {
    return { grounded: false, answer: "Please ask a question.", sources: [], topScore: 0 };
  }

  const queryVec = await embedQuery(q);
  const hits = await search(queryVec, TOP_K);
  const topScore = hits[0]?.score ?? 0;

  // Layer 1: retrieval gate. Empty archive or nothing relevant -> refuse.
  const relevant = hits.filter((h) => h.score >= MIN_SCORE);
  if (relevant.length === 0) {
    return {
      grounded: false,
      answer:
        "I don't have anything in the researched briefs that answers this. " +
        "Try rephrasing, or research that company first so it's in the archive.",
      sources: [],
      topScore,
    };
  }

  // Build grounded context from the relevant chunks.
  const context = relevant
    .map((h, i) => `[${i + 1}] (${h.company} · ${h.field})\n${h.text}`)
    .join("\n\n");

  // Layer 2: prompt-level grounding. Even with some chunks, forbid guessing.
  const systemPrompt = [
    "You answer questions using ONLY the provided context, which comes from company",
    "briefs the user has previously researched.",
    "Rules:",
    "- Use only facts present in the context. Do not use outside knowledge.",
    "- If the context does not contain the answer, say you don't have that information.",
    "- Name the specific companies your answer is based on.",
    "- Be concise and direct.",
  ].join("\n");

  const userPrompt = `Question: ${q}\n\nContext:\n${context}`;

  const res = await ai.models.generateContent({
    model: ANSWER_MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 1024,
    },
  });

  return {
    grounded: true,
    answer: (res.text || "").trim() || "I don't have that information.",
    sources: relevant.map((h) => ({
      company: h.company,
      field: h.field,
      score: Number(h.score.toFixed(3)),
    })),
    topScore: Number(topScore.toFixed(3)),
  };
}
