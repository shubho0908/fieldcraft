import type { JobAnalysis } from "../types";
import { resolveCompanyIdentity, type CompanyIdentitySnapshot } from "./exa";
import { normalizeSourceUrl } from "./source-url";

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
  snapshot: CompanyIdentitySnapshot,
  retrievedSources: CompanyFactSource[] = [],
): { company: JobAnalysis["company"]; droppedFacts: string[] } {
  const company = { ...input, sources: [] as JobAnalysis["company"]["sources"] };
  const droppedFacts: string[] = [];
  const usedSources = new Map<string, CompanyFactSource>();
  // Only captured identity signals are eligible; model-generated job/company
  // names must never authorize attribution of another organization's numbers.
  const identity = resolveCompanyIdentity(snapshot);
  const aliases = identity?.aliases ?? [];
  const citedUrls = new Set(input.sources.map((source) => normalizeSourceUrl(source.url)).filter(Boolean));
  const evidence = retrievedSources.filter((source) =>
    normalizeSourceUrl(source.url) !== normalizeSourceUrl(snapshot.url) &&
    citedUrls.has(normalizeSourceUrl(source.url)) &&
    Boolean(normalizeSourceUrl(source.url)),
  );

  const grounded = (value: string, field: CompanyFactField): boolean => {
    if (isUnknownCompanyFact(value)) return false;
    const assertions = splitAssertions(value);
    const supportingSources = new Map<string, CompanyFactSource>();
    for (const assertion of assertions) {
      if (containsFact(snapshot.pageText, assertion, field, aliases, true)) continue;
      const supporting = evidence.filter((source) => containsFact(
        source.text, assertion, field, aliases,
        isEmployerSource(source.url, snapshot.url, identity?.officialDomains ?? []),
      ));
      if (!supporting.length) return false;
      for (const source of supporting) supportingSources.set(normalizeSourceUrl(source.url), source);
    }
    if (!assertions.length) return false;
    // Commit citations only after every assertion in this fact passes.
    for (const [url, source] of supportingSources) usedSources.set(url, source);
    return true;
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

function splitAssertions(text: string): string[] {
  return text.split(/(?:[.!?](?:\s|$)|[\r\n]+)/u).map((part) => part.trim()).filter(Boolean);
}

function normalizeFact(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/[^\p{L}\p{N}$€£%.,]+/gu, " ")
    .replace(/(?<!\d)[.,]|[.,](?!\d)/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function containsFact(
  text: string,
  fact: string,
  field: CompanyFactField,
  aliases: string[],
  allowFirstPerson: boolean,
): boolean {
  const needle = normalizeFact(fact);
  if (!needle) return false;
  const numericField = ["funding", "size", "stage"].includes(field);
  const sentences = splitAssertions(text).filter((sentence) =>
    !/\b(?:not|never|no|without|previously|formerly|worked at|experience at|such as)\b/iu.test(sentence) &&
    !(numericField && /\b(?:experience|worked (?:at|with|for)|previous|prior|clients?|customers?|partners?|portfolio)\b/iu.test(sentence)),
  );
  const clauses = numericField
    ? sentences.flatMap((sentence) => sentence.split(/;|,\s+(?=[\p{L}])|\b(?:and|but|while|whereas)\b/iu))
    : sentences;
  return clauses.some((sentence) => {
    const normalized = ` ${normalizeFact(sentence)} `;
    const index = normalized.indexOf(` ${needle} `);
    if (index < 0) return false;
    const before = normalized.slice(0, index + 1);
    const after = normalized.slice(index + needle.length + 1);
    return (!numericField || hasEmployerSubject(sentence, fact, field, aliases, allowFirstPerson)) &&
      hasFactContext(field, needle, before, after);
  });
}

/**
 * Deliberately narrow lexical attribution for numbers/stages, not a semantic
 * verifier. Ambiguous subjects are omitted instead of borrowing another
 * organization's assertion merely because the amount occurs nearby.
 */
function hasEmployerSubject(
  sentence: string,
  fact: string,
  field: CompanyFactField,
  aliases: string[],
  allowFirstPerson: boolean,
): boolean {
  const normalizeSubject = (value: string) => normalizeFact(value)
    .replace(/\b(?:incorporated|inc|llc|ltd|limited|corp|corporation|gmbh|plc)\b/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  const clause = normalizeSubject(sentence);
  const subjects = aliases.map(normalizeSubject).filter(Boolean).sort((a, b) => b.length - a.length);
  if (allowFirstPerson) subjects.push("we", "our company", "our team size", "our team", "our headcount", "our workforce", "our funding");
  const subject = subjects.find((name) => clause.startsWith(`${name} `));
  if (!subject) return false;
  const predicate = clause.slice(subject.length + 1).replace(/^s /u, "");
  const assertedValue = field === "stage"
    ? predicate.match(/\b(?:series [a-z][0-9]?|pre seed|seed|bootstrapped|public|publicly listed|pre ipo|post ipo|early|growth|late|venture backed)\b/u)
    : predicate.match(/\d/u);
  const needle = normalizeSubject(fact);
  const factStart = clause.indexOf(needle);
  const valueStart = assertedValue?.index === undefined ? -1 : clause.length - predicate.length + assertedValue.index;
  // The matched fact must contain this subject's own asserted value, not a
  // later amount about somebody else in the same clause.
  if (factStart < 0 || valueStart < factStart || valueStart >= factStart + needle.length) return false;
  const amount = "(?:(?:a|an|total|of|over|around|approximately|about|nearly|more|than|at|least|up|to) )*[$€£]?\\d";
  if (field === "funding") {
    return new RegExp(`^(?:(?:has|have) )?(?:raised|raises|secured|secures|received|closed|closes) ${amount}`, "u").test(predicate)
      || (subject === "our funding" && new RegExp(`^(?:is|of|totals?) ${amount}`, "u").test(predicate));
  }
  if (field === "size") {
    return new RegExp(`^(?:has|have|employs?|includes?|is|of|stands at) (?:a team of )?${amount}`, "u").test(predicate);
  }
  return /^(?:is|are|closed|raised) (?:a |an |the |currently )*(?:series [a-z][0-9]?|pre seed|seed|bootstrapped|public|publicly listed|pre ipo|post ipo|early|growth|late|venture backed)\b/u.test(predicate);
}

function isEmployerSource(sourceUrl: string, pageUrl: string, officialDomains: string[]): boolean {
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./u, "");
    const pageHost = new URL(pageUrl).hostname.replace(/^www\./u, "");
    return host === pageHost || officialDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
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
