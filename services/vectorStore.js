import client from "./db.js";

/**
 * VECTOR STORE CHOICE (justified against the "match the tool to the scale" framework,
 * given we already run MongoDB):
 *
 * Scale here is tiny — ~20 briefs => a few hundred chunks. At that size a dedicated
 * vector DB (Pinecone/Chroma/Qdrant) adds infrastructure, cost, another failure
 * point and a network hop for ZERO benefit: a brute-force cosine scan over a few
 * hundred 768-dim vectors is sub-millisecond in plain JS.
 *
 * So we reuse the database we already operate: store each chunk + its embedding in a
 * MongoDB collection and rank in the app. "Use the boring tool you already run."
 *
 * Migration path if this ever grows past ~100k chunks: keep the same MongoDB and
 * turn on Atlas Vector Search (an index on the same collection), or move to a
 * dedicated ANN database. No app rewrite — only vectorStore.search() changes.
 */

const dbName = process.env.DB_NAME || "company_briefs";
const COLLECTION = "brief_chunks";

function coll() {
  return client.db(dbName).collection(COLLECTION);
}

/** Cosine similarity between two equal-length vectors. */
function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Replace all stored chunks for a company with a fresh set.
 * chunks: [{ company, field, text, embedding }]
 */
export async function upsertChunks(company, chunks) {
  const c = coll();
  await c.deleteMany({ company });
  if (chunks.length) {
    await c.insertMany(
      chunks.map((ch) => ({ ...ch, created_at: new Date() }))
    );
  }
}

/**
 * Brute-force nearest-neighbour search.
 * Returns top-k chunks: [{ company, field, text, score }], highest score first.
 */
export async function search(queryVec, k = 6) {
  const docs = await coll()
    .find({}, { projection: { embedding: 1, company: 1, field: 1, text: 1 } })
    .toArray();

  const scored = docs.map((d) => ({
    company: d.company,
    field: d.field,
    text: d.text,
    score: cosine(queryVec, d.embedding),
  }));

  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, k);
}

export async function countChunks() {
  return coll().countDocuments();
}
