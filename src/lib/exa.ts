export const EXA_API_BASE = "https://api.exa.ai";
export const EXA_SEARCH_URL = `${EXA_API_BASE}/search`;

export interface ExaSearchResult {
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  id?: string;
  text?: string;
  summary?: string;
  highlights?: string[];
}

export interface ExaSearchResponse {
  requestId?: string;
  results: ExaSearchResult[];
  costDollars?: {
    total: number;
  };
}

export interface ResearchResult {
  context: string;
  sources: Array<{ title: string; url: string }>;
}

export async function researchCompany(
  apiKey: string,
  pageTitle: string,
  hostname: string,
): Promise<ResearchResult> {
  const companyHint = extractCompanyHint(pageTitle, hostname);
  const query = `${companyHint} company product funding stage size engineering`;

  const response = await fetch(EXA_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      query,
      type: "auto",
      category: "company",
      numResults: 8,
      contents: {
        text: {
          maxCharacters: 3000,
          verbosity: "compact",
        },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text().catch(() => "Unknown error");
    throw new Error(`Exa search failed (${response.status}): ${error}`);
  }

  const data = (await response.json()) as ExaSearchResponse;
  const results = data.results ?? [];

  const seen = new Set<string>();
  const deduped: ExaSearchResult[] = [];
  for (const r of results) {
    const key = r.url?.replace(/\/$/, "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }

  const sections: string[] = [];
  const sources: Array<{ title: string; url: string }> = [];

  for (const result of deduped) {
    sources.push({
      title: result.title ?? safeHostname(result.url),
      url: result.url,
    });

    const text = result.text?.trim();
    if (!text) continue;

    const sep = "─".repeat(60);
    sections.push(
      [sep, `Source: ${result.title}`, `URL: ${result.url}`, text].join("\n"),
    );
  }

  return {
    context:
      sections.length > 0
        ? `\n\nCOMPANY RESEARCH RESULTS\n${sections.join("\n\n")}`
        : "",
    sources,
  };
}

function extractCompanyHint(title: string, hostname: string): string {
  const cleaned = title
    .replace(/\s*[-–—|]\s*.*$/u, "")
    .replace(/^(?:job|career|position)\s+(?:at|@|-)\s+/iu, "")
    .trim();

  if (cleaned && cleaned.length > 1 && cleaned.length < 60) return cleaned;

  return (
    hostname
      .replace(/^www\./iu, "")
      .replace(/\..*$/u, "")
      .replace(/[.-]/gu, " ")
      .trim() || "the company"
  );
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}
