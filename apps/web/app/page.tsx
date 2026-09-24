"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCompanies } from "@/lib/api";
import { CompanyDrawer } from "@/components/CompanyDrawer";

const statusChip: Record<string, string> = {
  researched: "bg-olive-100/15 text-olive-50",
  partial: "bg-plum-300/15 text-plum-100",
  researching: "bg-teal-100/15 text-teal-100",
  pending: "bg-teal-100/15 text-teal-100",
  needs_attention: "bg-wine-500/15 text-wine-300",
  failed: "bg-wine-500/15 text-wine-300",
};

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ["companies"], queryFn: fetchCompanies });
  const [selected, setSelected] = useState<string | null>(null);

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
          <button
            key={c.id}
            onClick={() => setSelected(c.id)}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left transition hover:-translate-y-0.5 hover:border-teal-500/50"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-medium">{c.name}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  statusChip[c.research_status] ?? "bg-white/5 text-ink-300"
                }`}
              >
                {c.research_status}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-300">
              {c.industry ?? "Industry pending"}
              {c.hq_location ? ` · ${c.hq_location}` : ""}
            </p>
            <span className="mt-3 inline-block text-sm font-medium text-teal-100">
              Explore intelligence →
            </span>
          </button>
        ))}
      </div>

      {data && data.companies.length === 0 && (
        <p className="text-ink-300">No companies yet — create one via the API to begin.</p>
      )}

      <CompanyDrawer id={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
