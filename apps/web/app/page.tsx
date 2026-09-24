"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchCompanies } from "@/lib/api";

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ["companies"], queryFn: fetchCompanies });

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">RecruitSage</h1>
        <p className="text-sm text-ink-300">Company Intelligence</p>
      </header>

      {isLoading && <p className="text-ink-300">Loading…</p>}
      {error && <p className="text-wine-300">Failed to load. Is the API running on :8000?</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {data?.companies?.map((c) => (
          <article
            key={c.id}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-teal-500/50"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">{c.name}</h2>
              <span className="rounded-full bg-olive-100/15 px-2 py-0.5 text-xs text-olive-50">
                {c.research_status}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-300">
              {c.industry ?? "Industry pending"}
              {c.hq_location ? ` · ${c.hq_location}` : ""}
            </p>
          </article>
        ))}
      </div>

      {data && data.companies.length === 0 && (
        <p className="text-ink-300">No companies yet — sync Gmail to begin.</p>
      )}
    </main>
  );
}
