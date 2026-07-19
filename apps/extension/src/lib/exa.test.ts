import { afterEach, describe, expect, it, vi } from "vitest";
import type { PageSnapshot } from "../types";
import {
  buildCompanyResearchPlan,
  EXA_CONTENTS_URL,
  EXA_SEARCH_URL,
  researchCompany,
  resolveCompanyIdentity,
  testExaConnection,
} from "./exa";

afterEach(() => {
  vi.unstubAllGlobals();
});

function snapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    title: "Software Engineer",
    url: "https://jobs.ashbyhq.com/acme/role-123",
    hostname: "jobs.ashbyhq.com",
    ats: "Ashby",
    headings: ["Software Engineer", "About Acme"],
    pageText: "Acme builds reliable deployment software for engineering teams.",
    fields: [],
    capturedAt: "2026-07-17T00:00:00.000Z",
    companyHints: {
      structuredNames: ["Acme, Inc."],
      metadataNames: [],
      officialDomains: ["https://www.acme.com"],
    },
    ...overrides,
  };
}

function exaResponse(results: unknown[]): Response {
  return new Response(JSON.stringify({ requestId: "exa-test-1", results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Exa connection probe", () => {
  it("uses the minimal documented Search request and accepts a valid response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(exaResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(testExaConnection("exa-key")).resolves.toEqual({
      requestId: "exa-test-1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      EXA_SEARCH_URL,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-api-key": "exa-key" }),
        body: JSON.stringify({
          query: "Fieldcraft connection test",
          type: "instant",
          numResults: 1,
        }),
      }),
    );
  });

  it("surfaces an Exa API failure instead of reporting a false success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Invalid API key", { status: 401 })),
    );

    await expect(testExaConnection("invalid-key")).rejects.toThrow(
      /Exa connection failed \(401\): Invalid API key/,
    );
  });
});

describe("company identity and query planning", () => {
  it("uses explicit job-page organization data instead of the role title or ATS hostname", () => {
    const identity = resolveCompanyIdentity(snapshot());
    expect(identity).toMatchObject({
      name: "Acme, Inc.",
      officialDomains: ["acme.com"],
    });

    const plan = buildCompanyResearchPlan(snapshot());
    expect(plan).toHaveLength(3);
    expect(plan.map((request) => request.query)).toEqual([
      '"Acme, Inc." official company product mission',
      '"Acme, Inc." funding round investors company',
      '"Acme, Inc." engineering team technology careers company',
    ]);
    expect(plan[0].includeDomains).toEqual(["acme.com"]);
    expect(plan.every((request) => !request.query.includes("Software Engineer"))).toBe(true);
    expect(plan.map((request) => request.type)).toEqual(["fast", "fast", "fast"]);
  });

  it("refuses to search when there is no verified company identity", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const vague = snapshot({
      title: "Software Engineer",
      url: "https://jobs.ashbyhq.com/role-123",
      headings: ["Software Engineer"],
      pageText: "Build reliable software with a collaborative team.",
      companyHints: {
        structuredNames: [],
        metadataNames: [],
        officialDomains: [],
      },
    });

    expect(resolveCompanyIdentity(vague)).toBeNull();
    await expect(researchCompany("exa-key", vague)).resolves.toMatchObject({
      sources: [],
      context: "",
      issue: expect.stringMatching(/skipped external research/i),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts an explicit About heading but never mistakes an ATS brand for the employer", () => {
    expect(resolveCompanyIdentity(snapshot({
      hostname: "jobs.example.net",
      url: "https://jobs.example.net/posting/123",
      companyHints: {
        structuredNames: [],
        metadataNames: [],
        officialDomains: [],
      },
    }))).toMatchObject({ name: "Acme", confidence: 76 });

    expect(resolveCompanyIdentity(snapshot({
      headings: ["Software Engineer"],
      url: "https://jobs.ashbyhq.com/role-123",
      pageText: "Build reliable software with a collaborative team.",
      companyHints: {
        structuredNames: [],
        metadataNames: ["Greenhouse"],
        officialDomains: ["boards.greenhouse.io"],
      },
    }))).toBeNull();
  });
});

describe("company research retrieval", () => {
  it("runs scoped searches, then retrieves only validated result pages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        exaResponse([{ title: "Acme | Official site", url: "https://acme.com/about" }]),
      )
      .mockResolvedValueOnce(
        exaResponse([{ title: "Acme raises Series B", url: "https://news.example/acme-series-b" }]),
      )
      .mockResolvedValueOnce(
        exaResponse([{ title: "Acme Engineering", url: "https://acme.com/engineering" }]),
      )
      .mockResolvedValueOnce(
        exaResponse([
          {
            title: "About Acme",
            url: "https://acme.com/about",
            text: "Acme builds reliable deployment software for engineering teams.",
          },
          {
            title: "Acme raises Series B",
            url: "https://news.example/acme-series-b",
            text: "Acme announced a Series B funding round led by Example Ventures.",
          },
          {
            title: "Acme Engineering",
            url: "https://acme.com/engineering",
            text: "Acme engineers write about its deployment platform and reliability work.",
          },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await researchCompany("exa-key", snapshot());

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.slice(0, 3).map(([url]) => url)).toEqual([
      EXA_SEARCH_URL,
      EXA_SEARCH_URL,
      EXA_SEARCH_URL,
    ]);
    const searchBodies = fetchMock.mock.calls.slice(0, 3).map(([, init]) =>
      JSON.parse((init as RequestInit).body as string),
    );
    expect(searchBodies.map((body) => body.query)).toEqual([
      '"Acme, Inc." official company product mission',
      '"Acme, Inc." funding round investors company',
      '"Acme, Inc." engineering team technology careers company',
    ]);
    expect(searchBodies).not.toContainEqual(expect.objectContaining({ query: expect.stringContaining("Software Engineer") }));

    expect(fetchMock).toHaveBeenLastCalledWith(
      EXA_CONTENTS_URL,
      expect.objectContaining({
        body: JSON.stringify({
          urls: [
            "https://acme.com/about",
            "https://news.example/acme-series-b",
            "https://acme.com/engineering",
          ],
          text: { maxCharacters: 3500, verbosity: "compact" },
          maxAgeHours: 168,
          livecrawlTimeout: 12000,
        }),
      }),
    );
    expect(result.sources.map((source) => source.url)).toEqual([
      "https://acme.com/about",
      "https://news.example/acme-series-b",
      "https://acme.com/engineering",
    ]);
    expect(result.context).toContain("Research target (identified from this job page): Acme, Inc.");
    expect(result.context).toContain("BEGIN UNTRUSTED EXTERNAL SOURCE");
  });

  it("drops a third-party page whose retrieved text does not identify the target company", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        exaResponse([{ title: "Acme funding", url: "https://news.example/acme-funding" }]),
      )
      .mockResolvedValueOnce(exaResponse([]))
      .mockResolvedValueOnce(exaResponse([]))
      .mockResolvedValueOnce(
        exaResponse([
          {
            title: "Acme funding",
            url: "https://news.example/acme-funding",
            text: "A different company closed a funding round this week.",
          },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await researchCompany("exa-key", snapshot({
      companyHints: {
        structuredNames: ["Acme"],
        metadataNames: [],
        officialDomains: [],
      },
    }));

    expect(result.sources).toEqual([]);
    expect(result.issue).toMatch(/none yielded verifiable page content/i);
  });
});
