import type { JobAnalysis, PageSnapshot } from "../types";

export interface CompanyFactSource {
  title: string;
  url: string;
  text: string;
}

type CompanyFactField = Exclude<keyof JobAnalysis["company"], "sources">;

export function isUnknownCompanyFact(value: string | undefined): boolean {
  const normalized = (value ?? "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return !normalized || /^(?:unknown(?: company| product| stage| size| funding)?|n a|na|none|null|nil|tbd|to be determined|unclear|undisclosed|unspecified|unavailable|unverified|not (?:publicly )?(?:known|disclosed|specified|available|provided|stated|mentioned|found|applicable|reported|confirmed|determined|shared)|not enough information|no (?:public )?(?:information|data|details)(?: available| found| disclosed)?)$/u.test(normalized);
}

export function groundCompanyFacts(
  input: JobAnalysis["company"],
  snapshot: Pick<PageSnapshot, "pageText" | "url">,
  retrievedSources: CompanyFactSource[] = [],
): { company: JobAnalysis["company"]; droppedFacts: string[] } {
  const company = { ...input, sources: [] as JobAnalysis["company"]["sources"] };
  const droppedFacts: string[] = [];
  const usedSources = new Map<string, CompanyFactSource>();
  const citedUrls = new Set(input.sources.map((source) => normalizeSourceUrl(source.url)).filter(Boolean));
  const evidence = retrievedSources.filter((source) =>
    normalizeSourceUrl(source.url) !== normalizeSourceUrl(snapshot.url) &&
    citedUrls.has(normalizeSourceUrl(source.url)) &&
    Boolean(normalizeSourceUrl(source.url)),
  );

  const grounded = (value: string, field: CompanyFactField): boolean => {
    if (isUnknownCompanyFact(value)) return false;
    if (containsFact(snapshot.pageText, value, field)) return true;
    const supporting = evidence.filter((source) => containsFact(source.text, value, field));
    for (const source of supporting) usedSources.set(normalizeSourceUrl(source.url), source);
    return supporting.length > 0;
  };

  for (const key of ["summary", "product", "stage", "size", "funding"] as const) {
    const value = typeof input[key] === "string" ? input[key].trim() : "";
    if (grounded(value, key)) {
      company[key] = value;
    } else {
      company[key] = "Unknown";
      if (!isUnknownCompanyFact(value)) droppedFacts.push(key);
    }
  }
  for (const key of ["engineeringSignals", "risks"] as const) {
    company[key] = input[key].filter((value) => {
      if (grounded(value, key)) return true;
      if (!isUnknownCompanyFact(value)) droppedFacts.push(key);
      return false;
    });
  }
  company.sources = [...usedSources.values()].map(({ title, url }) => ({ title, url }));
  return { company, droppedFacts: [...new Set(droppedFacts)] };
}

function containsFact(text: string, fact: string, field: CompanyFactField): boolean {
  const normalize = (value: string) => value
    .toLocaleLowerCase()
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/[^\p{L}\p{N}$€£%.,]+/gu, " ")
    .replace(/(?<!\d)[.,]|[.,](?!\d)/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const needle = normalize(fact);
  if (!needle) return false;
  const numericField = ["funding", "size", "stage"].includes(field);
  const sentences = text.split(/(?:[.!?](?:\s|$)|[\r\n]+)/u).filter((sentence) =>
    !/\b(?:not|never|no|without|previously|formerly|worked at|experience at|such as)\b/iu.test(sentence) &&
    !(numericField && /\b(?:experience|worked (?:at|with|for)|previous|prior|clients?|customers?|partners?|portfolio)\b/iu.test(sentence)),
  );
  const clauses = numericField
    ? sentences.flatMap((sentence) => sentence.split(/;|,\s+(?=[\p{L}])|\b(?:and|but|while|whereas)\b/iu))
    : sentences;
  return clauses.some((sentence) => {
    const normalized = ` ${normalize(sentence)} `;
    const index = normalized.indexOf(` ${needle} `);
    if (index < 0) return false;
    const before = normalized.slice(0, index + 1);
    const after = normalized.slice(index + needle.length + 1);
    return hasFactContext(field, needle, before, after);
  });
}

function hasFactContext(field: CompanyFactField, fact: string, before: string, after: string): boolean {
  if (!["funding", "size", "stage"].includes(field)) return true;
  const clause = `${before}${fact}${after}`;
  if (field === "funding") {
    if (/\b(?:salary|compensation|pay|wages?|bonus|revenue|valuation|sales)\b/u.test(clause)) return false;
    return /\b(?:rais(?:ed|es|ing)|secur(?:ed|es)|received|closed|closes|funding(?: round)?(?: of| totaling| totals| is)?|investment(?: of)?|capital(?: of)?|financing(?: of)?) (?:a |an |total of |over |around |approximately |about |nearly |more than |at least |up to )*$/u.test(before)
      || /^(?: (?:in|of))? (?:total )?(?:funding|investment|capital|venture funding|financing|venture capital|equity financing|seed funding|series [a-z] funding)(?: |$)/u.test(after)
      || /\b(?:raised|funding|investment|financing)\b/u.test(fact);
  }

  if (field === "size") {
    if (/^ ?%|^ (?:percent|per cent|percentage)\b/u.test(after) || /[$€£%]/u.test(fact)) return false;
    return /\b(?:team|headcount|team size|workforce)(?: of| is| has| includes| stands at)? $/u.test(before)
      || /^ (?:full time |part time )?(?:employees?|people|team members?|staff|engineers?|workers?)(?: |$)/u.test(after)
      || /\b(?:employees?|people|team members?|staff|headcount|workforce)\b/u.test(fact);
  }

  if (!/\b(?:series [a-z][0-9]?|pre seed|seed|bootstrapped|public|publicly listed|pre ipo|post ipo|early|growth|late|venture backed)\b/u.test(fact)) return false;
  if (/\binvest(?:s|ing)? in\b/u.test(clause)) return false;
  return /\b(?:is|are|stage(?: is)?|round(?: is)?|funding(?: round)?(?: is)?|closed(?: a)?|raised(?: a)?) (?:a |an |the |currently )*$/u.test(before)
    || /^ (?:startup|company|business|stage|round|funding)(?: |$)/u.test(after)
    || /\b(?:company|startup|stage|funding|round)\b/u.test(fact);
}

function normalizeSourceUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!/^https?:$/u.test(url.protocol)) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid$|gclid$|ref$)/iu.test(key)) url.searchParams.delete(key);
    }
    return url.href.replace(/\/$/u, "");
  } catch {
    return "";
  }
}
