import { describe, expect, it } from "vitest";
import {
  OpenAiModelId,
  ReasoningEffort,
  ReasoningEffortSettingAuto,
  SearchContextSize,
} from "./enums";
import {
  DEFAULT_MODEL_ID,
  isKnownModel,
  OPENAI_MODELS,
  resolveAnalysisConfig,
  resolveModel,
  resolveReasoningEffort,
  reasoningEffortsForModel,
} from "./models";

describe("OpenAI model catalog", () => {
  it("includes the extended 5.5 and 5.6 set without pro variants", () => {
    expect(OPENAI_MODELS.map((model) => model.id)).toEqual([
      OpenAiModelId.Gpt56Terra,
      OpenAiModelId.Gpt56Sol,
      OpenAiModelId.Gpt56Luna,
      OpenAiModelId.Gpt55,
    ]);
  });

  it("defaults to Terra", () => {
    expect(DEFAULT_MODEL_ID).toBe(OpenAiModelId.Gpt56Terra);
    expect(resolveModel("not-a-model").id).toBe(OpenAiModelId.Gpt56Terra);
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
      searchContextSize: SearchContextSize.High,
    });

    expect(
      resolveAnalysisConfig({
        model: OpenAiModelId.Gpt55,
        reasoningEffort: ReasoningEffortSettingAuto,
      }),
    ).toEqual({
      modelId: OpenAiModelId.Gpt55,
      reasoning: { effort: ReasoningEffort.Medium },
      searchContextSize: SearchContextSize.Medium,
    });
  });

  it("keeps known model lookup stable", () => {
    expect(isKnownModel(OpenAiModelId.Gpt56Terra)).toBe(true);
    expect(isKnownModel("gpt-5.5-pro")).toBe(false);
  });
});
