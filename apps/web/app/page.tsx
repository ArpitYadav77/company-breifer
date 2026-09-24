"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCompanies, fetchStatus, syncGmail } from "@/lib/api";
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
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["companies"], queryFn: fetchCompanies });
  const { data: status } = useQuery({ queryKey: ["status"], queryFn: fetchStatus });
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const sync = useMutation({
    mutationFn: syncGmail,
    onSuccess: (r) => {
      setNote(
        r.ok
          ? `Scanned ${r.scanned}, new ${r.new_companies}, researched ${r.researched}, review ${r.needs_review}`
          : `Sync: ${r.reason ?? "failed"}`
      );
      qc.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">RecruitSage</h1>
          <p className="text-sm text-ink-300">Company Intelligence</p>
        </div>
        <div className="text-right">
          <button
            onClick={() => sync.mutate()}
            disabled={sync.isPending || !status?.gmail_configured}
            title={status?.gmail_configured ? "" : "Add Gmail credentials to apps/api/.env"}
            className="rounded-lg bg-teal-300 px-4 py-2 text-sm font-semibold text-ink-900 disabled:opacity-50"
          >
            {sync.isPending ? "Syncing…" : "Sync Gmail"}
          </button>
          <div className="mt-1 text-xs text-ink-300">{note}</div>
        </div>
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
