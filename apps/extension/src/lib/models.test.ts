import { describe, expect, it } from "vitest";
import {
  GeminiModelId,
  GeminiThinkingLevel,
  OpenAiModelId,
  ReasoningEffort,
  ReasoningEffortSettingAuto,
} from "./enums";
import {
  CUSTOM_MODEL_PREFIX,
  CustomProtocol,
  DEFAULT_MODEL_ID,
  GEMINI_MODELS,
  isCustomProtocol,
  isKnownModel,
  OPENAI_MODELS,
  resolveAnalysisConfig,
  resolveMaxOutputTokens,
  resolveModel,
  resolveReasoningEffort,
  reasoningEffortsForModel,
  sanitizeAnthropicBaseUrl,
  sanitizeCustomBaseUrl,
  toGeminiThinkingLevel,
} from "./models";

describe("OpenAI model catalog", () => {
  it("keeps only the requested GPT-5.6 and GPT-5.5 series", () => {
    expect(OPENAI_MODELS.map((model) => model.id)).toEqual([
      OpenAiModelId.Gpt56Terra,
      OpenAiModelId.Gpt56Sol,
      OpenAiModelId.Gpt56Luna,
      OpenAiModelId.Gpt55,
      OpenAiModelId.Gpt55Pro,
    ]);
  });

  it("includes the current Gemini Pro and Flash choices", () => {
    expect(GEMINI_MODELS.map((model) => model.id)).toEqual([
      GeminiModelId.Gemini38Flash,
      GeminiModelId.Gemini37Flash,
      GeminiModelId.Gemini36Flash,
      GeminiModelId.Gemini35Flash,
      GeminiModelId.Gemini35FlashLite,
    ]);
  });

  it("defaults to Terra", () => {
    expect(DEFAULT_MODEL_ID).toBe(OPENAI_MODELS[0].id);
    expect(resolveModel("not-a-model").id).toBe(DEFAULT_MODEL_ID);
  });

  it("exposes GPT-5.6 efforts including max", () => {
    const sol = resolveModel(OpenAiModelId.Gpt56Sol);
    expect(sol.supportedReasoningEfforts).toEqual([
      ReasoningEffort.None,
      ReasoningEffort.Low,
      ReasoningEffort.Medium,
      ReasoningEffort.High,
      ReasoningEffort.XHigh,
      ReasoningEffort.Max,
    ]);
    expect(sol.defaultReasoningEffort).toBe(ReasoningEffort.High);
  });

  it("limits GPT-5.5 to xhigh and below", () => {
    expect(resolveModel(OpenAiModelId.Gpt55).supportedReasoningEfforts).toEqual([
      ReasoningEffort.None,
      ReasoningEffort.Low,
      ReasoningEffort.Medium,
      ReasoningEffort.High,
      ReasoningEffort.XHigh,
    ]);
  });

  it("limits GPT-5.5 Pro to the documented efforts", () => {
    expect(resolveModel(OpenAiModelId.Gpt55Pro).supportedReasoningEfforts).toEqual([
      ReasoningEffort.Medium,
      ReasoningEffort.High,
      ReasoningEffort.XHigh,
    ]);
  });
});

