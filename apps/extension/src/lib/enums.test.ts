import { describe, expect, it } from "vitest";
import { JOB_ANALYSIS_SCHEMA } from "./analysis-schema";
import {
  CONFIDENCE_LEVELS,
  FIT_SCORE_BANDS,
  FIT_VERDICTS,
  FitVerdict,
  GEMINI_MODEL_IDS,
  GEMINI_THINKING_LEVELS,
  GeminiModelId,
  GeminiThinkingLevel,
  HARD_BLOCKER_SCORE_CAP,
  JUDGE_IDS,
  OPENAI_MODEL_IDS,
  OpenAiModelId,
  PAGE_FIELD_KINDS,
  PageFieldKind,
  REASONING_EFFORTS,
  ReasoningEffort,
  SUGGESTION_ACTIONS,
  SuggestionAction,
  enumGuards,
  isConfidence,
  isFitVerdict,
  isGeminiModelId,
  isGeminiThinkingLevel,
  isOpenAiModelId,
  isReasoningEffort,
  isSuggestionAction,
} from "./enums";
import { GEMINI_MODELS, OPENAI_MODELS, toGeminiThinkingLevel } from "./models";
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
    }
  });

  it("model catalog IDs are exactly the GeminiModelId set", () => {
    expect(GEMINI_MODELS.map((model) => model.id)).toEqual([...GEMINI_MODEL_IDS]);
    for (const model of GEMINI_MODELS) {
      expect(isGeminiModelId(model.id)).toBe(true);
      for (const effort of model.supportedReasoningEfforts) {
        expect(isReasoningEffort(effort)).toBe(true);
        // Anything the UI offers must translate to a real Gemini level.
        expect(isGeminiThinkingLevel(toGeminiThinkingLevel(effort))).toBe(true);
      }
    }
  });

  it("keeps the Gemini thinking level vocabulary unique and complete", () => {
    expect(GEMINI_THINKING_LEVELS).toEqual([
      GeminiThinkingLevel.Minimal,
      GeminiThinkingLevel.Low,
      GeminiThinkingLevel.Medium,
      GeminiThinkingLevel.High,
    ]);
    expect(new Set(GEMINI_THINKING_LEVELS).size).toBe(
      GEMINI_THINKING_LEVELS.length,
    );
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
    expect(isOpenAiModelId(OpenAiModelId.Gpt6Sol)).toBe(true);
    expect(isOpenAiModelId(OpenAiModelId.Gpt6Astra)).toBe(true);
    expect(isOpenAiModelId(OpenAiModelId.Gpt6Luna)).toBe(true);
    expect(isOpenAiModelId(OpenAiModelId.Gpt56Terra)).toBe(true);
    expect(isOpenAiModelId("gpt-5.5-pro")).toBe(false);
    expect(isOpenAiModelId("gpt-5.4")).toBe(false);
    expect(isGeminiModelId(GeminiModelId.Gemini38Flash)).toBe(true);
    expect(isGeminiModelId(GeminiModelId.Gemini35FlashLite)).toBe(true);
    // Gemini 3.8 Flash Cyber is Fairwind-only and deliberately not offered.
    expect(isGeminiModelId("gemini-3.8-flash-cyber")).toBe(false);
    expect(isGeminiThinkingLevel(GeminiThinkingLevel.High)).toBe(true);
    expect(isGeminiThinkingLevel("ultra")).toBe(false);
    expect(enumGuards.isGeminiModelId(GeminiModelId.Gemini38Flash)).toBe(true);
    expect(enumGuards.isGeminiThinkingLevel(GeminiThinkingLevel.Minimal)).toBe(
      true,
    );
    expect(enumGuards.isJudgeId(JUDGE_IDS[0]!)).toBe(true);
    expect(enumGuards.isJudgeId("nope")).toBe(false);
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
