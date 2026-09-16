/**
 * Single source of truth for domain values shared by:
 * - TypeScript types
 * - OpenAI JSON schema enums
 * - runtime sanitize / judges / UI
 *
 * Prefer these constants over raw string literals.
 */

// ── Fit ──────────────────────────────────────────────────────────────

export const FitVerdict = {
  Excellent: "excellent",
  Strong: "strong",
  Mixed: "mixed",
  Weak: "weak",
} as const;

export type FitVerdict = (typeof FitVerdict)[keyof typeof FitVerdict];

export const FIT_VERDICTS = [
  FitVerdict.Excellent,
  FitVerdict.Strong,
  FitVerdict.Mixed,
  FitVerdict.Weak,
] as const;

/** Inclusive score bands. Keep ordered high → low. */
export const FIT_SCORE_BANDS = [
  {
    min: 90,
    max: 100,
    verdict: FitVerdict.Excellent,
    guidance:
      "meets essentially all hard requirements; no hard blockers; strong evidence in the profile",
  },
  {
    min: 75,
    max: 89,
    verdict: FitVerdict.Strong,
    guidance:
      "meets hard requirements with only minor gaps; no hard blockers",
  },
  {
    min: 50,
    max: 74,
    verdict: FitVerdict.Mixed,
    guidance:
      "real hard gaps or weak evidence, but still workable with clear caveats",
  },
  {
    min: 0,
    max: 49,
    verdict: FitVerdict.Weak,
    guidance:
      "missing core hard requirements and/or one or more hard blockers",
  },
] as const;

/** Max allowed fit score when any hard blocker is present. */
export const HARD_BLOCKER_SCORE_CAP = 55;

/** Token used for resume file-upload fields when an attachment exists. */
export const RESUME_FILE_TOKEN = "__RESUME_FILE__" as const;

// ── Field kinds ──────────────────────────────────────────────────────

export const PageFieldKind = {
  Text: "text",
  Textarea: "textarea",
  Select: "select",
  Radio: "radio",
  Checkbox: "checkbox",
  File: "file",
  Contenteditable: "contenteditable",
} as const;

export type PageFieldKind =
  (typeof PageFieldKind)[keyof typeof PageFieldKind];

export const PAGE_FIELD_KINDS = [
  PageFieldKind.Text,
  PageFieldKind.Textarea,
  PageFieldKind.Select,
  PageFieldKind.Radio,
  PageFieldKind.Checkbox,
  PageFieldKind.File,
  PageFieldKind.Contenteditable,
] as const;

// ── Field suggestions ────────────────────────────────────────────────

export const SuggestionAction = {
  Fill: "fill",
  Review: "review",
  Skip: "skip",
} as const;

export type SuggestionAction =
  (typeof SuggestionAction)[keyof typeof SuggestionAction];

export const SUGGESTION_ACTIONS = [
  SuggestionAction.Fill,
  SuggestionAction.Review,
  SuggestionAction.Skip,
] as const;

export const Confidence = {
  High: "high",
  Medium: "medium",
  Low: "low",
} as const;

export type Confidence = (typeof Confidence)[keyof typeof Confidence];

export const CONFIDENCE_LEVELS = [
  Confidence.High,
  Confidence.Medium,
  Confidence.Low,
] as const;

// ── Autofill mode ─────────────────────────────────────────────────────

export const AutofillMode = {
  AI: "ai",
  Direct: "direct",
} as const;

export type AutofillMode = (typeof AutofillMode)[keyof typeof AutofillMode];

export const AUTOFILL_MODES = [AutofillMode.AI, AutofillMode.Direct] as const;

// ── OpenAI reasoning ─────────────────────────────────────────────────

export const ReasoningEffort = {
  None: "none",
  Low: "low",
  Medium: "medium",
  High: "high",
  XHigh: "xhigh",
  Max: "max",
} as const;

export type ReasoningEffort =
  (typeof ReasoningEffort)[keyof typeof ReasoningEffort];

export const REASONING_EFFORTS = [
  ReasoningEffort.None,
  ReasoningEffort.Low,
  ReasoningEffort.Medium,
  ReasoningEffort.High,
  ReasoningEffort.XHigh,
  ReasoningEffort.Max,
] as const;

export const ReasoningEffortSettingAuto = "auto" as const;

export type ReasoningEffortSetting =
  | typeof ReasoningEffortSettingAuto
  | ReasoningEffort;

export const REASONING_EFFORT_SETTINGS = [
  ReasoningEffortSettingAuto,
  ...REASONING_EFFORTS,
] as const;

// ── OpenAI model IDs ─────────────────────────────────────────────────

export const OpenAiModelId = {
  Gpt56Terra: "gpt-5.6-terra",
  Gpt56Sol: "gpt-5.6-sol",
  Gpt56Luna: "gpt-5.6-luna",
  Gpt55: "gpt-5.5",
  Gpt55Pro: "gpt-5.5-pro",
} as const;

export type OpenAiModelId = (typeof OpenAiModelId)[keyof typeof OpenAiModelId];

export const OPENAI_MODEL_IDS = [
  OpenAiModelId.Gpt56Terra,
  OpenAiModelId.Gpt56Sol,
  OpenAiModelId.Gpt56Luna,
  OpenAiModelId.Gpt55,
  OpenAiModelId.Gpt55Pro,
] as const;

// ── Gemini model IDs ─────────────────────────────────────────────────

/**
 * Current Gemini text models offered by the Gemini provider.
 *
 * `gemini-3.8-flash-cyber` is intentionally absent: Google exposes it only to
 * the Fairwind Program (trusted defenders), so it is not usable with a regular
 * Gemini API key.
 */