describe("Gemini 3.8 Flash thinking levels", () => {
  it("exposes exactly the tunable levels Google documents", () => {
    const flash = resolveModel(GeminiModelId.Gemini38Flash);
    expect(flash.supportedReasoningEfforts).toEqual([
      ReasoningEffort.Low,
      ReasoningEffort.Medium,
      ReasoningEffort.High,
    ]);
    expect(flash.defaultReasoningEffort).toBe(ReasoningEffort.Medium);
  });

  it("never offers none, because ReasoningEffort.None maps to `minimal`", () => {
    // Google documents that `minimal` is not supported on 3.8 Flash, so the
    // effort that would translate to it must stay out of the supported set.
    expect(
      resolveModel(GeminiModelId.Gemini38Flash).supportedReasoningEfforts,
    ).not.toContain(ReasoningEffort.None);
    expect(toGeminiThinkingLevel(ReasoningEffort.None)).toBe(
      GeminiThinkingLevel.Minimal,
    );
  });

  it("clamps unsupported efforts to the documented default", () => {
    expect(
      resolveReasoningEffort(
        GeminiModelId.Gemini38Flash,
        ReasoningEffortSettingAuto,
      ),
    ).toBe(ReasoningEffort.Medium);
    expect(
      resolveReasoningEffort(GeminiModelId.Gemini38Flash, ReasoningEffort.None),
    ).toBe(ReasoningEffort.Medium);
    expect(
      resolveReasoningEffort(GeminiModelId.Gemini38Flash, ReasoningEffort.Max),
    ).toBe(ReasoningEffort.Medium);
  });

  it("offers auto plus the tunable levels in the settings dropdown", () => {
    expect(
      reasoningEffortsForModel(GeminiModelId.Gemini38Flash).map(
        (option) => option.id,
      ),
    ).toEqual([
      ReasoningEffortSettingAuto,
      ReasoningEffort.Low,
      ReasoningEffort.Medium,
      ReasoningEffort.High,
    ]);
  });

  it("resolves the analysis payload to a Gemini thinking level", () => {
    expect(
      resolveAnalysisConfig({
        model: GeminiModelId.Gemini38Flash,
        reasoningEffort: ReasoningEffort.High,
      }),
    ).toEqual({
      modelId: GeminiModelId.Gemini38Flash,
      reasoning: { effort: ReasoningEffort.High },
    });
  });

  it("maps every catalog effort onto a level Gemini accepts", () => {
    expect(toGeminiThinkingLevel(ReasoningEffort.None)).toBe(
      GeminiThinkingLevel.Minimal,
    );
    expect(toGeminiThinkingLevel(ReasoningEffort.Low)).toBe(
      GeminiThinkingLevel.Low,
    );
    expect(toGeminiThinkingLevel(ReasoningEffort.Medium)).toBe(
      GeminiThinkingLevel.Medium,
    );
    expect(toGeminiThinkingLevel(ReasoningEffort.High)).toBe(
      GeminiThinkingLevel.High,
    );
    expect(toGeminiThinkingLevel(ReasoningEffort.XHigh)).toBe(
      GeminiThinkingLevel.High,
    );
    expect(toGeminiThinkingLevel(ReasoningEffort.Max)).toBe(
      GeminiThinkingLevel.High,
    );

    const levels = new Set<string>(Object.values(GeminiThinkingLevel));
    for (const effort of [ReasoningEffort.None, ...GEMINI_MODELS.flatMap(
      (model) => [...model.supportedReasoningEfforts],
    )]) {
      expect(levels.has(toGeminiThinkingLevel(effort))).toBe(true);
    }
  });
});

describe("reasoning resolution", () => {
  it("uses model default for auto", () => {
    expect(
      resolveReasoningEffort(OpenAiModelId.Gpt56Luna, ReasoningEffortSettingAuto),
    ).toBe(ReasoningEffort.Low);
    expect(
      resolveReasoningEffort(OpenAiModelId.Gpt56Sol, ReasoningEffortSettingAuto),
    ).toBe(ReasoningEffort.High);
  });

  it("clamps unsupported effort to model default", () => {
    expect(
      resolveReasoningEffort(OpenAiModelId.Gpt55, ReasoningEffort.Max),
    ).toBe(ReasoningEffort.Medium);
  });

  it("filters effort options per model and always includes auto", () => {
    const fiveFive = reasoningEffortsForModel(OpenAiModelId.Gpt55).map(
      (option) => option.id,
    );
    expect(fiveFive[0]).toBe(ReasoningEffortSettingAuto);
    expect(fiveFive).not.toContain(ReasoningEffort.Max);
    expect(fiveFive).toContain(ReasoningEffort.XHigh);
  });

  it("builds Responses reasoning payload with effort only", () => {
    expect(
      resolveAnalysisConfig({
        model: OpenAiModelId.Gpt56Sol,
        reasoningEffort: ReasoningEffort.XHigh,
      }),
    ).toEqual({
      modelId: OpenAiModelId.Gpt56Sol,
      reasoning: { effort: ReasoningEffort.XHigh },
    });

    expect(
      resolveAnalysisConfig({
        model: OpenAiModelId.Gpt55,
        reasoningEffort: ReasoningEffortSettingAuto,
      }),
    ).toEqual({
      modelId: OpenAiModelId.Gpt55,
      reasoning: { effort: ReasoningEffort.Medium },
    });
  });

  it("keeps known model lookup stable", () => {
    expect(isKnownModel(OpenAiModelId.Gpt56Terra)).toBe(true);
    expect(isKnownModel("gpt-5.5-pro")).toBe(true);
    expect(isKnownModel(GeminiModelId.Gemini38Flash)).toBe(true);
    expect(isKnownModel("gpt-5.4")).toBe(false);
  });

  it("keeps every model's default effort inside its supported set", () => {
    // resolveReasoningEffort() falls back to defaultReasoningEffort for anything
    // unsupported, so a default outside the supported set could be sent to a
    // provider that rejects it.
    for (const model of [...OPENAI_MODELS, ...GEMINI_MODELS]) {
      if (model.supportedReasoningEfforts.length === 0) continue;
      expect(model.supportedReasoningEfforts).toContain(
        model.defaultReasoningEffort,
      );
    }
  });
});

