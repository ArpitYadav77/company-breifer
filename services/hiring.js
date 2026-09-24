/**
 * Hiring process + interview topics. Both are framed as "commonly reported",
 * never as guarantees, and are grounded in retrieved sources.
 */
import { z } from "zod";

export const hiringFields = {
  hiringProcess: z.object({
    steps: z.array(z.string()).describe("Commonly reported stages, in order (may be empty)."),
    variesBy: z
      .array(z.string())
      .describe('What changes the process, e.g. "campus vs off-campus", "role".'),
    note: z.string().describe('Caveats or "Data unavailable".'),
  }),
};

export const interviewFields = {
  interviewQuestions: z.object({
    dsa: z.array(z.string()).describe("Commonly reported DSA/coding topics."),
    csFundamentals: z.array(z.string()).describe("OOP / DBMS / OS / CN topics."),
    sql: z.array(z.string()),
    projects: z.array(z.string()).describe("Types of project questions."),
    behavioral: z.array(z.string()),
    note: z.string().describe('e.g. "Commonly reported topics; not guaranteed."'),
  }),
};

export function hiringStatus(h) {
  return h?.steps?.length ? "ok" : "unavailable";
}
