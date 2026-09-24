import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const dbName = process.env.DB_NAME || "company_briefs";
const COLLECTION = "briefs";
const CACHE_TTL_HOURS = 72;

const client = new MongoClient(uri);

// Connect lazily and reuse the same collection handle across calls.
let collectionPromise = null;
function getCollection() {
  if (!collectionPromise) {
    collectionPromise = (async () => {
      await client.connect();
      const col = client.db(dbName).collection(COLLECTION);
      // Unique index on company_name so saveBrief can upsert cleanly.
      await col.createIndex({ company_name: 1 }, { unique: true });
      return col;
    })();
  }
  return collectionPromise;
}

/**
 * Returns the cached brief for a company, or null if there's no document
 * or the document is older than CACHE_TTL_HOURS.
 */
export async function getCachedBrief(company) {
  const col = await getCollection();
  const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000);

  const doc = await col.findOne({
    company_name: company,
    created_at: { $gte: cutoff },
  });

  return doc ? doc.brief_json : null;
}

/**
 * Upserts a brief for a company, refreshing created_at on update so the
 * cache TTL is measured from the latest generation.
 */
export async function saveBrief(company, briefJson) {
  const col = await getCollection();
  await col.updateOne(
    { company_name: company },
    {
      $set: {
        company_name: company,
        brief_json: briefJson,
        created_at: new Date(),
      },
    },
    { upsert: true }
  );
}

export default client;
