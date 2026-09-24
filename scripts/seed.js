/**
 * Seeds a synthetic set of company briefs and indexes them for RAG.
 * Run with:  node scripts/seed.js
 *
 * Safe to re-run: saveBrief upserts by company, and indexBrief replaces a
 * company's chunks. Real briefs already in the DB are left untouched.
 */
import "dotenv/config";
import { saveBrief } from "../services/db.js";
import { indexBrief } from "../services/rag.js";
import client from "../services/db.js";

// created_at is set to "now" by saveBrief; the funding DATES live inside the
// news text so the LLM can reason about "last year" / "last 90 days".
const B = (company, o) => ({ company, sources_confidence: "medium", ...o });

const briefs = [
  B("Nimbus Analytics", {
    snapshot: "Cloud data-observability startup helping teams catch broken data pipelines.",
    recent_news: ["Raised a $12M Series A led by Foundry Capital (March 2026).", "Launched anomaly-detection feature."],
    interview_format: ["Recruiter call", "Take-home data task", "System design", "Founder chat"],
    common_questions: ["Design a metrics pipeline", "Debug a late-arriving data scenario"],
    comp_notes: "Base around market rate; equity-heavy. Ranges not officially published.",
    culture_signals: ["Fast-paced", "Strong data culture", "Remote-first"],
    watch_out_for: ["Small team means broad ownership"],
  }),
  B("Vaultline", {
    snapshot: "Fintech building compliance tooling for small banks.",
    recent_news: ["Closed a $9M Series A (June 2026).", "Signed two regional bank customers."],
    interview_format: ["HR screen", "Coding round", "Compliance case study", "VP interview"],
    common_questions: ["How would you model an audit trail?", "Explain idempotency in payments"],
    comp_notes: "insufficient data",
    culture_signals: ["Compliance-minded", "Hybrid, 3 days office"],
    watch_out_for: ["Heavily regulated domain — detail matters"],
  }),
  B("Cinderpeak", {
    snapshot: "Developer-tools company for incident response.",
    recent_news: ["Raised a Series A of $7M (November 2025).", "Open-sourced its CLI."],
    interview_format: ["Screen", "Live coding", "On-call simulation", "Team fit"],
    common_questions: ["Design an alerting system", "Reduce alert fatigue how?"],
    comp_notes: "Base competitive for mid-size startups; stipend for home office.",
    culture_signals: ["Blameless postmortems", "Async-heavy"],
    watch_out_for: ["Rotating on-call from month one"],
  }),
  B("Tunda Health", {
    snapshot: "Telehealth platform for rural clinics.",
    recent_news: ["Series A funding of $15M announced (January 2026).", "Expanded to three new states."],
    interview_format: ["Recruiter", "Domain interview", "Coding", "Values interview"],
    common_questions: ["How do you handle PHI?", "Design an appointment scheduler"],
    comp_notes: "Salary bands published internally; roughly market. Good benefits.",
    culture_signals: ["Mission-driven", "Patient-first", "Slower, deliberate pace"],
    watch_out_for: ["HIPAA training is mandatory and strict"],
  }),
  B("Driftwood Games", {
    snapshot: "Indie-to-mid studio making cooperative mobile games.",
    recent_news: ["Raised a $5M Series A (August 2026).", "First title crossed 2M downloads."],
    interview_format: ["Portfolio review", "Technical screen", "Gameplay prototype", "Culture chat"],
    common_questions: ["Optimize a render loop", "Design a matchmaking system"],
    comp_notes: "Below-market base, meaningful equity and royalties.",
    culture_signals: ["Creative", "Crunch near launches", "Flat structure"],
    watch_out_for: ["Crunch periods before releases"],
  }),
  B("Halcyon Labs", {
    snapshot: "AI research tooling for evaluating model outputs.",
    recent_news: ["$20M Series A closed (April 2026).", "Released an open eval benchmark."],
    interview_format: ["Screen", "ML coding", "Research discussion", "Founder interview"],
    common_questions: ["Design an eval harness", "How to detect hallucinations?"],
    comp_notes: "Top-of-market base plus equity for senior ML roles.",
    culture_signals: ["Research-driven", "High autonomy", "In-person SF"],
    watch_out_for: ["High bar; expect a research-style interview"],
  }),
  B("Lumadex", {
    snapshot: "Logistics optimization for last-mile delivery.",
    recent_news: ["Raised its Series A of $8M back in August 2024.", "Now focused on profitability."],
    interview_format: ["Screen", "Algorithms round", "System design"],
    common_questions: ["Solve a routing problem", "Design a dispatch system"],
    comp_notes: "Base slightly below market; limited equity refresh.",
    culture_signals: ["Operationally intense", "Numbers-focused"],
    watch_out_for: ["Older funding — ask about runway"],
  }),
  B("Ferrolytic", {
    snapshot: "Battery-materials manufacturing scale-up.",
    recent_news: ["Raised a $40M Series B (May 2026).", "Broke ground on a new plant."],
    interview_format: ["Recruiter", "Technical panel", "Plant visit", "Director interview"],
    common_questions: ["Explain a failure analysis", "Process control basics"],
    comp_notes: "Manufacturing pay scales; overtime common.",
    culture_signals: ["Safety-first", "Shift work", "Hands-on"],
    watch_out_for: ["On-site only; shift schedules"],
  }),
  B("Oxbow Robotics", {
    snapshot: "Warehouse automation robots.",
    recent_news: ["$55M Series B raised (February 2026).", "Deployed to a major 3PL."],
    interview_format: ["Screen", "Controls coding", "Hardware/software integration", "Panel"],
    common_questions: ["PID tuning", "Design a robot fleet coordinator"],
    comp_notes: "insufficient data",
    culture_signals: ["Hardware pace (slower iteration)", "Lab-based"],
    watch_out_for: ["Expect hardware-in-the-loop debugging"],
  }),
  B("Aeronix", {
    snapshot: "Drone-based infrastructure inspection.",
    recent_news: ["Closed a $70M Series C (July 2026).", "FAA approval expanded."],
    interview_format: ["Screen", "CV coding", "System design", "Leadership chat"],
    common_questions: ["Design an image pipeline", "Handle GPS-denied navigation"],
    comp_notes: "Strong base and equity; travel required.",
    culture_signals: ["Field-heavy", "Travel-intensive"],
    watch_out_for: ["Significant travel to sites"],
  }),
  B("Kestrel Pay", {
    snapshot: "Cross-border payments for freelancers.",
    recent_news: ["Raised a $120M Series D (April 2026).", "Launched in 10 new countries."],
    interview_format: ["Screen", "Coding", "Payments case", "Bar-raiser"],
    common_questions: ["Design a ledger", "Handle currency conversion at scale"],
    comp_notes: "Above-market base; annual bonus.",
    culture_signals: ["Scale-focused", "Process-heavy", "Hybrid"],
    watch_out_for: ["Long, multi-stage interview loop"],
  }),
  B("Quillstone", {
    snapshot: "Legal-tech contract review platform.",
    recent_news: ["Completed its IPO (June 2026).", "Reported first profitable quarter."],
    interview_format: ["Recruiter", "Coding", "Product case", "Exec interview"],
    common_questions: ["Design a document search", "Handle sensitive data access"],
    comp_notes: "Public-company RSUs; base at market.",
    culture_signals: ["More structured post-IPO", "Stable"],
    watch_out_for: ["Bureaucracy increasing after IPO"],
  }),
  B("Marlowe Systems", {
    snapshot: "Enterprise identity management.",
    recent_news: ["Acquired by a larger security vendor (March 2026).", "Integrations underway."],
    interview_format: ["Screen", "Security coding", "Threat modeling", "Panel"],
    common_questions: ["Design SSO", "Explain OAuth flows"],
    comp_notes: "Acquirer's bands now apply; details vary.",
    culture_signals: ["In transition post-acquisition"],
    watch_out_for: ["Org still integrating — roles may shift"],
  }),
  B("Petalgrid", {
    snapshot: "Consumer social app for local events.",
    recent_news: ["Announced a 15% layoff (May 2026).", "Refocusing on core app."],
    interview_format: ["Screen", "Coding", "Product sense", "Culture"],
    common_questions: ["Design a feed", "Improve retention how?"],
    comp_notes: "Base at market; equity underwater after down round.",
    culture_signals: ["Rebuilding morale", "Uncertain"],
    watch_out_for: ["Recent layoffs — ask about stability"],
  }),
  B("Grovewave", {
    snapshot: "Bootstrapped e-commerce analytics, profitable.",
    recent_news: ["No outside funding; crossed $10M ARR (2026).", "Hiring steadily."],
    interview_format: ["Screen", "Take-home", "Pairing", "Founder chat"],
    common_questions: ["Design an analytics rollup", "SQL optimization"],
    comp_notes: "Fair base, profit-sharing, no equity.",
    culture_signals: ["Sustainable pace", "No VC pressure", "Fully remote"],
    watch_out_for: ["No equity upside; profit-share instead"],
  }),
  B("Sablefin", {
    snapshot: "Personal-finance budgeting app, profitable and independent.",
    recent_news: ["Reached 1M paying users (2026).", "No funding rounds."],
    interview_format: ["Screen", "Mobile coding", "System design", "Values"],
    common_questions: ["Design offline sync", "Secure local storage"],
    comp_notes: "Market base; small bonus.",
    culture_signals: ["Calm", "Long-tenure team"],
    watch_out_for: ["Slow, careful shipping cadence"],
  }),
  B("Verdanta Energy", {
    snapshot: "Grid software for community solar.",
    recent_news: ["Awarded a $6M government grant (February 2026).", "Piloting with two utilities."],
    interview_format: ["Screen", "Coding", "Domain interview", "Panel"],
    common_questions: ["Model energy forecasting", "Design a metering pipeline"],
    comp_notes: "insufficient data",
    culture_signals: ["Mission-driven", "Policy-aware"],
    watch_out_for: ["Grant-funded — ask about long-term revenue"],
  }),
  B("Bytemarsh", {
    snapshot: "Early-stage dev-tools for API testing.",
    recent_news: ["Raised a $2.5M seed round (April 2026).", "Public beta launched."],
    interview_format: ["Founder screen", "Coding", "Trial project"],
    common_questions: ["Design a mocking layer", "Handle flaky tests"],
    comp_notes: "Below-market base, high equity (seed stage).",
    culture_signals: ["Scrappy", "Wear many hats"],
    watch_out_for: ["Seed stage — high risk/high ownership"],
  }),
];

async function main() {
  console.log(`Seeding ${briefs.length} synthetic briefs...`);
  for (const { company, ...brief } of briefs) {
    await saveBrief(company, brief);
    const n = await indexBrief(company, brief);
    console.log(`  ✓ ${company}  (${n} chunks)`);
  }
  console.log("Done.");
  await client.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
