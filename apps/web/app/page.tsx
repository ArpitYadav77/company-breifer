"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCompanies, fetchStatus, syncGmail, type Company } from "@/lib/api";
import { CompanyDrawer } from "@/components/CompanyDrawer";

/* ------- status styling (pill + dot + sort rank; researched = most complete) ------- */
const STATUS: Record<string, { label: string; pill: string; dot: string; rank: number }> = {
  researched:      { label: "researched",      pill: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/20", dot: "bg-emerald-400", rank: 0 },
  partial:         { label: "partial",         pill: "bg-amber-500/15 text-amber-300 ring-amber-500/20",       dot: "bg-amber-400",   rank: 1 },
  needs_attention: { label: "needs attention", pill: "bg-rose-500/15 text-rose-300 ring-rose-500/20",          dot: "bg-rose-400",    rank: 2 },
  researching:     { label: "researching",     pill: "bg-teal-400/15 text-teal-200 ring-teal-400/20",          dot: "bg-teal-300",    rank: 3 },
  pending:         { label: "pending",          pill: "bg-white/5 text-ink-300 ring-white/10",                 dot: "bg-slate-400",   rank: 4 },
  failed:          { label: "failed",           pill: "bg-rose-500/15 text-rose-300 ring-rose-500/20",         dot: "bg-rose-400",    rank: 5 },
};
const statusMeta = (s: string) =>
  STATUS[s] ?? { label: s, pill: "bg-white/5 text-ink-300 ring-white/10", dot: "bg-slate-400", rank: 9 };

/* ------- category keyword map — EDIT HERE to tune categorisation ------- */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Technology/IT": ["software", "it", "cloud", "consulting", "tech", "information", "internet", "analytics", "saas", "ai"],
  "E-commerce/Retail": ["e-commerce", "ecommerce", "retail", "marketplace", "grocery"],
  "Electrical/Electronics": ["semiconductor", "electrical", "electronics", "communications"],
  "Manufacturing/Automotive": ["manufacturing", "ev", "automotive", "industrial", "machinery", "engineering"],
};
const CATEGORIES = ["All", ...Object.keys(CATEGORY_KEYWORDS), "Other"] as const;

function categoryOf(industry: string | null): string {
  const t = (industry ?? "").toLowerCase();
  if (!t) return "Other";
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => t.includes(w))) return cat;
  }
  return "Other";
}

type Sort = "az" | "za" | "status";

