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
  last_detected_at: string;
};

export async function fetchCompanies(): Promise<{ companies: Company[] }> {
  const res = await fetch(`${API}/api/companies`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load companies");
  return res.json();
}
