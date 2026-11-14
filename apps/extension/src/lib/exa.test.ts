import { afterEach, describe, expect, it, vi } from "vitest";
import type { PageSnapshot } from "../types";
import {
  buildCompanyResearchPlan,
  EXA_CONTENTS_URL,
  EXA_SEARCH_URL,
  matchesCompanyIdentity,
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
  it.each([
    "Ideally you have worked at Stripe, Adyen or another payments company.",
    "You bring experience at Stripe, Adyen or PayPal.",
    "Candidates previously at Stripe, Adyen are welcome.",
    "Experience with companies such as Stripe, Adyen is a plus.",
    "Join Stripe, you will build payments software.",
  ])("does not choose an uncorroborated company from prose: %s", (pageText) => {
    const identity = resolveCompanyIdentity(snapshot({
      url: "https://careers.acmeflow.io/jobs/123",
      hostname: "careers.acmeflow.io",
      headings: ["Software Engineer"],
      companyHints: undefined,
      pageText,
    }));
    expect(identity?.name.toLowerCase() ?? null).not.toBe("stripe");
    expect([null, "acmeflow"]).toContain(identity?.name.toLowerCase() ?? null);
  });

  it("requires an identity anchor even when a title and prose agree", () => {
    expect(resolveCompanyIdentity(snapshot({
      title: "Software Engineer at Stripe",
      url: "https://boards.greenhouse.io/role-123",
      hostname: "boards.greenhouse.io",
      headings: ["Software Engineer"],
      companyHints: undefined,
      pageText: "Come join Stripe, you will build payments software.",
    }))).toBeNull();
  });

  it("does not accept an About heading without an agreeing identity anchor", () => {
    expect(resolveCompanyIdentity(snapshot({
      hostname: "jobs.example.net",
      url: "https://jobs.example.net/posting/123",
      companyHints: undefined,
    }))).toBeNull();
  });

  it("allows a prose mention to corroborate a matching company host", () => {
    expect(resolveCompanyIdentity(snapshot({
      hostname: "careers.acmeflow.io",
      url: "https://careers.acmeflow.io/jobs/123",
      headings: [],
      pageText: "Here at Acmeflow, we build deployment software.",
      companyHints: undefined,
    }))).toMatchObject({ name: "Acmeflow", confidence: 65 });
  });

  it("does not count worked-at prose as host corroboration", () => {
    expect(resolveCompanyIdentity(snapshot({
      hostname: "careers.stripe.com",
      url: "https://careers.stripe.com/jobs/123",
      headings: [],
      pageText: "Ideally you have worked at Stripe, Adyen or another payments company.",
      companyHints: undefined,
    }))).toBeNull();
  });

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
        metadataNames: ["Acme"],
        officialDomains: [],
      },
    }))).toMatchObject({ name: "Acme", confidence: 88 });

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

describe("retrieved source identity", () => {
  const identity = { name: "Linear", aliases: ["Linear"], officialDomains: ["linear.app"], confidence: 100 };

  it.each([
    ["Linear regression", "Linear regression forecasts the company's revenue.", false],
    ["Linear raises Series B", "Linear regression forecasts the company's revenue.", false],
    ["Linear raises Series B", "Linear raised a Series B round to grow its product team.", true],
    ["The startup Linear raises funding", "The startup Linear builds project management software.", true],
  ])("checks company usage in title and body: %s", (title, text, expected) => {
    expect(matchesCompanyIdentity({ title, url: "https://news.example/article" }, text, identity)).toBe(expected);
  });

  it("accepts the official domain but not a lookalike suffix", () => {
    expect(matchesCompanyIdentity({ url: "https://linear.app/about" }, "Plan and build products.", identity)).toBe(true);
    expect(matchesCompanyIdentity({ url: "https://linear.app.evil.example/about" }, "Plan and build products.", identity)).toBe(false);
  });
});