export default function Dashboard() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["companies"], queryFn: fetchCompanies });
  const { data: status } = useQuery({ queryKey: ["status"], queryFn: fetchStatus });

  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("All");
  const [sort, setSort] = useState<Sort>("az");
  const [grouped, setGrouped] = useState(false);

  const sync = useMutation({
    mutationFn: syncGmail,
    onSuccess: (r) => {
      setNote(r.ok ? `Scanned ${r.scanned}, new ${r.new_companies}, researched ${r.researched}` : `Sync: ${r.reason ?? "failed"}`);
      qc.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  const companies = useMemo(() => data?.companies ?? [], [data]);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of companies) m[c.research_status] = (m[c.research_status] ?? 0) + 1;
    return m;
  }, [companies]);

  const categoryCounts = useMemo(() => {
    const m: Record<string, number> = { All: companies.length };
    for (const c of companies) {
      const cat = categoryOf(c.industry);
      m[cat] = (m[cat] ?? 0) + 1;
    }
    return m;
  }, [companies]);

  const visible = useMemo(() => {
    let list = companies.slice();
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
    if (statusFilter) list = list.filter((c) => c.research_status === statusFilter);
    if (category !== "All") list = list.filter((c) => categoryOf(c.industry) === category);
    const byName = (a: Company, b: Company) => a.name.localeCompare(b.name);
    if (sort === "az") list.sort(byName);
    else if (sort === "za") list.sort((a, b) => b.name.localeCompare(a.name));
    else list.sort((a, b) => statusMeta(a.research_status).rank - statusMeta(b.research_status).rank || byName(a, b));
    return list;
  }, [companies, search, statusFilter, category, sort]);

  const filtersActive = Boolean(search || statusFilter || category !== "All");
  const clearFilters = () => { setSearch(""); setStatusFilter(null); setCategory("All"); };
  const filterKey = `${search}|${statusFilter}|${category}|${sort}|${grouped}`;

  /* group the visible list by category (default inner sort: researched first, then A–Z) */
  const groups = useMemo(() => {
    if (!grouped) return null;
    const g: Record<string, Company[]> = {};
    for (const c of visible) (g[categoryOf(c.industry)] ??= []).push(c);
    for (const k of Object.keys(g))
      g[k].sort((a, b) => statusMeta(a.research_status).rank - statusMeta(b.research_status).rank || a.name.localeCompare(b.name));
    return Object.keys(CATEGORY_KEYWORDS).concat("Other").filter((k) => g[k]?.length).map((k) => [k, g[k]] as const);
  }, [visible, grouped]);

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-6">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">RecruitSage</h1>
          <p className="mt-0.5 text-sm text-ink-300">Company intelligence for campus placements</p>
        </div>
        <div className="text-right">
          <button
            onClick={() => sync.mutate()}
            disabled={sync.isPending || !status?.gmail_configured}
            title={status?.gmail_configured ? "" : "Add Gmail credentials to apps/api/.env"}
            className="rounded-lg bg-teal-300 px-4 py-2 text-sm font-semibold text-ink-900 transition hover:bg-teal-200 disabled:opacity-50"
          >
            {sync.isPending ? "Syncing…" : "Sync Gmail"}
          </button>
          {note && <div className="mt-1 max-w-[16rem] text-xs text-ink-300">{note}</div>}
        </div>
      </header>

      {error && <p className="text-rose-300">Failed to load. Is the API running on :8000?</p>}

      {/* Summary bar */}
      {!isLoading && companies.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-ink-100">
            <b>{companies.length}</b> companies
          </span>
          {Object.entries(statusCounts)
            .sort((a, b) => statusMeta(a[0]).rank - statusMeta(b[0]).rank)
            .map(([s, n]) => {
              const m = statusMeta(s);
              const active = statusFilter === s;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(active ? null : s)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 ring-1 transition ${m.pill} ${active ? "ring-2 ring-teal-400/60" : ""}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                  {m.label} <b className="opacity-80">{n}</b>
                </button>
              );
            })}
        </div>
      )}

      {/* Toolbar: search · sort · group toggle */}
      {!isLoading && companies.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search companies…"
            className="min-w-[12rem] flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none transition focus:border-teal-500/60"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-teal-500/60"
          >
            <option value="az">A to Z</option>
            <option value="za">Z to A</option>
            <option value="status">Status</option>
          </select>
          <button
            onClick={() => setGrouped((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-sm transition ${grouped ? "border-teal-500/60 text-teal-200" : "border-white/10 text-ink-300 hover:text-ink-100"}`}
          >
            Group by category
          </button>
        </div>
      )}

      {/* Category chips */}
      {!isLoading && companies.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => {
            const n = categoryCounts[cat] ?? 0;
            if (cat !== "All" && n === 0) return null;
            const active = category === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`rounded-full px-3 py-1 text-xs transition ${active ? "bg-teal-300 font-semibold text-ink-900" : "bg-white/[0.04] text-ink-300 hover:text-ink-100"}`}
              >
                {cat} <span className="opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[112px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
          ))}
        </div>
      )}

      {/* Content */}
      {!isLoading && companies.length === 0 && (
        <p className="text-ink-300">No companies yet — run a Gmail sync to begin.</p>
      )}

      {!isLoading && companies.length > 0 && visible.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
          <p className="text-ink-300">No companies match your filters</p>
          <button onClick={clearFilters} className="mt-3 rounded-lg bg-teal-300 px-4 py-2 text-sm font-semibold text-ink-900">
            Clear filters
          </button>
        </div>
      )}

      {!isLoading && visible.length > 0 && (
        <div key={filterKey} className="fade-in">
          {grouped && groups ? (
            <div className="space-y-6">
              {groups.map(([cat, list]) => (
                <section key={cat}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-300">
                    {cat} <span className="opacity-60">({list.length})</span>
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {list.map((c) => <Card key={c.id} c={c} onOpen={setSelected} />)}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {visible.map((c) => <Card key={c.id} c={c} onOpen={setSelected} />)}
            </div>
          )}
        </div>
      )}

      <CompanyDrawer id={selected} onClose={() => setSelected(null)} />
    </main>
  );
}

/* ------- company card (same open-drawer behaviour) ------- */
function Card({ c, onOpen }: { c: Company; onOpen: (id: string) => void }) {
  const m = statusMeta(c.research_status);
  return (
    <button
      onClick={() => onOpen(c.id)}
      className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-500/50 hover:shadow-lg hover:shadow-teal-500/5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-medium leading-tight">{c.name}</h2>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${m.pill}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
          {m.label}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-ink-300">
        {c.industry ? c.industry : <span className="italic text-ink-300/60">Industry not available yet</span>}
        {c.hq_location ? ` · ${c.hq_location}` : ""}
      </p>
      <span className="mt-3 inline-block text-sm font-medium text-teal-200 transition group-hover:translate-x-0.5">
        Explore intelligence →
      </span>
    </button>
  );
}