describe("max output token resolution", () => {
  it("uses the model catalog default when no override is provided", () => {
    expect(resolveMaxOutputTokens(OpenAiModelId.Gpt56Terra)).toBe(16_384);
    expect(resolveMaxOutputTokens(OpenAiModelId.Gpt55)).toBe(8_192);
    expect(resolveMaxOutputTokens(GeminiModelId.Gemini35Flash)).toBe(8_192);
  });

  it("uses the documented 64k output ceiling for Gemini 3.8 Flash", () => {
    expect(resolveMaxOutputTokens(GeminiModelId.Gemini38Flash)).toBe(65_536);
    // Thinking tokens count against max_output_tokens, so the ceiling matters.
    expect(
      resolveMaxOutputTokens(GeminiModelId.Gemini38Flash, 100_000),
    ).toBe(65_536);
    expect(
      resolveMaxOutputTokens(GeminiModelId.Gemini38Flash, 32_768),
    ).toBe(32_768);
  });

  it("clamps built-in model overrides to the catalog maximum", () => {
    expect(resolveMaxOutputTokens(OpenAiModelId.Gpt56Terra, 100_000)).toBe(16_384);
    expect(resolveMaxOutputTokens(OpenAiModelId.Gpt56Terra, 4_096)).toBe(4_096);
  });

  it("defaults custom models to 4096 and allows user overrides", () => {
    const customId = `${CUSTOM_MODEL_PREFIX}sarvam-105b` as const;
    expect(resolveMaxOutputTokens(customId)).toBe(4_096);
    expect(resolveMaxOutputTokens(customId, 8_192)).toBe(8_192);
    expect(resolveMaxOutputTokens(customId, 2_000_000)).toBe(1_000_000);
  });

  it("ignores invalid overrides and falls back to the default", () => {
    expect(resolveMaxOutputTokens(OpenAiModelId.Gpt56Terra, -1)).toBe(16_384);
    expect(resolveMaxOutputTokens(OpenAiModelId.Gpt56Terra, NaN)).toBe(16_384);
    expect(resolveMaxOutputTokens("not-a-model")).toBe(16_384);
  });
});

describe("custom protocol helpers", () => {
  it("recognizes only valid custom protocols", () => {
    expect(isCustomProtocol(CustomProtocol.OpenAI)).toBe(true);
    expect(isCustomProtocol(CustomProtocol.Anthropic)).toBe(true);
    expect(isCustomProtocol("openai")).toBe(true);
    expect(isCustomProtocol("anthropic")).toBe(true);
    expect(isCustomProtocol("gemini")).toBe(false);
    expect(isCustomProtocol("")).toBe(false);
  });

  it("normalizes OpenAI-compatible base URLs", () => {
    expect(sanitizeCustomBaseUrl("https://api.fireworks.ai/inference/v1")).toBe(
      "https://api.fireworks.ai/inference/v1",
    );
    expect(
      sanitizeCustomBaseUrl("https://api.fireworks.ai/inference/v1/chat/completions"),
    ).toBe("https://api.fireworks.ai/inference/v1");
    expect(sanitizeCustomBaseUrl("https://api.fireworks.ai/inference/v1/")).toBe(
      "https://api.fireworks.ai/inference/v1",
    );
    expect(sanitizeCustomBaseUrl("https://api.fireworks.ai/inference")).toBe(
      "https://api.fireworks.ai/inference/v1",
    );
  });

  it("leaves empty Anthropic base URLs empty so validation can reject them", () => {
    expect(sanitizeAnthropicBaseUrl("")).toBe("");
    expect(sanitizeAnthropicBaseUrl("   ")).toBe("");
  });

  it("normalizes Anthropic-compatible base URLs to the /v1 root", () => {
    expect(sanitizeAnthropicBaseUrl("https://api.anthropic.com")).toBe(
      "https://api.anthropic.com/v1",
    );
    expect(sanitizeAnthropicBaseUrl("https://api.anthropic.com/v1")).toBe(
      "https://api.anthropic.com/v1",
    );
    expect(
      sanitizeAnthropicBaseUrl("https://api.anthropic.com/v1/messages"),
    ).toBe("https://api.anthropic.com/v1");
    expect(
      sanitizeAnthropicBaseUrl("https://api.minimax.io/anthropic"),
    ).toBe("https://api.minimax.io/anthropic/v1");
    expect(
      sanitizeAnthropicBaseUrl(
        "https://api.minimax.io/anthropic/v1/messages",
      ),
    ).toBe("https://api.minimax.io/anthropic/v1");
  });
});
