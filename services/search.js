import axios from "axios";

const SERPER_ENDPOINT = "https://google.serper.dev/search";

/**
 * Runs a single Serper.dev search and returns a compact, LLM-friendly string
 * built from the organic results (title, snippet, link).
 */
async function serperSearch(query) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error("SERPER_API_KEY is not set. Add it to your .env file.");
  }

  const { data } = await axios.post(
    SERPER_ENDPOINT,
    { q: query },
    {
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );

  const organic = Array.isArray(data?.organic) ? data.organic : [];
  if (organic.length === 0) {
    return `No results found for: ${query}`;
  }

  return organic
    .slice(0, 8)
    .map((r, i) => {
      const title = r.title || "(no title)";
      const snippet = r.snippet || "";
      const link = r.link || "";
      const date = r.date ? ` [${r.date}]` : "";
      return `${i + 1}. ${title}${date}\n   ${snippet}\n   ${link}`;
    })
    .join("\n\n");
}

/**
 * Gathers raw web data for a company across four dimensions.
 * Returns { news, interview, salary, culture } as strings.
 */
export async function gatherCompanyData(company) {
  // TODO: Refine these query strings once you've tested real output.
  //       e.g. add region ("<company> India"), tune date scoping,
  //       or add extra site: filters (levels.fyi, teamblind.com, etc.).
  const queries = {
    news: `${company} news 2026`,
    interview: `site:glassdoor.com ${company} interview experience`,
    salary: `site:ambitionbox.com ${company} salary reviews`,
    culture: `${company} employee reviews culture`,
    // Feeds headquarters + 5-year growth trajectory.
    overview: `${company} headquarters revenue employees growth last 5 years`,
  };

  const [news, interview, salary, culture, overview] = await Promise.all([
    serperSearch(queries.news),
    serperSearch(queries.interview),
    serperSearch(queries.salary),
    serperSearch(queries.culture),
    serperSearch(queries.overview),
  ]);

  return { news, interview, salary, culture, overview };
}
