/**
 * Glassdoor section. The URL is deterministic; the rating/reviews/summary are
 * filled by the grounded research LLM ONLY if the search snippets support them,
 * otherwise left null / "unavailable". We never fabricate a rating.
 */
import { z } from "zod";

const enc = (s) => encodeURIComponent(String(s || "").trim());

export function buildGlassdoorUrl(companyName) {
  return `https://www.glassdoor.com/Search/results.htm?keyword=${enc(companyName)}`;
}

// Zod slice merged into the master research schema.
export const glassdoorFields = {
  glassdoor: z.object({
    rating: z.number().nullable().describe("Overall rating out of 5, or null if not verifiable."),
    reviewCount: z.number().nullable().describe("Number of reviews, or null."),
    summary: z.string().describe('Short sentiment summary, or "Data unavailable".'),
    positives: z.array(z.string()).describe("Commonly mentioned positives (may be empty)."),
    negatives: z.array(z.string()).describe("Commonly mentioned negatives (may be empty)."),
    confidence: z.enum(["high", "medium", "low", "unavailable"]),
  }),
};

/** Section status for the dashboard's ✓ / ⚠ readout. */
export function glassdoorStatus(g) {
  if (!g) return "unavailable";
  return g.rating != null || (g.summary && g.summary !== "Data unavailable")
    ? "ok"
    : "unavailable";
}
