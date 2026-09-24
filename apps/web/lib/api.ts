// Typed API client. The browser calls the API directly (Docker maps it to
// localhost:8000; the API allows CORS from the web origin). This avoids the
// container-internal proxy pitfall (a container's own localhost != the api container).
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type Company = {
  id: string;
  name: string;
  industry: string | null;
  hq_location: string | null;
  hq_note: string | null;
  website: string | null;
  research_status: string;
  research_updated_at: string | null;
  last_detected_at: string;
};

export type Fact = {
  field: string;
  value: string;
  confidence: number;
  status: "verified" | "unverified" | "conflicting";
  source: string | null;
};

export type Brief = {
  salary: { entry_level?: { range?: string; source?: string; confidence?: string } } | null;
  career_growth: { stage: string; title: string }[];
  glassdoor: {
    rating: string | null;
    summary: string | null;
    positives: string[];
    negatives: string[];
    url: string;
  };
  linkedin: {
    company_url: string;
    alumni_search_url: string;
    followers: number | null;
    alumni_count: number | null;
  };
} | null;

export type CompanyDetail = {
  company: Company;
  brief: Brief;
  facts: Fact[];
  hiring_stages: string[];
  interview_topics: { category: string; topic: string }[];
  missing: string | null;
};

export type ChatAnswer = {
  answer: string;
  sources: { n: number; url: string | null; title: string | null }[];
};

export async function askQuestion(id: string, question: string): Promise<ChatAnswer> {
  const res = await fetch(`${API}/api/companies/${id}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error("Chat failed");
  return res.json();
}

export async function fetchCompanies(): Promise<{ companies: Company[] }> {
  const res = await fetch(`${API}/api/companies`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load companies");
  return res.json();
}

export async function fetchCompany(id: string): Promise<CompanyDetail> {
  const res = await fetch(`${API}/api/companies/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load company");
  return res.json();
}

export async function refreshResearch(id: string): Promise<unknown> {
  const res = await fetch(`${API}/api/companies/${id}/research?sync=true`, { method: "POST" });
  if (!res.ok) throw new Error("Research failed");
  return res.json();
}
