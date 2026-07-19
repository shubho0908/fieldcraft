import { describe, expect, it } from "vitest";
import {
  assertLiveConnectionResult,
  buildConnectionTestRequest,
  CONNECTION_TEST_MAX_OUTPUT_TOKENS,
  CONNECTION_TEST_PROMPT,
  extractOutputText,
  normalizeSuggestion,
  OPENAI_RESPONSES_URL,
  sanitizeAnalysis,
} from "./openai";
import type { PageField, PageSnapshot } from "../types";
import {
  Confidence,
  FitVerdict,
  HARD_BLOCKER_SCORE_CAP,
  PageFieldKind,
  SuggestionAction,
} from "./enums";
import {
  CONNECTION_TEST_REASONING_EFFORT,
  DEFAULT_MODEL_ID,
} from "./models";

describe("live connection probe", () => {
  it("targets the real OpenAI Responses endpoint with the selected model", () => {
    const request = buildConnectionTestRequest(DEFAULT_MODEL_ID, "install-1");
    expect(request.url).toBe(OPENAI_RESPONSES_URL);
    expect(request.url).toBe("https://api.openai.com/v1/responses");
    expect(request.body).toEqual({
      model: DEFAULT_MODEL_ID,
      store: false,
      safety_identifier: "install-1",
      reasoning: { effort: CONNECTION_TEST_REASONING_EFFORT },
      input: CONNECTION_TEST_PROMPT,
      max_output_tokens: CONNECTION_TEST_MAX_OUTPUT_TOKENS,
    });
  });

  it("fails on HTTP errors from the live API", () => {
    expect(() =>
      assertLiveConnectionResult(
        { ok: false, status: 401 },
        { error: { message: "Incorrect API key provided" } },
      ),
    ).toThrow(/Incorrect API key/);
  });

  it("fails when OpenAI returns no model text (HTTP 200 alone is not enough)", () => {
    expect(() =>
      assertLiveConnectionResult(
        { ok: true, status: 200 },
        { id: "resp_empty", status: "completed", output: [] },
      ),
    ).toThrow(/returned no text/);
  });

  it("fails on incomplete or refused responses", () => {
    expect(() =>
      assertLiveConnectionResult(
        { ok: true, status: 200 },
        {
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
        },
      ),
    ).toThrow(/before completion/);

    expect(() =>
      assertLiveConnectionResult(
        { ok: true, status: 200 },
        {
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "refusal", refusal: "I cannot help with that." }],
            },
          ],
        },
      ),
    ).toThrow(/cannot help/);
  });

  it("passes only when the live model returns text", () => {
    expect(() =>
      assertLiveConnectionResult(
        { ok: true, status: 200 },
        {
          id: "resp_ok",
          status: "completed",
          output_text: "connected",
        },
      ),
    ).not.toThrow();
  });
});

describe("Responses API parser", () => {
  it("reads output text from raw message items", () => {
    expect(
      extractOutputText({
        output: [
          { type: "function_call" },
          {
            type: "message",
            content: [{ type: "output_text", text: '{"fit":{"score":91}}' }],
          },
        ],
      }),
    ).toBe('{"fit":{"score":91}}');
  });

  it("prefers the convenience output_text property when present", () => {
    expect(extractOutputText({ output_text: "structured" })).toBe("structured");
  });
});

describe("normalizeSuggestion", () => {
  const selectField: PageField = {
    id: "work-auth",
    kind: PageFieldKind.Select,
    type: "select",
    name: "work-auth",
    label: "Work auth",
    placeholder: "",
    ariaLabel: "",
    section: "",
    required: true,
    sensitive: false,
    currentValue: "",
    maxLength: null,
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  };

  it("coerces invalid action/confidence enums", () => {
    const result = normalizeSuggestion(
      {
        fieldId: "work-auth",
        action: "submit" as never,
        confidence: "extreme" as never,
        value: "Yes",
        evidence: "profile",
        warning: "",
      },
      selectField,
    );
    expect(result.action).toBe(SuggestionAction.Review);
    expect(result.confidence).toBe(Confidence.Low);
  });

  it("demotes invalid select fills and empty fills", () => {
    const invalid = normalizeSuggestion(
      {
        fieldId: "work-auth",
        action: SuggestionAction.Fill,
        confidence: Confidence.High,
        value: "Maybe",
        evidence: "guess",
        warning: "",
      },
      selectField,
    );
    expect(invalid.action).toBe(SuggestionAction.Review);

    const empty = normalizeSuggestion(
      {
        fieldId: "work-auth",
        action: SuggestionAction.Fill,
        confidence: Confidence.High,
        value: "",
        evidence: "profile",
        warning: "",
      },
      selectField,
    );
    expect(empty.action).toBe(SuggestionAction.Review);
  });
});

describe("sanitizeAnalysis", () => {
  const snapshot: PageSnapshot = {
    title: "Engineer",
    url: "https://jobs.example.com/1",
    hostname: "jobs.example.com",
    ats: "Generic",
    headings: [],
    pageText: "Build product.",
    fields: [
      {
        id: "field-1",
        kind: "text",
        type: "text",
        name: "name",
        label: "Full name",
        placeholder: "",
        ariaLabel: "",
        section: "",
        required: true,
        sensitive: false,
        currentValue: "",
        maxLength: null,
        options: [],
      },
    ],
    capturedAt: new Date().toISOString(),
  };

  it("enforces fit invariants and research meta", () => {
    const analysis = sanitizeAnalysis(
      {
        job: {
          company: "Example",
          role: "Engineer",
          location: "Remote",
          employmentType: "Full-time",
          seniority: "Mid",
          summary: "Build product",
          requirements: ["TypeScript"],
          responsibilities: ["Ship features"],
          keywords: ["TypeScript"],
          compensation: "Unknown",
          remotePolicy: "Remote",
        },
        fit: {
          score: 94,
          verdict: FitVerdict.Weak,
          strongestMatches: ["TypeScript"],
          gaps: [],
          hardBlockers: ["Needs sponsorship; profile is not authorized"],
          recommendation: "Blocked on authorization",
        },
        company: {
          summary: "Unknown company",
          product: "Unknown",
          stage: "Unknown",
          size: "Unknown",
          funding: "Unknown",
          engineeringSignals: [],
          risks: [],
          sources: [],
        },
        suggestions: [
          {
            fieldId: "field-1",
            label: "Full name",
            action: SuggestionAction.Fill,
            value: "Ada Lovelace",
            confidence: Confidence.High,
            evidence: "identity.fullName",
            warning: "",
          },
        ],
        missingFacts: [],
      },
      snapshot,
      [{ title: "ignored", url: "not-a-url" }],
      true,
    );

    expect(analysis.fit.score).toBe(HARD_BLOCKER_SCORE_CAP);
    expect(analysis.fit.verdict).toBe(FitVerdict.Mixed);
    expect(analysis.company.sources).toEqual([]);
    expect(analysis.research).toEqual({ attempted: true, thin: true });
    expect(analysis.suggestions).toHaveLength(1);
  });
});
