/**
 * LinkedIn section — deterministic and HONEST.
 *
 * We do NOT scrape LinkedIn (against their ToS and blocked). So we never claim
 * a follower count or an exact alumni number. Instead we build the official
 * links and label the numbers as "unavailable", letting the user click through
 * to LinkedIn's own authenticated view.
 */

const THAPAR = "Thapar Institute of Engineering and Technology";
const enc = (s) => encodeURIComponent(String(s || "").trim());

export function buildLinkedIn(companyName) {
  return {
    companyUrl: `https://www.linkedin.com/search/results/companies/?keywords=${enc(companyName)}`,
    followers: null,
    followersConfidence: "unavailable", // we never scrape this
    followersLabel: "Follower count unavailable",

    // Thapar / TIET alumni — a people-search link, not a scraped number.
    alumniCount: null,
    alumniConfidence: "unavailable", // exact | approximate | unavailable
    alumniLabel: "Count unavailable — open LinkedIn people search",
    alumniSearchUrl: `https://www.linkedin.com/search/results/people/?keywords=${enc(
      `${companyName} ${THAPAR}`
    )}&origin=GLOBAL_SEARCH_HEADER`,
  };
}
