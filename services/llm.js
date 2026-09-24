import { GoogleGenAI } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";
import { BriefSchema } from "./schema.js";

// TODO: Swap in your actual API key via .env (GEMINI_API_KEY). The SDK also
//       reads GEMINI_API_KEY / GOOGLE_API_KEY from the environment automatically;
//       no hardcoded key belongs here.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = "gemini-2.5-flash";

// Build the response schema from the Zod schema so the two never drift apart.
const rawJsonSchema = zodToJsonSchema(BriefSchema, {
  target: "openApi3",
  $refStrategy: "none",
});

/**
 * Gemini's responseSchema accepts only a subset of JSON Schema. Strip the keys
 * it rejects (e.g. $schema, additionalProperties) recursively.
 */
function sanitizeForGemini(node) {
  if (Array.isArray(node)) return node.map(sanitizeForGemini);
  if (node && typeof node === "object") {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "$schema" || key === "additionalProperties" || key === "default") {
        continue;
      }
      out[key] = sanitizeForGemini(value);
    }
    return out;
  }
  return node;
}

const responseSchema = sanitizeForGemini(rawJsonSchema);

/**
 * Synthesizes a structured brief from raw web data using Gemini.
 * Forces JSON output via responseMimeType + responseSchema, then validates
 * the result against BriefSchema before returning it.
 *
 * @param {string} company
 * @param {{news: string, interview: string, salary: string, culture: string}} rawData
 * @returns {Promise<import("zod").infer<typeof BriefSchema>>}
 */
export async function synthesizeBrief(company, rawData) {
  // TODO: Tune this prompt wording once you see real briefs — tighten tone,
  //       add examples, adjust how aggressively to scope recency, etc.
  const systemPrompt = [
    "You are an interview-prep analyst. You turn raw web search results into a tight,",
    "honest, single-page brief that helps a candidate prepare for an interview at a company.",
    "",
    "Hard rules:",
    "- Only treat news from the last 90 days as 'recent'. Ignore or clearly down-weight older items.",
    "- NEVER invent compensation numbers. If pay data is missing, unclear, or unverified,",
    '  set comp_notes to exactly "insufficient data".',
    "- Do not fabricate interview stages or questions that the sources do not support.",
    "- Fill headquarters, growth_5yr and glassdoor_summary from the sources; use exactly",
    '  "insufficient data" for any of them the sources do not clearly support.',
    "- Set sources_confidence honestly based on how recent, corroborated, and specific the sources are.",
    "- Keep every field concise and skimmable. Prefer short, concrete bullet strings.",
    "- Respond with ONLY the JSON object matching the required schema.",
  ].join("\n");

  const userPrompt = [
    `Company: ${company}`,
    "",
    "Below are raw web search results grouped by topic. Synthesize them into the brief.",
    "",
    "=== RECENT NEWS RESULTS ===",
    rawData.news,
    "",
    "=== INTERVIEW EXPERIENCE RESULTS (Glassdoor) ===",
    rawData.interview,
    "",
    "=== SALARY / REVIEWS RESULTS (AmbitionBox) ===",
    rawData.salary,
    "",
    "=== CULTURE / EMPLOYEE REVIEWS RESULTS ===",
    rawData.culture,
    "",
    "=== COMPANY OVERVIEW RESULTS (HQ / growth / size) ===",
    rawData.overview,
  ].join("\n");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema,
      // gemini-2.5-* are thinking models; reasoning tokens count against the
      // output budget. Disable thinking so the full budget goes to the JSON,
      // and give a generous ceiling so the brief is never truncated.
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 8192,
    },
  });

  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason === "MAX_TOKENS") {
    throw new Error(
      "Gemini hit the output token limit before finishing the JSON. Raise maxOutputTokens."
    );
  }

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned no text output.");
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`Gemini returned invalid JSON: ${err.message}`);
  }

  // Validate the model's structured output against our Zod schema before trusting it.
  const parsed = BriefSchema.parse(json);
  return parsed;
}
