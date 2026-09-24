// Typed API client. Same-origin (Next rewrites proxy /api to FastAPI).
export type Company = {
  id: string;
  name: string;
  industry: string | null;
  hq_location: string | null;
  hq_note: string | null;
  website: string | null;
  research_status: string;
  last_detected_at: string;
};

export async function fetchCompanies(): Promise<{ companies: Company[] }> {
  const res = await fetch("/api/companies", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load companies");
  return res.json();
}
