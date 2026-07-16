import { describe, expect, it } from "vitest";
import { JOB_ANALYSIS_SCHEMA } from "./analysis-schema";
import {
  CONFIDENCE_LEVELS,
  FIT_SCORE_BANDS,
  FIT_VERDICTS,
  FitVerdict,
  HARD_BLOCKER_SCORE_CAP,
  JUDGE_IDS,
  OPENAI_MODEL_IDS,
  OpenAiModelId,
  PAGE_FIELD_KINDS,
  PageFieldKind,
  REASONING_EFFORTS,
  ReasoningEffort,
  SEARCH_CONTEXT_SIZES,
  SUGGESTION_ACTIONS,
  SuggestionAction,
  isConfidence,
  isFitVerdict,
  isOpenAiModelId,
  isReasoningEffort,
  isSuggestionAction,
} from "./enums";
import { OPENAI_MODELS } from "./models";
import { verdictForScore } from "./fit";

describe("domain enums cross-validation", () => {
  it("JSON schema enums match the domain catalog exactly", () => {
    const schema = JOB_ANALYSIS_SCHEMA.properties;
    expect([...schema.fit.properties.verdict.enum]).toEqual([...FIT_VERDICTS]);
    expect([...schema.suggestions.items.properties.action.enum]).toEqual([
      ...SUGGESTION_ACTIONS,
    ]);
    expect([...schema.suggestions.items.properties.confidence.enum]).toEqual([
      ...CONFIDENCE_LEVELS,
    ]);
  });

  it("model catalog IDs are exactly the OpenAiModelId set", () => {
    expect(OPENAI_MODELS.map((model) => model.id)).toEqual([...OPENAI_MODEL_IDS]);
    for (const model of OPENAI_MODELS) {
      expect(isOpenAiModelId(model.id)).toBe(true);
      for (const effort of model.supportedReasoningEfforts) {
        expect(isReasoningEffort(effort)).toBe(true);
      }
      expect(SEARCH_CONTEXT_SIZES).toContain(model.searchContextSize);
    }
  });

  it("fit score bands cover 0–100 without gaps or overlaps", () => {
    expect(FIT_SCORE_BANDS[0]?.min).toBe(90);
    expect(FIT_SCORE_BANDS.at(-1)?.min).toBe(0);

    for (let score = 0; score <= 100; score += 1) {
      const matches = FIT_SCORE_BANDS.filter(
        (band) => score >= band.min && score <= band.max,
      );
      expect(matches).toHaveLength(1);
      expect(verdictForScore(score)).toBe(matches[0].verdict);
    }
  });

  it("hard-blocker cap sits inside the mixed band", () => {
    expect(HARD_BLOCKER_SCORE_CAP).toBeGreaterThanOrEqual(50);
    expect(HARD_BLOCKER_SCORE_CAP).toBeLessThan(75);
    expect(verdictForScore(HARD_BLOCKER_SCORE_CAP)).toBe(FitVerdict.Mixed);
  });

  it("type guards accept catalog values only", () => {
    expect(isFitVerdict(FitVerdict.Strong)).toBe(true);
    expect(isFitVerdict("ok")).toBe(false);
    expect(isSuggestionAction(SuggestionAction.Fill)).toBe(true);
    expect(isSuggestionAction("submit")).toBe(false);
    expect(isConfidence("high")).toBe(true);
    expect(isConfidence("extreme")).toBe(false);
    expect(isReasoningEffort(ReasoningEffort.Max)).toBe(true);
    expect(isReasoningEffort("ultra")).toBe(false);
    expect(isOpenAiModelId(OpenAiModelId.Gpt56Terra)).toBe(true);
    expect(isOpenAiModelId("gpt-5.5-pro")).toBe(false);
  });

  it("judge id catalog is non-empty and unique", () => {
    expect(JUDGE_IDS.length).toBeGreaterThan(10);
    expect(new Set(JUDGE_IDS).size).toBe(JUDGE_IDS.length);
  });

  it("reasoning effort catalog includes OpenAI GPT-5.6 max", () => {
    expect(REASONING_EFFORTS).toEqual([
      ReasoningEffort.None,
      ReasoningEffort.Low,
      ReasoningEffort.Medium,
      ReasoningEffort.High,
      ReasoningEffort.XHigh,
      ReasoningEffort.Max,
    ]);
  });

  it("page field kinds stay unique", () => {
    expect(PAGE_FIELD_KINDS).toContain(PageFieldKind.Select);
    expect(new Set(PAGE_FIELD_KINDS).size).toBe(PAGE_FIELD_KINDS.length);
  });
});
