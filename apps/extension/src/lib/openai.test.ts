import { describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import {
  assertLiveConnectionResult,
  buildConnectionTestRequest,
  CONNECTION_TEST_MAX_OUTPUT_TOKENS,
  CONNECTION_TEST_PROMPT,
  coerceAnalysisOutput,
  extractJsonObject,
  extractOutputText,
  formatAnalysisError,
  normalizeSuggestion,
  OPENAI_RESPONSES_URL,
  runJobAnalysis,
  sanitizeAnalysis,
} from "./openai";
import { createAiModel } from "./ai-provider";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from "./defaults";
import type { ExtensionSettings, PageSnapshot } from "../types";
import { AnthropicModelId, Provider } from "./models";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  jsonSchema: (schema: unknown) => schema,
  Output: { object: (config: { schema: unknown }) => config.schema },
}));

vi.mock("./ai-provider", () => ({
  createAiModel: vi.fn(() => ({ id: "fake-model" })),
}));
import type { PageField } from "../types";
import {
  Confidence,
  FitVerdict,
  HARD_BLOCKER_SCORE_CAP,
  PageFieldKind,
  ReasoningEffort,
  ReasoningEffortSettingAuto,
  SuggestionAction,
} from "./enums";
import {
  CONNECTION_TEST_REASONING_EFFORT,
  DEFAULT_MODEL_ID,
  GeminiModelId,
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

describe("extractJsonObject", () => {
  it("parses a JSON object wrapped in a markdown code fence", () => {
    const text = `Some reasoning text.\n\`\`\`json\n{"score": 75, "verdict": "Good fit"}\n\`\`\``;
    const parsed = extractJsonObject(text) as { score: number; verdict: string };
    expect(parsed.score).toBe(75);
    expect(parsed.verdict).toBe("Good fit");
  });

  it("parses an inline JSON object surrounded by explanatory text", () => {
    const text = `Let me analyze this job posting carefully.\n\n{"score": 42, "verdict": "Poor fit"}\n\nHope this helps!`;
    const parsed = extractJsonObject(text) as { score: number; verdict: string };
    expect(parsed.score).toBe(42);
    expect(parsed.verdict).toBe("Poor fit");
  });

  it("throws when no JSON object is present", () => {
    expect(() => extractJsonObject("No JSON here.")).toThrow(/No JSON object/);
  });
});

describe("coerceAnalysisOutput", () => {
  it("normalizes a flattened MiniMax-style response into the canonical schema", () => {
    const raw = {
      fitScore: 48,
      verdict: "mixed",
      summary: "Technical fit is strong.",
      strongestMatches: ["LLM experience"],
      gaps: ["Intern compensation"],
      company: {
        name: "LedgersCFO",
        industry: "Accounting / Fintech",
        size: "Unknown",
        stage: "Unknown",
        locationPolicy: "Bengaluru, 3 days/week",
        compensation: "INR 15,000-30,000/month",
        sources: [],
      },
      fieldSuggestions: [
        {
          fieldId: "field-1",
          action: "fill",
          value: "answer",
          evidence: "profile",
          warning: "",
        },
      ],
      missingFacts: ["Candidate intent"],
    };

    const parsed = coerceAnalysisOutput(raw);

    expect(parsed.fit.score).toBe(48);
    expect(parsed.fit.strongestMatches).toEqual(["LLM experience"]);
    expect(parsed.fit.recommendation).toBe("Technical fit is strong.");
    expect(parsed.company.summary).toBe("Accounting / Fintech");
    expect(parsed.company.funding).toBe("INR 15,000-30,000/month");
    expect(parsed.suggestions).toHaveLength(1);
    expect(parsed.suggestions[0].fieldId).toBe("field-1");
    expect(parsed.missingFacts).toEqual(["Candidate intent"]);
    expect(parsed.job.company).toBe("LedgersCFO");
  });

  it("passes through a canonical schema-shaped response unchanged", () => {
    const canonical = {
      fit: {
        score: 75,
        verdict: "strong",
        strongestMatches: [],
        gaps: [],
        hardBlockers: [],
        recommendation: "Good fit.",
      },
      job: {
        company: "Acme",
        role: "Engineer",
        location: "",
        employmentType: "",
        seniority: "",
        summary: "",
        requirements: [],
        responsibilities: [],
        keywords: [],
        compensation: "",
        remotePolicy: "",
      },
      company: {
        summary: "",
        product: "",
        stage: "",
        size: "",
        funding: "",
        engineeringSignals: [],
        risks: [],
        sources: [],
      },
      suggestions: [],
      missingFacts: [],
    };

    const parsed = coerceAnalysisOutput(canonical);

    expect(parsed.fit.score).toBe(75);
    expect(parsed.fit.verdict).toBe("strong");
    expect(parsed.job.company).toBe("Acme");
  });
});

describe("formatAnalysisError", () => {
  it("explains custom provider JSON parse failures", () => {
    const message = formatAnalysisError(
      new Error("No JSON object found in the model response."),
      Provider.Custom,
    );
    expect(message).toMatch(/custom model did not return a valid JSON object/i);
  });

  it("explains custom provider endpoint errors", () => {
    const message = formatAnalysisError(
      new Error("fetch failed: ECONNREFUSED"),
      Provider.Custom,
    );
    expect(message).toMatch(/could not reach the custom provider endpoint/i);
  });

  it("explains built-in provider authentication errors", () => {
    const message = formatAnalysisError(
      new Error("401 Unauthorized"),
      Provider.OpenAI,
    );
    expect(message).toMatch(/API key was rejected/i);
  });
});

const baseSnapshot: PageSnapshot = {
  title: "Engineer",
  url: "https://jobs.example.com/1",
  hostname: "jobs.example.com",
  ats: "Generic",
  headings: [],
  pageText: "Build product.",
  fields: [],
  capturedAt: new Date().toISOString(),
};

const baseProfile = DEFAULT_PROFILE;

const baseSettings: ExtensionSettings = {
  ...DEFAULT_SETTINGS,
  provider: Provider.OpenAI,
  model: DEFAULT_MODEL_ID,
  researchCompany: false,
};

const validAnalysisOutput = {
  job: {
    company: "Acme",
    role: "Engineer",
    location: "",
    employmentType: "",
    seniority: "",
    summary: "",
    requirements: [],
    responsibilities: [],
    keywords: [],
    compensation: "",
    remotePolicy: "",
  },
  fit: {
    score: 75,
    verdict: "strong",
    strongestMatches: [],
    gaps: [],
    hardBlockers: [],
    recommendation: "Good fit.",
  },
  company: {
    summary: "",
    product: "",
    stage: "",
    size: "",
    funding: "",
    engineeringSignals: [],
    risks: [],
    sources: [],
  },
  suggestions: [],
  missingFacts: [],
};

describe("runJobAnalysis max output tokens", () => {
  it("uses the model catalog default for built-in providers", async () => {
    const generate = vi.mocked(generateText);
    generate.mockResolvedValueOnce({
      output: validAnalysisOutput,
      finishReason: "stop",
      response: { id: "resp-1" },
    } as never);

    await runJobAnalysis(baseSnapshot, baseProfile, baseSettings, {
      apiKey: "sk-test",
      installId: "install-1",
    });

    expect(generate).toHaveBeenCalledTimes(1);
    const call = generate.mock.calls[0][0] as { maxOutputTokens: number };
    expect(call.maxOutputTokens).toBe(16_384);
    expect(createAiModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.objectContaining({ id: DEFAULT_MODEL_ID }) }),
    );
  });

  it("uses the user override when provided", async () => {
    const generate = vi.mocked(generateText);
    generate.mockResolvedValueOnce({
      output: validAnalysisOutput,
      finishReason: "stop",
      response: { id: "resp-2" },
    } as never);

    await runJobAnalysis(baseSnapshot, baseProfile, {
      ...baseSettings,
      maxOutputTokens: 4_096,
    }, {
      apiKey: "sk-test",
      installId: "install-1",
    });

    const call = generate.mock.calls[0][0] as { maxOutputTokens: number };
    expect(call.maxOutputTokens).toBe(4_096);
  });

  it("defaults custom providers to 4096", async () => {
    const generate = vi.mocked(generateText);
    generate.mockResolvedValueOnce({
      text: JSON.stringify(validAnalysisOutput),
      finishReason: "stop",
      response: { id: "resp-3" },
    } as never);

    await runJobAnalysis(baseSnapshot, baseProfile, {
      ...baseSettings,
      provider: Provider.Custom,
      model: "custom:sarvam-105b",
      customBaseUrl: "https://api.sarvam.ai/v1",
    }, {
      apiKey: "sk-test",
      installId: "install-1",
    });

    const call = generate.mock.calls[0][0] as { maxOutputTokens: number };
    expect(call.maxOutputTokens).toBe(4_096);
  });

  it("clamps built-in overrides to the catalog maximum", async () => {
    const generate = vi.mocked(generateText);
    generate.mockResolvedValueOnce({
      output: validAnalysisOutput,
      finishReason: "stop",
      response: { id: "resp-4" },
    } as never);

    await runJobAnalysis(baseSnapshot, baseProfile, {
      ...baseSettings,
      maxOutputTokens: 1_000_000,
    }, {
      apiKey: "sk-test",
      installId: "install-1",
    });

    const call = generate.mock.calls[0][0] as { maxOutputTokens: number };
    expect(call.maxOutputTokens).toBe(16_384);
  });
});

