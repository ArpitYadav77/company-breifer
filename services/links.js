/**
 * Builds clickable research links for a company.
 *
 * WHY LINKS (not scraped numbers): LinkedIn has no public API for follower counts
 * or "alumni at company", and scraping it breaks their terms and is blocked. So
 * instead of faking a number, we generate deep-links that open LinkedIn's own
 * pre-filtered views — the user clicks and LinkedIn shows the live count itself.
 */

const THAPAR = "Thapar Institute of Engineering and Technology";

const enc = (s) => encodeURIComponent(String(s || "").trim());

/**
 * Returns { linkedinCompany, thaparAlumni, glassdoor } URLs for a company.
 */
export function buildResearchLinks(company) {
  return {
    // LinkedIn company search — lands on the company page (followers shown there).
    linkedinCompany: `https://www.linkedin.com/search/results/companies/?keywords=${enc(company)}`,

    // LinkedIn PEOPLE search pre-filtered to people linked to BOTH this company
    // and Thapar/TIET. The result count ≈ Thapar alumni who work / worked there.
    thaparAlumni: `https://www.linkedin.com/search/results/people/?keywords=${enc(
      `${company} ${THAPAR}`
    )}&origin=GLOBAL_SEARCH_HEADER`,

    // Glassdoor reviews search for the company.
    glassdoor: `https://www.glassdoor.com/Search/results.htm?keyword=${enc(company)}`,
  };
}
