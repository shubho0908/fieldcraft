import { describe, expect, it } from "vitest";
import {
  OpenAiModelId,
  ReasoningEffort,
  ReasoningEffortSettingAuto,
} from "./enums";
import {
  CUSTOM_MODEL_PREFIX,
  DEFAULT_MODEL_ID,
  GEMINI_MODELS,
  isKnownModel,
  OPENAI_MODELS,
  resolveAnalysisConfig,
  resolveMaxOutputTokens,
  resolveModel,
  resolveReasoningEffort,
  reasoningEffortsForModel,
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
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
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
    expect(isKnownModel("gpt-5.4")).toBe(false);
  });
});

describe("max output token resolution", () => {
  it("uses the model catalog default when no override is provided", () => {
    expect(resolveMaxOutputTokens(OpenAiModelId.Gpt56Terra)).toBe(16_384);
    expect(resolveMaxOutputTokens(OpenAiModelId.Gpt55)).toBe(8_192);
    expect(resolveMaxOutputTokens("gemini-3.5-flash")).toBe(8_192);
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