export const GeminiModelId = {
  Gemini38Flash: "gemini-3.8-flash",
  Gemini37Flash: "gemini-3.7-flash",
  Gemini36Flash: "gemini-3.6-flash",
  Gemini35Flash: "gemini-3.5-flash",
  Gemini35FlashLite: "gemini-3.5-flash-lite",
} as const;

export type GeminiModelId =
  (typeof GeminiModelId)[keyof typeof GeminiModelId];

export const GEMINI_MODEL_IDS = [
  GeminiModelId.Gemini38Flash,
  GeminiModelId.Gemini37Flash,
  GeminiModelId.Gemini36Flash,
  GeminiModelId.Gemini35Flash,
  GeminiModelId.Gemini35FlashLite,
] as const;

// ── Anthropic model IDs ───────────────────────────────────────────────

/** Current first-party Claude models offered by the Anthropic provider. */
export const AnthropicModelId = {
  ClaudeOpus5: "claude-opus-5",
  ClaudeSonnet5: "claude-sonnet-5",
  ClaudeHaiku45: "claude-haiku-4-5-20251001",
} as const;

export type AnthropicModelId =
  (typeof AnthropicModelId)[keyof typeof AnthropicModelId];

export const ANTHROPIC_MODEL_IDS = [
  AnthropicModelId.ClaudeOpus5,
  AnthropicModelId.ClaudeSonnet5,
  AnthropicModelId.ClaudeHaiku45,
] as const;

// ── Gemini thinking ──────────────────────────────────────────────────

/** Values accepted by `generationConfig.thinkingConfig.thinkingLevel`. */
export const GeminiThinkingLevel = {
  Minimal: "minimal",
  Low: "low",
  Medium: "medium",
  High: "high",
} as const;

export type GeminiThinkingLevel =
  (typeof GeminiThinkingLevel)[keyof typeof GeminiThinkingLevel];

export const GEMINI_THINKING_LEVELS = [
  GeminiThinkingLevel.Minimal,
  GeminiThinkingLevel.Low,
  GeminiThinkingLevel.Medium,
  GeminiThinkingLevel.High,
] as const;

// ── Eval judges ──────────────────────────────────────────────────────

export const JudgeId = {
  FitScoreRange: "fit.score_range",
  FitVerdictBand: "fit.verdict_band",
  FitHardBlockerCap: "fit.hard_blocker_cap",
  FitRequiredBlockers: "fit.required_blockers",
  FieldsCoverage: "fields.coverage",
  FieldsUniqueIds: "fields.unique_ids",
  FieldsSelectOptions: "fields.select_options",
  FieldsFillEvidence: "fields.fill_evidence",
  FieldsEmptyFill: "fields.empty_fill",
  FieldsSensitive: "fields.sensitive",
  FieldsExpectations: "fields.expectations",
  WritingBannedPhrases: "writing.banned_phrases",
  TruthMustNotClaim: "truth.must_not_claim",
  ResearchAttempted: "research.attempted",
  ResearchSourceUrls: "research.source_urls",
  LiveRuntime: "live.runtime",
} as const;

export type JudgeId = (typeof JudgeId)[keyof typeof JudgeId];

export const JUDGE_IDS = [
  JudgeId.FitScoreRange,
  JudgeId.FitVerdictBand,
  JudgeId.FitHardBlockerCap,
  JudgeId.FitRequiredBlockers,
  JudgeId.FieldsCoverage,
  JudgeId.FieldsUniqueIds,
  JudgeId.FieldsSelectOptions,
  JudgeId.FieldsFillEvidence,
  JudgeId.FieldsEmptyFill,
  JudgeId.FieldsSensitive,
  JudgeId.FieldsExpectations,
  JudgeId.WritingBannedPhrases,
  JudgeId.TruthMustNotClaim,
  JudgeId.ResearchAttempted,
  JudgeId.ResearchSourceUrls,
  JudgeId.LiveRuntime,
] as const;

// ── Type guards ──────────────────────────────────────────────────────

export function isFitVerdict(value: string): value is FitVerdict {
  return (FIT_VERDICTS as readonly string[]).includes(value);
}

export function isSuggestionAction(value: string): value is SuggestionAction {
  return (SUGGESTION_ACTIONS as readonly string[]).includes(value);
}

export function isConfidence(value: string): value is Confidence {
  return (CONFIDENCE_LEVELS as readonly string[]).includes(value);
}

export function isAutofillMode(value: string): value is AutofillMode {
  return (AUTOFILL_MODES as readonly string[]).includes(value);
}

export function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value);
}

export function isReasoningEffortSetting(
  value: string,
): value is ReasoningEffortSetting {
  return (REASONING_EFFORT_SETTINGS as readonly string[]).includes(value);
}

export function isOpenAiModelId(value: string): value is OpenAiModelId {
  return (OPENAI_MODEL_IDS as readonly string[]).includes(value);
}

export function isAnthropicModelId(value: string): value is AnthropicModelId {
  return (ANTHROPIC_MODEL_IDS as readonly string[]).includes(value);
}

export function isGeminiModelId(value: string): value is GeminiModelId {
  return (GEMINI_MODEL_IDS as readonly string[]).includes(value);
}

export function isGeminiThinkingLevel(
  value: string,
): value is GeminiThinkingLevel {
  return (GEMINI_THINKING_LEVELS as readonly string[]).includes(value);
}

function isJudgeId(value: string): value is JudgeId {
  return (JUDGE_IDS as readonly string[]).includes(value);
}

// Keep type-guards reachable for tree-shaking-safe consumers / future eval tooling.
export const enumGuards = {
  isAnthropicModelId,
  isGeminiModelId,
  isGeminiThinkingLevel,
  isJudgeId,
} as const;
