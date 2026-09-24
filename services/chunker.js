/**
 * Chunking strategy for briefing-style text.
 *
 * WHY THIS STRATEGY (justification):
 * A brief is already short and semantically sectioned (snapshot, recent_news,
 * comp_notes, ...). Fixed-size character/token chunking would cut across those
 * sections, splitting a single idea in half and losing the company anchor.
 * Instead we chunk by SECTION, and prefix every chunk with the company name and
 * section label so the embedding itself carries that context and answers can be
 * cited. Two nuances:
 *   - recent_news is split into ONE chunk PER item, because each news item is an
 *     independent fact users query directly ("who raised a Series A?"). Splitting
 *     boosts retrieval precision for exactly those questions.
 *   - list-style sections that are read as a set (interview_format, questions,
 *     culture, watch_out_for) stay as one chunk each — they're cohesive.
 */

function makeChunk(company, section, body) {
  const text = `Company: ${company}\nSection: ${section}\n${body}`.trim();
  return { company, field: section, text };
}

/**
 * Turn one brief document into an array of { company, field, text } chunks.
 */
export function chunkBrief(company, brief) {
  const chunks = [];

  if (brief.snapshot) {
    chunks.push(makeChunk(company, "snapshot", brief.snapshot));
  }
  if (brief.comp_notes) {
    chunks.push(makeChunk(company, "comp_notes", brief.comp_notes));
  }

  // One chunk per news item — each is an independently queryable fact.
  (brief.recent_news || []).forEach((item) => {
    if (item) chunks.push(makeChunk(company, "recent_news", item));
  });

  // Cohesive list sections: keep together as a single chunk each.
  const listSections = {
    interview_format: brief.interview_format,
    common_questions: brief.common_questions,
    culture_signals: brief.culture_signals,
    watch_out_for: brief.watch_out_for,
  };
  for (const [section, items] of Object.entries(listSections)) {
    if (Array.isArray(items) && items.length) {
      chunks.push(makeChunk(company, section, items.map((i) => `- ${i}`).join("\n")));
    }
  }

  // A confidence signal, useful for questions like "which briefs are low confidence?"
  if (brief.sources_confidence) {
    chunks.push(
      makeChunk(company, "sources_confidence", `Source confidence: ${brief.sources_confidence}`)
    );
  }

  return chunks;
}
