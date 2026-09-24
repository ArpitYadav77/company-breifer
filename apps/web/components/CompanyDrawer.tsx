"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  askQuestion,
  fetchCompany,
  refreshResearch,
  type ChatAnswer,
  type Fact,
} from "@/lib/api";

const statusChip: Record<string, string> = {
  researched: "bg-olive-100/15 text-olive-50",
  partial: "bg-plum-300/15 text-plum-100",
  researching: "bg-teal-100/15 text-teal-100",
  pending: "bg-teal-100/15 text-teal-100",
  needs_attention: "bg-wine-500/15 text-wine-300",
  failed: "bg-wine-500/15 text-wine-300",
};

const factChip: Record<Fact["status"], string> = {
  verified: "bg-olive-100/15 text-olive-50",
  unverified: "bg-white/5 text-ink-300",
  conflicting: "bg-wine-500/20 text-wine-300",
};

function domain(url: string | null) {
  try {
    return url ? new URL(url).hostname.replace("www.", "") : "";
  } catch {
    return "";
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-300">{title}</h3>
      {children}
    </section>
  );
}

const NA = <p className="text-sm italic text-ink-300">Not available from current sources.</p>;

export function CompanyDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [chat, setChat] = useState<ChatAnswer | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["company", id],
    queryFn: () => fetchCompany(id!),
    enabled: !!id,
  });
  const refresh = useMutation({
    mutationFn: () => refreshResearch(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company", id] });
      qc.invalidateQueries({ queryKey: ["companies"] });
    },
  });
  const ask = useMutation({
    mutationFn: () => askQuestion(id!, q),
    onSuccess: (a) => setChat(a),
  });

  const c = data?.company;
  const brief = data?.brief;
  const topicsByCat = (data?.interview_topics ?? []).reduce<Record<string, string[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t.topic);
    return acc;
  }, {});

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/60 transition-opacity ${
          id ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed right-0 top-0 z-50 flex h-screen w-[min(560px,94vw)] flex-col border-l border-white/10 bg-ink-900 shadow-2xl transition-transform duration-300 ${
          id ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {isLoading || !c ? (
          <div className="p-6 text-ink-300">Loading…</div>
        ) : (
          <>
            <header className="flex items-start gap-3 border-b border-white/10 p-5">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{c.name}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      statusChip[c.research_status] ?? "bg-white/5 text-ink-300"
                    }`}
                  >
                    {c.research_status}
                  </span>
                  <span className="text-sm text-ink-300">
                    {c.industry ?? "Industry pending"}
                    {c.hq_location ? ` · ${c.hq_location}` : ""}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="ml-auto rounded-lg border border-white/10 px-2.5 py-1 text-ink-300 hover:text-ink-50"
                aria-label="Close"
              >
                ✕
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-5">
              {/* Ask RecruitSage */}
              <Section title="Ask RecruitSage">
                <div className="flex gap-2">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && q.trim() && ask.mutate()}
                    placeholder="e.g. What's asked in the interview?"
                    className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-teal-500"
                  />
                  <button
                    onClick={() => q.trim() && ask.mutate()}
                    disabled={ask.isPending}
                    className="rounded-lg bg-teal-300 px-3 py-2 text-sm font-semibold text-ink-900 disabled:opacity-60"
                  >
                    {ask.isPending ? "…" : "Ask"}
                  </button>
                </div>
                {chat && (
                  <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                    <p className="whitespace-pre-wrap">{chat.answer}</p>
                    {chat.sources.filter((s) => s.url).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2 border-t border-white/10 pt-2 text-xs">
                        {chat.sources
                          .filter((s) => s.url)
                          .map((s) => (
                            <a
                              key={s.n}
                              href={s.url!}
                              target="_blank"
                              rel="noopener"
                              className="text-teal-100 hover:underline"
                            >
                              [{s.n}] {domain(s.url)}
                            </a>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </Section>

              {data?.missing && (
                <div className="mb-4 rounded-xl border border-plum-700/40 bg-plum-900/40 p-3 text-sm text-plum-100">
                  <b>Why partial:</b> {data.missing}
                </div>
              )}

              <Section title="Facts & provenance">
                {data && data.facts.length > 0 ? (
                  <ul className="space-y-2">
                    {data.facts.map((f, i) => (
                      <li key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs uppercase tracking-wide text-ink-300">
                            {f.field.replace(/_/g, " ")}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${factChip[f.status]}`}>
                            {f.status} · {Math.round(f.confidence * 100)}%
                          </span>
                        </div>
                        <div className="mt-1 text-sm">{f.value}</div>
                        {f.source && (
                          <a href={f.source} target="_blank" rel="noopener" className="mt-1 inline-block text-xs text-teal-100 hover:underline">
                            {domain(f.source)} ↗
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  NA
                )}
              </Section>

              <Section title="Salary (fresher)">
                {brief?.salary?.entry_level?.range ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                    <div className="font-medium">{brief.salary.entry_level.range}</div>
                    <div className="text-xs text-ink-300">
                      {brief.salary.entry_level.source ?? "source n/a"} · confidence{" "}
                      {brief.salary.entry_level.confidence ?? "low"}
                    </div>
                  </div>
                ) : (
                  NA
                )}
              </Section>

              <Section title="5-year career growth">
                {brief && brief.career_growth.length > 0 ? (
                  <ol className="space-y-1 text-sm">
                    {brief.career_growth.map((s, i) => (
                      <li key={i} className="border-l-2 border-teal-700 pl-3">
                        <span className="text-ink-300">{s.stage}</span> — {s.title}
                      </li>
                    ))}
                    <li className="pt-1 text-xs italic text-ink-300">Typical path based on public info — not guaranteed.</li>
                  </ol>
                ) : (
                  NA
                )}
              </Section>

              <Section title="Glassdoor">
                {brief?.glassdoor && (brief.glassdoor.rating || brief.glassdoor.summary) ? (
                  <div className="text-sm">
                    {brief.glassdoor.rating && <div className="mb-1">★ {brief.glassdoor.rating} / 5</div>}
                    {brief.glassdoor.summary && <p className="text-ink-100">{brief.glassdoor.summary}</p>}
                    <a href={brief.glassdoor.url} target="_blank" rel="noopener" className="mt-1 inline-block text-xs text-teal-100 hover:underline">
                      Open Glassdoor ↗
                    </a>
                  </div>
                ) : (
                  <div className="text-sm">
                    {NA}
                    {brief?.glassdoor?.url && (
                      <a href={brief.glassdoor.url} target="_blank" rel="noopener" className="mt-1 inline-block text-xs text-teal-100 hover:underline">
                        Open Glassdoor ↗
                      </a>
                    )}
                  </div>
                )}
              </Section>

              <Section title="Hiring process">
                {data && data.hiring_stages.length > 0 ? (
                  <ol className="space-y-1 pl-5 text-sm text-ink-100">
                    {data.hiring_stages.map((s, i) => (
                      <li key={i} className="list-decimal">{s}</li>
                    ))}
                  </ol>
                ) : (
                  NA
                )}
              </Section>

              <Section title="Interview topics">
                {Object.keys(topicsByCat).length > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(topicsByCat).map(([cat, topics]) => (
                      <div key={cat}>
                        <div className="mb-1 text-xs text-ink-300">{cat.replace(/_/g, " ")}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {topics.map((t, i) => (
                            <span key={i} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-ink-100">{t}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  NA
                )}
              </Section>

              {brief?.linkedin && (
                <Section title="Links">
                  <div className="flex flex-wrap gap-2 text-sm">
                    <a href={brief.linkedin.company_url} target="_blank" rel="noopener" className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-teal-100 hover:border-teal-500">LinkedIn company ↗</a>
                    <a href={brief.linkedin.alumni_search_url} target="_blank" rel="noopener" className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-teal-100 hover:border-teal-500">Thapar/TIET alumni ↗</a>
                    {c.website && (
                      <a href={c.website} target="_blank" rel="noopener" className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-teal-100 hover:border-teal-500">Website ↗</a>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-ink-300">Follower / alumni counts are link-outs (never scraped).</p>
                </Section>
              )}
            </div>

            <div className="border-t border-white/10 p-4">
              <button
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending}
                className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:border-teal-500 disabled:opacity-60"
              >
                {refresh.isPending ? "Researching…" : "Refresh research"}
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