describe("company research retrieval", () => {
  it.each([
    ["Linear is a purpose-built tool for planning and building products.", true],
    ["Linear regression forecasts revenue for the company.", false],
    ["A guide mentions Linear among a list of words.", false],
  ])("retrieves a brand homepage but requires company assertions in its content: %s", async (text, accepted) => {
    const title = "Linear – Plan and build products";
    const url = "https://linear.app";
    const fetchMock = vi.fn().mockImplementation((endpoint) => Promise.resolve(exaResponse([
      { title, url, ...(endpoint === EXA_CONTENTS_URL ? { text } : {}) },
    ])));
    vi.stubGlobal("fetch", fetchMock);
    const result = await researchCompany("test-key", snapshot({
      companyHints: { structuredNames: ["Linear"], metadataNames: [], officialDomains: [] },
    }));
    expect(fetchMock.mock.calls.some(([endpoint]) => endpoint === EXA_CONTENTS_URL)).toBe(true);
    expect(result.sources).toEqual(accepted ? [{ title, url }] : []);
  });

  it.each(["https://linear.app.evil.example", "https://linear-tools.app", "https://notlinear.app"])(
    "does not route an alias-only title through a lookalike brand host: %s", async (url) => {
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(exaResponse([
        { title: "Linear – Plan and build products", url },
      ])));
      vi.stubGlobal("fetch", fetchMock);
      const result = await researchCompany("test-key", snapshot({
        companyHints: { structuredNames: ["Linear"], metadataNames: [], officialDomains: [] },
      }));
      expect(result.sources).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    },
  );

  it("retains a verified common-word company article and its grounding evidence", async () => {
    const url = "https://news.example/linear-series-b";
    const text = "Linear raised a Series B funding round to grow its product team.";
    const fetchMock = vi.fn().mockImplementation((endpoint) => Promise.resolve(exaResponse([
      endpoint === EXA_CONTENTS_URL ? { id: url, text } : { title: "Linear raises Series B", url },
    ])));
    vi.stubGlobal("fetch", fetchMock);
    const result = await researchCompany("test-key", snapshot({
      companyHints: { structuredNames: ["Linear"], metadataNames: [], officialDomains: [] },
    }));
    expect(result.sources).toEqual([{ title: "Linear raises Series B", url }]);
    expect(result.evidence).toEqual([{ title: "Linear raises Series B", url, text }]);
  });

  it("never searches Stripe when the job only mentions prior experience there", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(exaResponse([])));
    vi.stubGlobal("fetch", fetchMock);
    await researchCompany("test-key", snapshot({
      url: "https://careers.acmeflow.io/jobs/123",
      hostname: "careers.acmeflow.io",
      headings: ["Software Engineer"],
      companyHints: undefined,
      pageText: "Ideally you have worked at Stripe, Adyen or another payments company.",
    }));
    for (const [, init] of fetchMock.mock.calls) {
      expect(JSON.parse(init.body).query).not.toContain("Stripe");
    }
  });

  it.each([
    ["Linear", "Linear regression for forecasting", "Linear regression is used by the company to forecast funding requirements."],
    ["Notion", "The notion of a software company", "The notion of a startup and its product has changed."],
    ["Ramp", "Airport ramp engineering", "A ramp is used by the engineering team at the airport."],
    ["Mercury", "Mercury in industrial products", "Mercury appears in this company's products."],
    ["Retool", "Retool the engineering team", "Retool the company to improve its software products."],
    ["Brex", "Brex word list", "Brex appears in this dictionary of names."],
  ])("rejects incidental common-word search results for %s", async (name, title, text) => {
    const fetchMock = vi.fn().mockImplementation((url) => Promise.resolve(exaResponse([
      { title, url: "https://reference.example/article", ...(url === EXA_CONTENTS_URL ? { text } : {}) },
    ])));
    vi.stubGlobal("fetch", fetchMock);
    const result = await researchCompany("test-key", snapshot({
      companyHints: { structuredNames: [name], metadataNames: [], officialDomains: [] },
    }));
    expect(result.sources).toEqual([]);
    expect(result.context).toBe("");
  });

  it("revalidates common-word identity against retrieved content, not just its title", async () => {
    const fetchMock = vi.fn().mockImplementation((url) => Promise.resolve(exaResponse([
      {
        title: "Linear raises Series B funding",
        url: "https://news.example/linear",
        ...(url === EXA_CONTENTS_URL ? { text: "Linear regression helps the company model its funding requirements." } : {}),
      },
    ])));
    vi.stubGlobal("fetch", fetchMock);
    const result = await researchCompany("test-key", snapshot({
      companyHints: { structuredNames: ["Linear"], metadataNames: [], officialDomains: [] },
    }));
    expect(fetchMock.mock.calls.some(([url]) => url === EXA_CONTENTS_URL)).toBe(true);
    expect(result.sources).toEqual([]);
  });

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
