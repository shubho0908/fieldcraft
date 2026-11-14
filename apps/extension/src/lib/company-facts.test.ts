import { afterEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import type { JobAnalysis, PageSnapshot } from "../types";
import { isUnknownFact } from "./fit";
import { runJobAnalysis, sanitizeAnalysis } from "./openai";
import { FitVerdict } from "./enums";
import { groundCompanyFacts, isUnknownCompanyFact } from "./company-facts";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from "./defaults";
import { EXA_CONTENTS_URL } from "./exa";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  jsonSchema: (schema: unknown) => schema,
  Output: { object: (config: { schema: unknown }) => config.schema },
}));

vi.mock("./ai-provider", () => ({
  createAiModel: vi.fn(() => ({ id: "mock-model" })),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const snapshot: PageSnapshot = {
  title: "Software Engineer at Acme",
  url: "https://acme.example/jobs/1",
  hostname: "acme.example",
  ats: "Generic",
  headings: ["About Acme"],
  pageText: "Acme builds deployment software. Join our engineering team.",
  fields: [],
  capturedAt: "2026-11-14T00:00:00Z",
};

function company(overrides: Partial<JobAnalysis["company"]> = {}): JobAnalysis["company"] {
  return {
    summary: "Acme builds deployment software.",
    product: "deployment software",
    stage: "Series C",
    size: "500 employees",
    funding: "$100 million",
    engineeringSignals: [],
    risks: [],
    sources: [],
    ...overrides,
  };
}

function analysis(): Omit<JobAnalysis, "generatedAt" | "research"> {
  return {
    job: { company: "Acme", role: "Software Engineer", location: "", employmentType: "", seniority: "", summary: "", requirements: [], responsibilities: [], keywords: [], compensation: "", remotePolicy: "" },
    fit: { score: 80, verdict: FitVerdict.Strong, strongestMatches: [], gaps: [], hardBlockers: [], recommendation: "" },
    company: company(),
    suggestions: [],
    missingFacts: [],
  };
}

describe("unknown company facts", () => {
  it.each(["Not disclosed", "Not specified", "Unclear", "Not available", "Undisclosed", "No public information", "N / A", "—", "Unknown.", "Unknown company", "Not publicly shared", "Not reported", "Not confirmed", "To be determined"])("does not count %s as a concrete fact", (value) => {
    expect(isUnknownCompanyFact(value)).toBe(true);
    expect(isUnknownFact(value)).toBe(true);
  });

  it.each(["Series A", "Notion", "100 employees", "$20 million", "No-code deployment tools"])("keeps concrete fact %s", (value) => {
    expect(isUnknownCompanyFact(value)).toBe(false);
  });
});

describe("company fact evidence", () => {
  it("retains a verbatim multi-sentence summary only when every assertion is supported", () => {
    const summary = "Acme builds deployment software. It serves engineering teams.";
    expect(groundCompanyFacts(company({ summary }), { ...snapshot, pageText: summary }).company.summary).toBe(summary);
    expect(groundCompanyFacts(company({ summary }), snapshot).company.summary).toBe("Unknown");
  });

  it("collects citations across constituent assertions without retaining sources for rejected facts", () => {
    const first = { title: "Product", url: "https://acme.example/product", text: "Acme builds deployment software." };
    const second = { title: "Customers", url: "https://acme.example/customers", text: "It serves engineering teams." };
    const summary = `${first.text} ${second.text}`;
    const input = company({ summary, product: "Unknown", stage: "Unknown", size: "Unknown", funding: "Unknown", sources: [first, second] });
    const result = groundCompanyFacts(input, { ...snapshot, pageText: "" }, [first, second]);
    expect(result.company.summary).toBe(summary);
    expect(result.company.sources).toEqual([first, second].map(({ title, url }) => ({ title, url })));
    const rejected = groundCompanyFacts({ ...input, summary: `${summary} It operates hospitals.` }, { ...snapshot, pageText: "" }, [first, second]);
    expect(rejected.company.summary).toBe("Unknown");
    expect(rejected.company.sources).toEqual([]);
  });

  it.each([
    ["funding", "$180k", "Salary $180k."],
    ["funding", "$180k", "We raised $20 million in funding and offer a salary of $180k."],
    ["funding", "$100", "Acme raised $100.5 million."],
    ["funding", "$100", "Acme raised $100,000 in seed funding."],
    ["size", "50", "We offer 50% remote work."],
    ["size", "50", "We offer 50 percent remote work."],
    ["size", "50", "Our team has 50.5 employees on a full-time-equivalent basis."],
    ["size", "50", "Our team of 100 employees works 50% remote."],
    ["size", "50", "We support 50 million users."],
    ["stage", "Growth", "Career growth is encouraged."],
    ["stage", "Series C", "We partner with Series C startups."],
  ] as const)("requires field-aware numeric or stage context for %s: %s", (key, value, pageText) => {
    expect(groundCompanyFacts(company({ [key]: value }), { ...snapshot, pageText }).company[key]).toBe("Unknown");
  });

  it("accepts numeric facts only with funding, headcount and stage assertion context", () => {
    const result = groundCompanyFacts(company({ funding: "$20 million", size: "50", stage: "Series B" }), {
      ...snapshot,
      pageText: "We raised $20 million in funding. Our team has 50 employees. We are a Series B company.",
    });
    expect(result.company).toMatchObject({ funding: "$20 million", size: "50", stage: "Series B" });
  });

  it("keeps page claims and drops ungrounded strings and signals", () => {
    const result = groundCompanyFacts(company({ engineeringSignals: ["Rust infrastructure"], risks: ["Frequent layoffs"] }), snapshot);
    expect(result.company).toMatchObject({ summary: "Acme builds deployment software.", product: "deployment software", funding: "Unknown", stage: "Unknown", size: "Unknown", engineeringSignals: [], risks: [], sources: [] });
    expect(result.droppedFacts).toEqual(["stage", "size", "funding", "engineeringSignals", "risks"]);
  });

  it("keeps only facts supported by a cited and retrieved source", () => {
    const source = { title: "Acme funding", url: "https://news.example/acme", text: "Acme raised $100 million. Acme is a Series C startup. Acme has 500 employees." };
    const result = groundCompanyFacts(company({ sources: [{ title: "Invented citation title", url: `${source.url}?utm_source=model` }] }), snapshot, [source]);
    expect(result.company).toMatchObject({ funding: "$100 million", stage: "Series C", size: "500 employees", sources: [{ title: source.title, url: source.url }] });
    expect(result.droppedFacts).toEqual([]);
  });

  it("does not treat unrelated citations or uncited sources as evidence", () => {
    const result = groundCompanyFacts(company({ sources: [{ title: "Unrelated", url: "https://news.example/unrelated" }] }), snapshot, [
      { title: "Unrelated", url: "https://news.example/unrelated", text: "Acme builds deployment software." },
      { title: "Not cited", url: "https://news.example/acme-funding", text: "Acme raised $100 million." },
    ]);
    expect(result.company.funding).toBe("Unknown");
    expect(result.company.sources).toEqual([]);
  });

  it.each([
    "Acme has not raised $100 million.",
    "You have previously worked at Series C startups with 500 employees and $100 million in funding.",
    "Acme raised $100 million0.",
  ])("does not turn negations, prior employers or numeric substrings into evidence: %s", (pageText) => {
    const result = groundCompanyFacts(company(), { ...snapshot, pageText });
    expect(result.company.funding).toBe("Unknown");
  });

  it("normalizes unknown placeholders without reporting them as invented facts", () => {
    const result = groundCompanyFacts(company({ stage: "Not disclosed", funding: "Unclear", size: "Not specified" }), snapshot);
    expect(result.company).toMatchObject({ stage: "Unknown", funding: "Unknown", size: "Unknown" });
    expect(result.droppedFacts).toEqual([]);
  });
});

describe("company fact grounding through the analysis sanitizer", () => {
  it.each([
    ["https://news.example/Acme", "https://news.example/acme"],
    ["https://news.example/about?id=Acme", "https://news.example/about?id=acme"],
  ])("does not equate case-sensitive citation resources: %s", (retrievedUrl, requestedUrl) => {
    const parsed = analysis();
    const source = { title: "Acme funding", url: retrievedUrl, text: "Acme raised $100 million." };
    parsed.company.sources = [{ title: "Requested source", url: requestedUrl }];
    const result = sanitizeAnalysis(parsed, snapshot, [source], true, undefined, { companySources: [source] });
    expect(result.company.sources).toEqual([]);
    expect(result.company.funding).toBe("Unknown");
  });

  it("retains distinct retrieved resources while normalizing citation tracking", () => {
    const sources = [
      { title: "Acme funding", url: "https://news.example/Acme", text: "Acme raised $100 million." },
      { title: "Acme headcount", url: "https://news.example/acme", text: "Acme has 500 employees." },
    ];
    const parsed = analysis();
    parsed.company.sources = sources.map((source) => ({ title: source.title, url: `${source.url}?utm_source=review#facts` }));
    const result = sanitizeAnalysis(parsed, snapshot, sources, true, undefined, { companySources: sources });
    expect(result.company).toMatchObject({
      funding: "$100 million", size: "500 employees",
      sources: expect.arrayContaining(sources.map(({ title, url }) => ({ title, url }))),
    });
    expect(result.company.sources).toHaveLength(2);
  });

  it.each([
    "Our competitor Beta raised $100 million. Beta has 500 employees. Beta is a Series C startup.",
    "Beta raised $100 million. Beta has 500 employees. Beta is a Series C startup.",
    "Acme reports that Beta raised $100 million. Acme reports that Beta has 500 employees. Acme reports that Beta is a Series C startup.",
    "Acme raised $20 million after Beta raised $100 million. Acme has 50 employees compared with Beta's 500 employees. Acme is a Series A startup, unlike Beta, a Series C startup.",
  ])("rejects another employer's facts despite an invented model employer: %s", (pageText) => {
    const parsed = analysis();
    parsed.job.company = "Beta";
    const result = sanitizeAnalysis(parsed, {
      ...snapshot, pageText,
      companyHints: { structuredNames: ["Acme"], metadataNames: [], officialDomains: ["acme.example"] },
    }, [], false);
    expect(result.company).toMatchObject({ funding: "Unknown", size: "Unknown", stage: "Unknown" });
    expect(result.research.issue).toMatch(/omitted.*stage.*size.*funding/i);
  });

  it.each([
    { title: "Software Engineer at Acme", url: "https://acme.example/jobs/1", hostname: "acme.example" },
    { title: "Software Engineer", url: "https://jobs.ashbyhq.com/acme/job", hostname: "jobs.ashbyhq.com" },
  ])("keeps named employer facts using captured identity: $url", (identity) => {
    const result = sanitizeAnalysis(analysis(), {
      ...snapshot, ...identity, headings: [],
      pageText: "Acme raised $100 million. Acme has 500 employees. Acme is a Series C startup.",
    }, [], false);
    expect(result.company).toMatchObject({ funding: "$100 million", size: "500 employees", stage: "Series C" });
  });

  it("does not transfer a cited source's unrelated company facts to the employer", () => {
    const parsed = analysis();
    const source = { title: "Acme industry news", url: "https://news.example/acme", text: "Acme builds deployment software. Beta raised $100 million. Beta has 500 employees. Beta is a Series C startup." };
    parsed.company.sources = [source];
    const result = sanitizeAnalysis(parsed, snapshot, [source], true, undefined, { companySources: [source] });
    expect(result.company).toMatchObject({ funding: "Unknown", size: "Unknown", stage: "Unknown", sources: [] });
  });

  it("drops invented funding, size and stage even when research is disabled", () => {
    const result = sanitizeAnalysis(analysis(), snapshot, [], false);
    expect(result.company.product).toBe("deployment software");
    expect(result.company.funding).toBe("Unknown");
    expect(result.company.stage).toBe("Unknown");
    expect(result.company.size).toBe("Unknown");
  });

  it("does not treat a citation alone as proof of every company fact", () => {
    const parsed = analysis();
    parsed.company.sources = [{ title: "Acme", url: "https://acme.example/about" }];
    const result = sanitizeAnalysis(parsed, snapshot, parsed.company.sources, true);
    expect(result.company.funding).toBe("Unknown");
  });
});

describe("company facts through the real analysis entry point", () => {
  it("does not confuse salary and remote percentages with funding and headcount", async () => {
    const parsed = analysis();
    parsed.company = company({ funding: "$180k", size: "50", stage: "Growth" });
    vi.mocked(generateText).mockResolvedValueOnce({ output: parsed, finishReason: "stop" } as never);
    const result = await runJobAnalysis({
      ...snapshot,
      pageText: "Salary $180k. Our team works 50% remote. Career growth is encouraged.",
    }, DEFAULT_PROFILE, { ...DEFAULT_SETTINGS, researchCompany: false }, { apiKey: "test-only", installId: "test" });
    expect(result.company).toMatchObject({ funding: "Unknown", size: "Unknown", stage: "Unknown" });
  });

  it("drops invented facts with research off and does not call a network service", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(generateText).mockResolvedValueOnce({ output: analysis(), finishReason: "stop" } as never);
    const result = await runJobAnalysis(snapshot, DEFAULT_PROFILE, { ...DEFAULT_SETTINGS, researchCompany: false }, { apiKey: "test-only", installId: "test" });
    expect(result.company).toMatchObject({ product: "deployment software", stage: "Unknown", funding: "Unknown", size: "Unknown" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses retrieved content, not just source URLs, to retain company facts", async () => {
    const source = { title: "Acme funding", url: "https://acme.example/about" };
    const fetchMock = vi.fn().mockImplementation((url) => Promise.resolve(new Response(JSON.stringify({
      results: [{ ...source, ...(url === EXA_CONTENTS_URL ? { text: "Acme raised $100 million. Acme is a Series C startup." } : {}) }],
    }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    const parsed = analysis();
    parsed.company.sources = [source];
    vi.mocked(generateText).mockResolvedValueOnce({ output: parsed, finishReason: "stop" } as never);
    const result = await runJobAnalysis({
      ...snapshot,
      companyHints: { structuredNames: ["Acme"], metadataNames: [], officialDomains: ["acme.example"] },
    }, DEFAULT_PROFILE, { ...DEFAULT_SETTINGS, researchCompany: true }, { apiKey: "test-only", exaApiKey: "test-only", installId: "test" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.company).toMatchObject({ funding: "$100 million", stage: "Series C", size: "Unknown", sources: [source] });
  });
});
