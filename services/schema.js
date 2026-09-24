import { z } from "zod";

/**
 * Structured shape of a company interview-prep brief.
 * This schema is used both to validate the LLM output and to generate
 * the JSON Schema for the Anthropic "submit_brief" tool.
 */
export const BriefSchema = z.object({
  company: z.string().describe("The company the brief is about."),
  snapshot: z
    .string()
    .describe(
      "2-4 sentence plain-language overview of what the company does and its current standing."
    ),
  headquarters: z
    .string()
    .describe(
      'Primary headquarters location (city, country). Say "insufficient data" if unknown.'
    ),
  growth_5yr: z
    .string()
    .describe(
      'The company\'s growth trajectory over roughly the last 5 years (headcount, revenue, funding, or expansion). Say "insufficient data" if unclear.'
    ),
  glassdoor_summary: z
    .string()
    .describe(
      'Short summary of Glassdoor sentiment, including the overall rating if present. Say "insufficient data" if none found.'
    ),
  recent_news: z
    .array(z.string())
    .describe("Notable developments from the last 90 days, one item per string."),
  interview_format: z
    .array(z.string())
    .describe("Stages/rounds of the interview process, in order where known."),
  common_questions: z
    .array(z.string())
    .describe("Frequently reported interview questions or question themes."),
  comp_notes: z
    .string()
    .describe(
      'Compensation observations. Must literally say "insufficient data" if pay ranges are unclear or unverified.'
    ),
  culture_signals: z
    .array(z.string())
    .describe("Signals about work culture, management, and work-life balance."),
  watch_out_for: z
    .array(z.string())
    .describe("Red flags, common candidate mistakes, or things to prepare carefully for."),
  sources_confidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "Honest confidence in the underlying sources: high = strong recent corroborated data, low = sparse/dated/uncorroborated."
    ),
});
