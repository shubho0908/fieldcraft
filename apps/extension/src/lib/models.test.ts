import { describe, expect, it } from "vitest";
import {
  AnthropicModelId,
  GeminiModelId,
  GeminiThinkingLevel,
  OpenAiModelId,
  ReasoningEffort,
  ReasoningEffortSettingAuto,
} from "./enums";
import {
  ANTHROPIC_MODELS,
  CUSTOM_MODEL_PREFIX,
  CustomProtocol,
  DEFAULT_MODEL_ID,
  GEMINI_MODELS,
  isCustomProtocol,
  isKnownModel,
  modelMaxOutputTokensCeiling,
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
  it("lists GPT-6 first with GPT-5.6 retained", () => {
    expect(OPENAI_MODELS.map((model) => model.id)).toEqual([
      OpenAiModelId.Gpt6Sol,
      OpenAiModelId.Gpt6Astra,
      OpenAiModelId.Gpt6Luna,
      OpenAiModelId.Gpt56Terra,
      OpenAiModelId.Gpt56Sol,
      OpenAiModelId.Gpt56Luna,
    ]);
  });

  it("uses GPT-6 Sol as the default", () => {
    const sol = resolveModel(OpenAiModelId.Gpt6Sol);
    expect(DEFAULT_MODEL_ID).toBe(OpenAiModelId.Gpt6Sol);
    expect(DEFAULT_MODEL_ID).toBe(OPENAI_MODELS[0].id);
    expect(sol.maxOutputTokens).toBe(128_000);
    expect(resolveMaxOutputTokens(OpenAiModelId.Gpt6Sol)).toBe(16_384);
    expect(resolveModel("not-a-model").id).toBe(DEFAULT_MODEL_ID);
  });

  it("supports the full effort range on GPT-6 Sol and Luna", () => {
    for (const id of [OpenAiModelId.Gpt6Sol, OpenAiModelId.Gpt6Luna]) {
      expect(resolveModel(id).supportedReasoningEfforts).toEqual([
        ReasoningEffort.None,
        ReasoningEffort.Low,
        ReasoningEffort.Medium,
        ReasoningEffort.High,
        ReasoningEffort.XHigh,
        ReasoningEffort.Max,
      ]);
      expect(resolveModel(id).defaultReasoningEffort).toBe(
        ReasoningEffort.Medium,
      );
    }
  });

  it("excludes none from GPT-6 Astra", () => {
    expect(
      resolveModel(OpenAiModelId.Gpt6Astra).supportedReasoningEfforts,
    ).toEqual([
      ReasoningEffort.Low,
      ReasoningEffort.Medium,
      ReasoningEffort.High,
      ReasoningEffort.XHigh,
      ReasoningEffort.Max,
    ]);
    expect(resolveReasoningEffort(OpenAiModelId.Gpt6Astra, ReasoningEffort.None)).toBe(
      ReasoningEffort.Medium,
    );
    expect(
      reasoningEffortsForModel(OpenAiModelId.Gpt6Astra).map((o) => o.id),
    ).not.toContain(ReasoningEffort.None);
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

  it("defaults to GPT-6 Sol", () => {
    expect(DEFAULT_MODEL_ID).toBe(OPENAI_MODELS[0].id);
    expect(DEFAULT_MODEL_ID).toBe(OpenAiModelId.Gpt6Sol);
    expect(resolveModel("not-a-model").id).toBe(DEFAULT_MODEL_ID);
  });

  it("exposes full efforts on GPT-5.6 Sol", () => {
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
});

describe("Anthropic model catalog", () => {
  it("lists Opus 5.5 first", () => {
    expect(ANTHROPIC_MODELS.map((model) => model.id)).toEqual([
      AnthropicModelId.ClaudeOpus55,
      AnthropicModelId.ClaudeOpus5,
      AnthropicModelId.ClaudeSonnet5,
      AnthropicModelId.ClaudeHaiku45,
    ]);
    expect(ANTHROPIC_MODELS[0].label).toBe("Claude Opus 5.5");
  });

  it("pins Opus 5.5 to the 128k ceiling and medium default", () => {
    const opus55 = resolveModel(AnthropicModelId.ClaudeOpus55);
    expect(opus55.maxOutputTokens).toBe(128_000);
    expect(opus55.defaultReasoningEffort).toBe(ReasoningEffort.Medium);
    expect(resolveMaxOutputTokens(AnthropicModelId.ClaudeOpus55)).toBe(16_384);
  });

  it("exposes adaptive effort for Opus 5.5/Opus/Sonnet but not Haiku", () => {
    for (const id of [
      AnthropicModelId.ClaudeOpus55,
      AnthropicModelId.ClaudeOpus5,
      AnthropicModelId.ClaudeSonnet5,
    ]) {
      expect(resolveModel(id).supportedReasoningEfforts).toEqual([
        ReasoningEffort.Low,
        ReasoningEffort.Medium,
        ReasoningEffort.High,
        ReasoningEffort.XHigh,
        ReasoningEffort.Max,
      ]);
    }
    expect(resolveModel(AnthropicModelId.ClaudeHaiku45).supportedReasoningEfforts).toEqual([]);
  });

  it("clamps none/auto on Opus 5.5 to medium", () => {
    expect(
      resolveReasoningEffort(AnthropicModelId.ClaudeOpus55, ReasoningEffort.None),
    ).toBe(ReasoningEffort.Medium);
    expect(
      resolveReasoningEffort(
        AnthropicModelId.ClaudeOpus55,
        ReasoningEffortSettingAuto,
      ),
    ).toBe(ReasoningEffort.Medium);
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

  it("never offers none on 3.8 Flash", () => {
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
      resolveReasoningEffort(OpenAiModelId.Gpt6Astra, ReasoningEffort.None),
    ).toBe(ReasoningEffort.Medium);
  });

  it("filters effort options per model and always includes auto", () => {
    const astra = reasoningEffortsForModel(OpenAiModelId.Gpt6Astra).map(
      (option) => option.id,
    );
    expect(astra[0]).toBe(ReasoningEffortSettingAuto);
    expect(astra).not.toContain(ReasoningEffort.None);
    expect(astra).toContain(ReasoningEffort.XHigh);
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
        model: OpenAiModelId.Gpt56Luna,
        reasoningEffort: ReasoningEffortSettingAuto,
      }),
    ).toEqual({
      modelId: OpenAiModelId.Gpt56Luna,
      reasoning: { effort: ReasoningEffort.Low },
    });
  });

  it("keeps known model lookup stable", () => {
    expect(isKnownModel(OpenAiModelId.Gpt56Terra)).toBe(true);
    expect(isKnownModel("gpt-5.5-pro")).toBe(false);
    expect(isKnownModel(GeminiModelId.Gemini38Flash)).toBe(true);
    expect(isKnownModel("gpt-5.4")).toBe(false);
  });

  it("keeps every model's default effort inside its supported set", () => {
    for (const model of [...OPENAI_MODELS, ...GEMINI_MODELS, ...ANTHROPIC_MODELS]) {
      if (model.supportedReasoningEfforts.length === 0) continue;
      expect(model.supportedReasoningEfforts).toContain(
        model.defaultReasoningEffort,
      );
    }
  });
});

describe("max output token resolution", () => {
  it("uses the model catalog default when no override is provided", () => {
    expect(resolveMaxOutputTokens(OpenAiModelId.Gpt6Sol)).toBe(16_384);
    expect(resolveMaxOutputTokens(OpenAiModelId.Gpt56Terra)).toBe(16_384);
    expect(resolveMaxOutputTokens(AnthropicModelId.ClaudeHaiku45)).toBe(8_192);
    expect(resolveMaxOutputTokens(GeminiModelId.Gemini35Flash)).toBe(8_192);
  });

  it("clamps Gemini 3.8 Flash overrides to the 64k ceiling", () => {
    expect(resolveModel(GeminiModelId.Gemini38Flash).maxOutputTokens).toBe(
      65_536,
    );
    expect(
      resolveMaxOutputTokens(GeminiModelId.Gemini38Flash, 100_000),
    ).toBe(65_536);
    expect(
      resolveMaxOutputTokens(GeminiModelId.Gemini38Flash, 32_768),
    ).toBe(32_768);
  });

  it("keeps Gemini 3.8 Flash's routine budget below its ceiling", () => {
    const flash = resolveModel(GeminiModelId.Gemini38Flash);
    expect(flash.maxOutputTokens).toBe(65_536);
    expect(flash.defaultMaxOutputTokens).toBe(16_384);

    expect(resolveMaxOutputTokens(GeminiModelId.Gemini38Flash)).toBe(16_384);
    expect(
      resolveMaxOutputTokens(GeminiModelId.Gemini38Flash, 40_000),
    ).toBe(40_000);
    expect(resolveMaxOutputTokens(GeminiModelId.Gemini38Flash, 65_536)).toBe(
      65_536,
    );
  });

  it("never lets a routine budget exceed its model ceiling", () => {
    for (const model of [...OPENAI_MODELS, ...GEMINI_MODELS, ...ANTHROPIC_MODELS]) {
      if (typeof model.defaultMaxOutputTokens !== "number") continue;
      expect(model.defaultMaxOutputTokens).toBeLessThanOrEqual(
        model.maxOutputTokens,
      );
      expect(resolveMaxOutputTokens(model.id)).toBe(
        model.defaultMaxOutputTokens,
      );
    }
  });

  it("clamps GPT-6 and Opus 5.5 overrides to the 128k ceiling", () => {
    expect(resolveModel(OpenAiModelId.Gpt6Sol).maxOutputTokens).toBe(128_000);
    expect(resolveModel(AnthropicModelId.ClaudeOpus55).maxOutputTokens).toBe(
      128_000,
    );
    expect(resolveMaxOutputTokens(OpenAiModelId.Gpt6Sol, 200_000)).toBe(128_000);
    expect(resolveMaxOutputTokens(OpenAiModelId.Gpt6Sol, 40_000)).toBe(40_000);
    expect(
      resolveMaxOutputTokens(AnthropicModelId.ClaudeOpus55, 200_000),
    ).toBe(128_000);
  });

  it("omits the ceiling for custom endpoints and quotes it for built-ins", () => {
    expect(
      modelMaxOutputTokensCeiling(`${CUSTOM_MODEL_PREFIX}llama-test`),
    ).toBeUndefined();
    expect(modelMaxOutputTokensCeiling(OpenAiModelId.Gpt6Sol)).toBe(128_000);
    expect(modelMaxOutputTokensCeiling(AnthropicModelId.ClaudeOpus55)).toBe(
      128_000,
    );
    expect(modelMaxOutputTokensCeiling(OpenAiModelId.Gpt56Terra)).toBe(16_384);
    expect(modelMaxOutputTokensCeiling(GeminiModelId.Gemini38Flash)).toBe(
      65_536,
    );
    expect(modelMaxOutputTokensCeiling("not-a-model")).toBe(128_000);
  });

  it("clamps built-in model overrides to the catalog maximum", () => {
    expect(resolveMaxOutputTokens(OpenAiModelId.Gpt6Sol, 200_000)).toBe(128_000);
    expect(resolveMaxOutputTokens(OpenAiModelId.Gpt6Sol, 4_096)).toBe(4_096);
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
    expect(resolveMaxOutputTokens(OpenAiModelId.Gpt6Sol, -1)).toBe(16_384);
    expect(resolveMaxOutputTokens(OpenAiModelId.Gpt6Sol, NaN)).toBe(16_384);
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