describe("runJobAnalysis provider options", () => {
  function stubAnalysis(text = "resp-stub") {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: validAnalysisOutput,
      finishReason: "stop",
      response: { id: text },
    } as never);
  }

  function firstCallProviderOptions() {
    const call = vi.mocked(generateText).mock.calls[0][0] as {
      providerOptions?: unknown;
    };
    return call.providerOptions;
  }

  it("sends Gemini thinkingConfig so the chosen effort is not silently dropped", async () => {
    stubAnalysis("resp-gemini-high");

    await runJobAnalysis(
      baseSnapshot,
      baseProfile,
      {
        ...baseSettings,
        provider: Provider.Gemini,
        model: GeminiModelId.Gemini38Flash,
        reasoningEffort: ReasoningEffort.High,
      },
      { apiKey: "sk-gemini", installId: "install-1" },
    );

    expect(firstCallProviderOptions()).toEqual({
      google: { thinkingConfig: { thinkingLevel: "high" } },
    });
  });

  it("uses the documented Gemini default when the user picks auto", async () => {
    stubAnalysis("resp-gemini-auto");

    await runJobAnalysis(
      baseSnapshot,
      baseProfile,
      {
        ...baseSettings,
        provider: Provider.Gemini,
        model: GeminiModelId.Gemini38Flash,
        reasoningEffort: ReasoningEffortSettingAuto,
      },
      { apiKey: "sk-gemini", installId: "install-1" },
    );

    expect(firstCallProviderOptions()).toEqual({
      google: { thinkingConfig: { thinkingLevel: "medium" } },
    });
  });

  it("clamps an unsupported Gemini effort before it reaches the API", async () => {
    stubAnalysis("resp-gemini-clamped");

    await runJobAnalysis(
      baseSnapshot,
      baseProfile,
      {
        ...baseSettings,
        provider: Provider.Gemini,
        model: GeminiModelId.Gemini38Flash,
        // 3.8 Flash documents low/medium/high only.
        reasoningEffort: ReasoningEffort.Max,
      },
      { apiKey: "sk-gemini", installId: "install-1" },
    );

    expect(firstCallProviderOptions()).toEqual({
      google: { thinkingConfig: { thinkingLevel: "medium" } },
    });
  });

  it("leaves older Gemini models on the API default instead of sending minimal", async () => {
    stubAnalysis("resp-gemini-legacy");

    await runJobAnalysis(
      baseSnapshot,
      baseProfile,
      {
        ...baseSettings,
        provider: Provider.Gemini,
        model: GeminiModelId.Gemini37Flash,
      },
      { apiKey: "sk-gemini", installId: "install-1" },
    );

    // These models declare no thinking levels, and `minimal` is not accepted by
    // every Gemini model, so no thinking config may be sent at all.
    expect(firstCallProviderOptions()).toBeUndefined();
  });

  it("sends Gemini 3.8 Flash's routine budget, not its 64k ceiling", async () => {
    stubAnalysis("resp-gemini-budget");

    await runJobAnalysis(
      baseSnapshot,
      baseProfile,
      {
        ...baseSettings,
        provider: Provider.Gemini,
        model: GeminiModelId.Gemini38Flash,
      },
      { apiKey: "sk-gemini", installId: "install-1" },
    );

    const call = vi.mocked(generateText).mock.calls[0][0] as {
      maxOutputTokens: number;
    };
    expect(call.maxOutputTokens).toBe(16_384);
  });

  it("sends Anthropic adaptive effort for Claude models", async () => {
    stubAnalysis("resp-anthropic");

    await runJobAnalysis(
      baseSnapshot,
      baseProfile,
      {
        ...baseSettings,
        provider: Provider.Anthropic,
        model: AnthropicModelId.ClaudeOpus5,
        reasoningEffort: ReasoningEffort.XHigh,
      },
      { apiKey: "sk-ant-test", installId: "install-1" },
    );

    expect(firstCallProviderOptions()).toEqual({
      anthropic: { effort: ReasoningEffort.XHigh },
    });
  });

  it.each([
    ReasoningEffortSettingAuto,
    ReasoningEffort.None,
    ReasoningEffort.High,
  ])("omits unsupported Anthropic effort for Haiku with %s", async (reasoningEffort) => {
    stubAnalysis("resp-anthropic-haiku");

    await runJobAnalysis(
      baseSnapshot,
      baseProfile,
      {
        ...baseSettings,
        provider: Provider.Anthropic,
        model: AnthropicModelId.ClaudeHaiku45,
        reasoningEffort,
      },
      { apiKey: "sk-ant-test", installId: "install-1" },
    );

    expect(firstCallProviderOptions()).toBeUndefined();
  });

  it("keeps the OpenAI namespace for OpenAI models", async () => {
    stubAnalysis("resp-openai");

    await runJobAnalysis(baseSnapshot, baseProfile, baseSettings, {
      apiKey: "sk-test",
      installId: "install-1",
    });

    expect(firstCallProviderOptions()).toEqual({
      openai: {
        store: false,
        user: "install-1",
        reasoningEffort: ReasoningEffort.Medium,
      },
    });
  });

  it("sends no provider options for custom endpoints", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: JSON.stringify(validAnalysisOutput),
      finishReason: "stop",
      response: { id: "resp-custom" },
    } as never);

    await runJobAnalysis(
      baseSnapshot,
      baseProfile,
      {
        ...baseSettings,
        provider: Provider.Custom,
        model: "custom:sarvam-105b",
        customBaseUrl: "https://api.sarvam.ai/v1",
      },
      { apiKey: "sk-test", installId: "install-1" },
    );

    expect(firstCallProviderOptions()).toBeUndefined();
  });
});
