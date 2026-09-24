/**
 * Company research orchestrator.
 *
 * Flow: reuse the existing Serper search (gatherCompanyData) to retrieve current
 * public info, then ONE grounded Gemini call turns those snippets into a
 * structured brief. The model is told to use ONLY the retrieved material and to
 * mark anything unsupported as unavailable — it must not invent facts.
 *
 * Deterministic, honest sections (LinkedIn links, Glassdoor URL) are added in
 * code, not by the model.
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { gatherCompanyData } from "./search.js";
import { buildLinkedIn } from "./linkedin.js";
import { buildGlassdoorUrl, glassdoorFields, glassdoorStatus } from "./glassdoor.js";
import { salaryFields, salaryStatus } from "./salary.js";
import { hiringFields, interviewFields, hiringStatus } from "./hiring.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = "gemini-2.5-flash";

const careerStage = z.object({
  stage: z.string().describe('e.g. "Year 0-1".'),
  title: z.string(),
  experience: z.string(),
  responsibilities: z.array(z.string()),
  skills: z.array(z.string()),
  salaryRange: z.string().nullable(),
});

// Master schema, composed from the per-section slices.
const ResearchSchema = z.object({
  industry: z.string().describe('Industry, or "Data unavailable".'),
  headquarters: z.string().describe('City, Country, or "Data unavailable".'),
  foundedYear: z.string().nullable().describe("Founding year if known, else null."),
  website: z.string().nullable().describe("Official website URL if found, else null."),
  ...glassdoorFields,
  ...salaryFields,
  careerGrowth: z
    .array(careerStage)
    .describe("Typical 5-stage path based on PUBLIC info; label as typical, not guaranteed."),
  headquarters_note: z
    .string()
    .describe('Say if headquarters is the GLOBAL HQ or a regional office, e.g. "Global HQ" / "India office". "Data unavailable" if unknown.'),
  ...hiringFields,
  ...interviewFields,
  sourceUrls: z.array(z.string()).describe("URLs from the provided results that you relied on."),
  facts: z
    .array(
      z.object({
        field: z.enum(["industry", "headquarters", "foundedYear", "website", "glassdoorRating"]),
        value: z.string().describe("The value; for conflicting, include both, e.g. 'London vs Kolkata'."),
        source: z.string().describe("A URL from the provided results supporting this; empty string if none."),
        confidence: z.number().describe("0..1 confidence."),
        status: z.enum(["verified", "unverified", "conflicting"]),
      })
    )
    .describe(
      "Provenance for the hard facts above. status: verified = 2+ sources agree; unverified = only 1 source; conflicting = sources disagree."
    ),
});

const jsonSchema = sanitizeForGemini(
  zodToJsonSchema(ResearchSchema, { target: "openApi3", $refStrategy: "none" })
);

function sanitizeForGemini(node) {
  if (Array.isArray(node)) return node.map(sanitizeForGemini);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "$schema" || k === "additionalProperties" || k === "default") continue;
      out[k] = sanitizeForGemini(v);
    }
    return out;
  }
  return node;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generateWithRetry(args, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      return await ai.models.generateContent(args);
    } catch (err) {
      if (err?.status === 429 && i < tries) {
        const m = String(err?.message || "").match(/retry in ([\d.]+)s/i);
        await sleep((m ? Math.ceil(parseFloat(m[1])) : 30) * 1000 + 1000);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Research a company. Returns a structured research object (never throws for
 * "no data" — it fills unavailable). Throws only on hard failures (e.g. LLM down).
 */
