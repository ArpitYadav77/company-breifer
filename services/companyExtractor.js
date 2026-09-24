/**
 * Extracts the hiring company from a RecruitSage email.
 *
 * Order of attempts:
 *   1. Deterministic regex patterns on the subject, then the body (cheap, exact).
 *   2. Grounded Gemini fallback that may ONLY use text present in the email.
 * If neither yields a confident name -> { needsReview: true }. We never invent a name.
 */
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Configurable patterns. First capture group is the company name.
// Add more here as you observe real RecruitSage formats.
const PATTERNS = [
  // RecruitSage body: an explicit "Company: <name>" line (most reliable).
  /company\s*[:\-]\s*(.+?)(?:\n|$)/i,
  // RecruitSage subjects: "... at <Company>" (take the LAST " at ").
  /^.*\bat\s+(.+?)\s*$/i,
  // Other common recruitment phrasings.
  /recruitment notification for\s+(.+?)(?:\s*[-–—:|]|\s+for\b|$)/i,
  /new (?:job|opening|opportunity) (?:at|from)\s+(.+?)(?:\s*[-–—:|]|$)/i,
  /(.+?)\s+is hiring\b/i,
];

// Trailing tokens dropped during normalization: legal-entity forms AND common
// geographic/qualifier suffixes, so "EY", "EY India" and "EY India (Ernst &
// Young Services Pvt Ltd)" collapse to one id. Descriptive words that are part
// of the actual name (Technologies, Systems, Labs, Analytics...) are NOT dropped.
const JUNK = /^(pvt|private|ltd|limited|inc|incorporated|llc|llp|corp|corporation|gmbh|plc|co|group|holdings|services|solutions|india|indian|usa|us|uk|emea|apac|global|worldwide|international|intl)$/i;

/**
 * Conservative normalization for dedup. Lowercases, strips punctuation and
 * trailing LEGAL-ENTITY suffixes only (Pvt/Ltd/Inc...). It deliberately does
 * NOT strip descriptive words like "Technologies", "Systems" or geographies
 * like "India" — so "Microsoft" and "Microsoft India" stay DISTINCT, while
 * "Microsoft" and "Microsoft Pvt. Ltd." collapse to the same id.
 */
export function normalizeCompanyName(name) {
  let n = String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\(.*?\)/g, " ") // drop parentheticals: "ey (ernst & young...)" -> "ey"
    .replace(/[^\p{L}\p{N}\s.]/gu, " ") // keep letters/numbers/dot/space
    .replace(/\s+/g, " ")
    .trim();

  // Strip trailing legal/geo qualifier tokens repeatedly (e.g. "ey india pvt ltd" -> "ey").
  let prev;
  do {
    prev = n;
    n = n.replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
    const words = n.split(" ");
    if (words.length > 1 && JUNK.test(words[words.length - 1])) {
      words.pop();
      n = words.join(" ").trim();
    }
  } while (n !== prev);

  return n;
}

function cleanCandidate(raw) {
  return String(raw || "")
    .replace(/[\r\n].*$/s, "") // first line only
    .replace(/\s+/g, " ")
    .replace(/["'.,;:]+$/g, "")
    .trim();
}

function tryPatterns(text) {
  for (const re of PATTERNS) {
    const m = re.exec(text);
    if (m && m[1]) {
      const cand = cleanCandidate(m[1]);
      if (cand.length >= 2 && cand.length <= 80) return cand;
    }
  }
  return null;
}

/** Extract simple role hints from subject/body (best-effort, optional). */
function extractRoles(text) {
  const roles = new Set();
  const re =
    /\b(software (?:engineer|developer)|data (?:analyst|scientist|engineer)|sde\s?-?\s?\d?|backend|frontend|full[- ]?stack|analyst|intern(?:ship)?|consultant|associate)\b/gi;
  let m;
  while ((m = re.exec(text)) && roles.size < 5) roles.add(m[1].trim());
  return [...roles];
}

/**
 * Best-effort extraction of the ROLE/JOB location from the email (distinct from
 * the company's headquarters). Returns null if not clearly stated — we never
 * substitute the company HQ for the job location.
 */
function extractRoleLocation(subject, body) {
  const t = `${subject}\n${body}`;
  let m = /\b(?:location|job location|work location|based (?:in|out of))\s*[:\-]?\s*([A-Za-z][A-Za-z .,'/&-]{1,48})/i.exec(t);
  if (m) return cleanCandidate(m[1]);
  // "... Intern in Bengaluru" style at the end of a subject line
  m = /\bin\s+([A-Z][A-Za-z]+(?:,?\s+[A-Z][A-Za-z]+){0,2})\s*$/.exec(subject || "");
  if (m) return cleanCandidate(m[1]);
  return null;
}

async function geminiFallback(subject, body) {
  const prompt = [
    "Extract the HIRING COMPANY name from this recruitment email.",
    "Rules: use ONLY text that appears in the email. If the company is not clearly",
    'stated, return company as null. Do not guess. Return strict JSON:',
    '{ "company": string|null, "roles": string[] }',
    "",
    `SUBJECT: ${subject}`,
    `BODY:\n${(body || "").slice(0, 4000)}`,
  ].join("\n");

  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 256,
    },
  });
  try {
    const parsed = JSON.parse(res.text || "{}");
    const company = parsed.company ? cleanCandidate(parsed.company) : null;
    return { company, roles: Array.isArray(parsed.roles) ? parsed.roles.slice(0, 5) : [] };
  } catch {
    return { company: null, roles: [] };
  }
}

/**
 * Main entry. Returns:
 *   { companyName, normalizedName, roles, confidence, needsReview: false }
 * or
 *   { needsReview: true, reason }
 */
export async function extractCompany(msg) {
  const subject = msg.subject || "";
  const body = msg.bodyText || "";
  const roles = extractRoles(`${subject}\n${body}`);

  // 1. Regex on subject, then body.
  let name = tryPatterns(subject) || tryPatterns(body);
  let confidence = name ? "high" : null;

  // 2. Grounded LLM fallback.
  if (!name) {
    try {
      const g = await geminiFallback(subject, body);
      if (g.company) {
        name = g.company;
        confidence = "medium";
        if (g.roles.length) roles.push(...g.roles.filter((r) => !roles.includes(r)));
      }
    } catch {
      // ignore; falls through to needs_review
    }
  }

  if (!name) {
    return { needsReview: true, reason: "Company name not confidently found." };
  }

  return {
    companyName: name,
    normalizedName: normalizeCompanyName(name),
    roles: [...new Set(roles)].slice(0, 5),
    roleLocation: extractRoleLocation(subject, body), // job location, NOT company HQ
    confidence,
    needsReview: false,
  };
}
