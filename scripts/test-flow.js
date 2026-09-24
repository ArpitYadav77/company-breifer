/**
 * Deterministic tests that do NOT need Gmail OAuth or external APIs:
 *  - company extraction from RecruitSage-style subjects
 *  - conservative name normalization
 *  - dedup + "latest 5 unique" + persistence
 * Uses ZZTEST-* names and deletes them afterwards.
 */
import "dotenv/config";
import assert from "node:assert";
import client from "../services/db.js";
import { extractCompany, normalizeCompanyName } from "../services/companyExtractor.js";
import { upsertCompanyDetection, getLatestCompanies, getAllCompanies } from "../services/database.js";

let pass = 0;
const ok = (name) => { console.log("  ✓", name); pass++; };

async function testExtraction() {
  console.log("Extraction & normalization:");
  const a = await extractCompany({ subject: "Recruitment notification for XYZ Technologies", bodyText: "" });
  assert.equal(a.companyName, "XYZ Technologies"); ok('"Recruitment notification for XYZ Technologies" -> XYZ Technologies');

  const b = await extractCompany({ subject: "Microsoft Pvt. Ltd. is hiring", bodyText: "" });
  assert.equal(b.normalizedName, "microsoft"); ok('"Microsoft Pvt. Ltd." normalizes to "microsoft"');

  assert.equal(normalizeCompanyName("Microsoft"), "microsoft");
  assert.equal(normalizeCompanyName("MICROSOFT"), "microsoft");
  assert.equal(normalizeCompanyName("Microsoft Pvt. Ltd."), "microsoft");
  ok("Microsoft / MICROSOFT / Microsoft Pvt. Ltd. all collapse to one id");

  // Entity resolution: geographic / legal variants now collapse to one company.
  assert.equal(normalizeCompanyName("EY"), normalizeCompanyName("EY India (Ernst & Young Services Pvt Ltd)"));
  ok('"EY" and "EY India (Ernst & Young Services Pvt Ltd)" resolve to the same id');
  assert.equal(normalizeCompanyName("Microsoft India"), normalizeCompanyName("Microsoft"));
  ok('"Microsoft India" now resolves to "Microsoft" (geo qualifier stripped)');

  assert.equal(normalizeCompanyName("XYZ Technologies"), "xyz technologies");
  ok('"XYZ Technologies" keeps "technologies" (descriptive word, not a qualifier)');

  const loc = await extractCompany({ subject: "New Job Opportunity: Data Analyst at HighRadius", bodyText: "Location: Hyderabad, India\nCompany: HighRadius" });
  assert.equal(loc.roleLocation, "Hyderabad, India"); ok("role location extracted from email body, separate from company");
}

async function detect(name, tOffsetSec, messageId) {
  return upsertCompanyDetection({
    companyName: name,
    normalizedName: normalizeCompanyName(name),
    roles: ["Software Engineer"],
    messageId,
    receivedAt: new Date(Date.now() + tOffsetSec * 1000),
  });
}

async function testDedup() {
  console.log("Dedup & latest-5:");
  const names = ["ZZTEST A", "ZZTEST B", "ZZTEST C", "ZZTEST D", "ZZTEST E"];
  for (let i = 0; i < names.length; i++) await detect(names[i], i, `m-${i}`);

  const only = (arr) => arr.filter((c) => c.normalizedName.startsWith("zztest")).map((c) => c.companyName);

  let latest = only(await getLatestCompanies(50));
  assert.deepEqual(latest.slice(0, 5), ["ZZTEST E", "ZZTEST D", "ZZTEST C", "ZZTEST B", "ZZTEST A"]);
  ok("5 unique companies, newest first");

  // Duplicate email for same company -> no new card.
  const beforeCount = only(await getAllCompanies()).length;
  const dup = await detect("ZZTEST A", 10, "m-dup");
  assert.equal(dup.isNew, false);
  const afterCount = only(await getAllCompanies()).length;
  assert.equal(beforeCount, afterCount);
  ok("Re-detecting same company creates NO duplicate");

  // Different casing/suffix of same company -> still same card.
  const dup2 = await detect("zztest a", 11, "m-dup2");
  assert.equal(dup2.isNew, false);
  ok('"zztest a" recognized as the same company');

  // New company F arrives. A was just re-detected (offsets 10-11) so it is now
  // recent and stays; B (untouched since offset 1) becomes the oldest and drops.
  await detect("ZZTEST F", 20, "m-f");
  latest = only(await getLatestCompanies(5));
  assert.deepEqual(latest, ["ZZTEST F", "ZZTEST A", "ZZTEST E", "ZZTEST D", "ZZTEST C"]);
  ok("re-detection bumps recency (bug fix); 6th company pushes oldest out of top-5");
  const all = only(await getAllCompanies());
  assert.ok(all.includes("ZZTEST B"));
  ok("Company dropped from top-5 is still retained in historical storage");
}

async function main() {
  try {
    await testExtraction();
    await testDedup();
    console.log(`\nALL ${pass} CHECKS PASSED`);
  } catch (err) {
    console.error("\nTEST FAILED:", err.message);
    process.exitCode = 1;
  } finally {
    // cleanup
    const dbName = process.env.DB_NAME || "company_briefs";
    await client.db(dbName).collection("companies").deleteMany({ normalizedName: /^zztest/ });
    await client.close();
    process.exit(process.exitCode || 0);
  }
}
main();