export async function researchCompany(companyName) {
  // 1. Retrieve current public info (Serper). If search fails, we still produce
  //    a brief with unavailable sections rather than crashing.
  let raw = { news: "", interview: "", salary: "", culture: "", overview: "" };
  let searchOk = true;
  try {
    raw = await gatherCompanyData(companyName);
  } catch (err) {
    searchOk = false;
    console.warn(`Serper search failed for ${companyName}:`, err?.message);
  }

  const system = [
    "You are a company research analyst for a student preparing for recruitment.",
    "",
    "HARD FACTS — industry, headquarters, foundedYear, website, Glassdoor rating/",
    "reviewCount, and every salary number: use ONLY the retrieved results. If they are",
    'not clearly supported, use null or "Data unavailable" and confidence "unavailable".',
    "NEVER invent these. Do not output a LinkedIn follower or alumni count (handled elsewhere).",
    "For 'headquarters' give the company's GLOBAL headquarters, and set headquarters_note to",
    "say whether it is the global HQ or a regional office — do NOT put a job's location here.",
    "For EACH hard fact, add an entry to 'facts' with the exact source URL you used, a 0..1",
    "confidence, and status: verified (2+ of the provided results agree), unverified (only 1),",
    "or conflicting (results disagree — then put both values in 'value').",
    "",
    "TYPICAL GUIDANCE — hiringProcess.steps, interviewQuestions (topic categories), and the",
    "5-stage careerGrowth path: provide a realistic, clearly-labelled TYPICAL picture for a",
    "new-graduate technical hire at a company of this type, even if the snippets are thin.",
    "These are 'commonly reported' / 'typical', NOT guarantees. Keep them role-appropriate and",
    "do not attach fake company-specific numbers to them.",
    "",
    "Populate careerGrowth with 5 stages (Year 0-1 ... Year 4-5). Populate interview topic",
    "categories (dsa, csFundamentals, sql) with common topics for such roles.",
    "Return only the structured object via the schema.",
  ].join("\n");

  const user = [
    `Company: ${companyName}`,
    "",
    "=== NEWS ===",
    raw.news,
    "=== INTERVIEW / GLASSDOOR ===",
    raw.interview,
    "=== SALARY / AMBITIONBOX ===",
    raw.salary,
    "=== CULTURE ===",
    raw.culture,
    "=== OVERVIEW (HQ / growth / size) ===",
    raw.overview,
  ].join("\n");

  const res = await generateWithRetry({
    model: MODEL,
    contents: user,
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseSchema: jsonSchema,
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 4096,
    },
  });

  let parsed;
  try {
    parsed = ResearchSchema.parse(JSON.parse(res.text || "{}"));
  } catch (err) {
    throw new Error(`Research LLM returned invalid data: ${err.message}`);
  }

  // 2. Add deterministic, honest sections.
  const linkedin = buildLinkedIn(companyName);
  const glassdoor = { ...parsed.glassdoor, url: buildGlassdoorUrl(companyName) };

  const sourceUrls = [...new Set([...(parsed.sourceUrls || [])])].filter(Boolean);

  // 3. Per-section status for the dashboard ✓ / ⚠ readout.
  const sections = {
    website: parsed.website ? "ok" : "unavailable",
    linkedin: "ok", // links always available
    glassdoor: glassdoorStatus(glassdoor),
    salary: salaryStatus(parsed.salaryData),
    hiring: hiringStatus(parsed.hiringProcess),
    interview: parsed.interviewQuestions?.dsa?.length ? "ok" : "partial",
    search: searchOk ? "ok" : "unavailable",
  };

  const facts = Array.isArray(parsed.facts) ? parsed.facts : [];
  const hasConflict = facts.some((f) => f.status === "conflicting");

  return {
    basic: {
      industry: parsed.industry,
      headquarters: parsed.headquarters,
      headquartersNote: parsed.headquarters_note,
      foundedYear: parsed.foundedYear,
      website: parsed.website,
    },
    linkedin,
    glassdoor,
    salaryData: parsed.salaryData,
    careerGrowth: parsed.careerGrowth,
    hiringProcess: parsed.hiringProcess,
    interviewQuestions: parsed.interviewQuestions,
    facts, // field-level provenance: {field,value,source,confidence,status}
    hasConflict,
    sourceUrls,
    sections,
    generatedAt: new Date().toISOString(),
  };
}
