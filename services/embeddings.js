import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const EMBED_MODEL = "gemini-embedding-001";
// 768 dims: smaller/cheaper than the 3072 default, plenty for a few hundred chunks.
export const EMBED_DIMS = 768;

/**
 * Embed a batch of texts as DOCUMENTS (for storing in the vector DB).
 * Returns an array of number[] vectors aligned to the input order.
 */
export async function embedDocuments(texts) {
  return embedBatch(texts, "RETRIEVAL_DOCUMENT");
}

/**
 * Embed a single natural-language QUERY (for searching the vector DB).
 */
export async function embedQuery(text) {
  const [vec] = await embedBatch([text], "RETRIEVAL_QUERY");
  return vec;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Parse Google's suggested retry delay (e.g. "40.08s") from a 429 error,
 * falling back to a default. Returns milliseconds.
 */
function retryDelayMs(err, fallbackMs) {
  const m = String(err?.message || "").match(/retry in ([\d.]+)s/i);
  if (m) return Math.ceil(parseFloat(m[1]) * 1000) + 1000; // small buffer
  return fallbackMs;
}

async function embedBatch(texts, taskType) {
  const out = [];
  // The free tier counts each text as one request (100/min), so batch small
  // and retry on 429 rather than trying to squeeze it all into one call.
  for (let i = 0; i < texts.length; i += 20) {
    const slice = texts.slice(i, i + 20);

    let attempt = 0;
    for (;;) {
      try {
        const res = await ai.models.embedContent({
          model: EMBED_MODEL,
          contents: slice,
          config: { outputDimensionality: EMBED_DIMS, taskType },
        });
        for (const e of res.embeddings) out.push(e.values);
        break;
      } catch (err) {
        if (err?.status === 429 && attempt < 5) {
          const wait = retryDelayMs(err, 45000);
          console.warn(
            `Embedding rate-limited; waiting ${Math.round(wait / 1000)}s then retrying...`
          );
          await sleep(wait);
          attempt++;
          continue;
        }
        throw err;
      }
    }
  }
  return out;
}
