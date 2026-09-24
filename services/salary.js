/**
 * Salary section. Student/fresher-focused. Clearly separates base / bonus /
 * total / CTC and always carries a source + year + confidence. Nulls when
 * unverifiable — never a fabricated number.
 */
import { z } from "zod";

const salaryEntry = z.object({
  role: z.string(),
  range: z.string().describe('e.g. "6-9 LPA" or "$90k-$120k", or "Data unavailable".'),
  base: z.string().nullable().describe("Base pay if distinguishable, else null."),
  bonus: z.string().nullable(),
  totalOrCtc: z.string().nullable().describe("Total comp / CTC if stated, else null."),
  location: z.string().nullable(),
  source: z.string().describe("Where this came from, e.g. Glassdoor / AmbitionBox."),
  year: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low", "unavailable"]),
});

export const salaryFields = {
  salaryData: z.object({
    entryLevel: salaryEntry.describe("Fresher / new-grad salary."),
    otherRoles: z.array(salaryEntry).describe("Other relevant roles if data exists (may be empty)."),
    note: z.string().describe('Caveats, conflicts, or "Data unavailable".'),
  }),
};

export function salaryStatus(s) {
  if (!s?.entryLevel) return "unavailable";
  return s.entryLevel.confidence !== "unavailable" ? "ok" : "unavailable";
}
