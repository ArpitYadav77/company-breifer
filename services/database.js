/**
 * Data-access layer for the RecruitSage pipeline.
 * Reuses the shared MongoDB client from db.js (no second connection).
 *
 * Collections:
 *   companies       - one doc per UNIQUE company (deduped by normalizedName)
 *   gmail_messages  - processing state per Gmail message (so we never reprocess)
 *   sync_state      - a single doc tracking the last Gmail sync
 *
 * MongoDB persists across restarts, so nothing is lost when the server stops.
 */
import client from "./db.js";

const dbName = process.env.DB_NAME || "company_briefs";
const DASHBOARD_LIMIT = Number(process.env.DASHBOARD_COMPANY_LIMIT || 5);

function db() {
  return client.db(dbName);
}
const companies = () => db().collection("companies");
const gmailMessages = () => db().collection("gmail_messages");
const syncState = () => db().collection("sync_state");

let indexesReady = null;
async function ensureIndexes() {
  if (!indexesReady) {
    indexesReady = (async () => {
      await client.connect();
      await companies().createIndex({ normalizedName: 1 }, { unique: true });
      await companies().createIndex({ lastDetectedAt: -1 });
      // gmail_messages uses messageId as _id, so it's unique by construction.
    })();
  }
  return indexesReady;
}

// ---------- Gmail message processing state ----------

export async function isMessageProcessed(messageId) {
  await ensureIndexes();
  const doc = await gmailMessages().findOne({ _id: messageId });
  return Boolean(doc);
}

export async function recordMessage(msg) {
  await ensureIndexes();
  await gmailMessages().updateOne(
    { _id: msg.messageId },
    {
      $set: {
        _id: msg.messageId,
        threadId: msg.threadId,
        sender: msg.sender,
        subject: msg.subject,
        receivedAt: msg.receivedAt,
        companyId: msg.companyId || null,
        processingStatus: msg.processingStatus, // processed | needs_review | error
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

export async function getNeedsReviewMessages(limit = 20) {
  await ensureIndexes();
  return gmailMessages()
    .find({ processingStatus: "needs_review" })
    .sort({ receivedAt: -1 })
    .limit(limit)
    .toArray();
}

// ---------- Companies ----------

/**
 * Record that a company was detected in a RecruitSage email.
 * Dedupe key is normalizedName. Returns { company, isNew }.
 * Does NOT run research here — caller decides when to research.
 */
export async function upsertCompanyDetection({
  companyName,
  normalizedName,
  roles,
  roleLocation,
  messageId,
  receivedAt,
}) {
  await ensureIndexes();
  const now = new Date();
  const existing = await companies().findOne({ normalizedName });

  if (existing) {
    // Build one merged $set (avoids the duplicate-key bug that dropped fields).
    const set = { lastDetectedAt: receivedAt || now, updatedAt: now };
    if (roles && roles.length) set.lastRoles = roles;
    if (roleLocation) set.lastRoleLocation = roleLocation;
    const addToSet = { gmailMessageIds: messageId };
    // Preserve every original spelling seen as an alias (entity resolution).
    if (companyName && companyName !== existing.companyName) addToSet.aliases = companyName;

    await companies().updateOne({ _id: existing._id }, { $set: set, $addToSet: addToSet });
    return { company: await companies().findOne({ _id: existing._id }), isNew: false };
  }

  const doc = {
    companyName,
    normalizedName,
    aliases: [], // original name variants seen for this company
    lastRoles: roles || [],
    lastRoleLocation: roleLocation || null, // job location from email (≠ company HQ)
    // research fields (filled later)
    research: null,
    researchStatus: "pending", // pending | ok | failed
    researchUpdatedAt: null,
    // detection metadata
    gmailMessageIds: messageId ? [messageId] : [],
    firstDetectedAt: receivedAt || now,
    lastDetectedAt: receivedAt || now,
    // notification state (persisted so we never double-notify, even after restart)
    telegramNotified: false,
    telegramNotifiedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await companies().insertOne(doc);
  return { company: { _id: insertedId, ...doc }, isNew: true };
}

export async function saveResearch(companyId, research, status = "ok") {
  await ensureIndexes();
  await companies().updateOne(
    { _id: companyId },
    {
      $set: {
        research,
        researchStatus: status,
        researchUpdatedAt: new Date(),
        updatedAt: new Date(),
      },
    }
  );
}

/** Persistently mark that a Telegram notification has been sent for a company. */
export async function markTelegramNotified(companyId) {
  await ensureIndexes();
  await companies().updateOne(
    { _id: companyId },
    { $set: { telegramNotified: true, telegramNotifiedAt: new Date(), updatedAt: new Date() } }
  );
}

export async function getLatestCompanies(limit = DASHBOARD_LIMIT) {
  await ensureIndexes();
  return companies().find({}).sort({ lastDetectedAt: -1 }).limit(limit).toArray();
}

export async function getAllCompanies() {
  await ensureIndexes();
  return companies().find({}).sort({ lastDetectedAt: -1 }).toArray();
}

export async function getCompanyById(id) {
  await ensureIndexes();
  const { ObjectId } = await import("mongodb");
  const _id = typeof id === "string" ? new ObjectId(id) : id;
  return companies().findOne({ _id });
}

// ---------- Sync state ----------

export async function getSyncState() {
  await ensureIndexes();
  return (await syncState().findOne({ _id: "gmail" })) || null;
}

export async function setSyncState(patch) {
  await ensureIndexes();
  await syncState().updateOne(
    { _id: "gmail" },
    { $set: { _id: "gmail", ...patch, updatedAt: new Date() } },
    { upsert: true }
  );
}
