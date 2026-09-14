/**
 * AI model catalog (multi-provider).
 * Effort / search enums live in ./enums (single source of truth).
 */

import {
  GeminiModelId,
  GeminiThinkingLevel,
  OpenAiModelId,
  ReasoningEffort,
  ReasoningEffortSettingAuto,
  isReasoningEffortSetting,
  type GeminiThinkingLevel as GeminiThinkingLevelType,
  type ReasoningEffort as ReasoningEffortType,
  type ReasoningEffortSetting,
} from "./enums";

export type { ReasoningEffortSetting };
export {
  GeminiModelId,
  GeminiThinkingLevel,
  OpenAiModelId,
  ReasoningEffort,
  ReasoningEffortSettingAuto,
  isReasoningEffortSetting,
};

export const Provider = {
  OpenAI: "openai",
  Gemini: "gemini",
  Custom: "custom",
} as const;

export type Provider = (typeof Provider)[keyof typeof Provider];

export const CustomProtocol = {
  OpenAI: "openai",
  Anthropic: "anthropic",
} as const;

export type CustomProtocol =
  (typeof CustomProtocol)[keyof typeof CustomProtocol];

export function isCustomProtocol(value: string): value is CustomProtocol {
  return Object.values(CustomProtocol).includes(value as CustomProtocol);
}

/** Custom model ids are encoded as `custom:<actual-model-id>` so settings.model stays a single source of truth. */
export const CUSTOM_MODEL_PREFIX = "custom:" as const;

export type CustomModelId = `${typeof CUSTOM_MODEL_PREFIX}${string}`;

export interface ReasoningEffortOption {
  id: ReasoningEffortSetting;
  label: string;
  description: string;
}

export interface ModelOption {
  id: string;
  provider: Provider;
  label: string;
  description: string;
  defaultReasoningEffort: ReasoningEffortType;
  supportedReasoningEfforts: readonly ReasoningEffortType[];
  /** Hard provider ceiling for this model; the API rejects requests above it. */
  maxOutputTokens: number;
  /**
   * Routine request budget used when the user has not set an override.
   *
   * Kept separate from {@link maxOutputTokens} when a model's documented ceiling
   * is far above what an analysis needs, so ordinary runs don't declare a huge
   * response allowance. Omit it when the ceiling is already a sensible budget.
   */
  defaultMaxOutputTokens?: number;
}

/** @deprecated Use ModelOption */
export type OpenAiModelOption = ModelOption;

export interface ResolvedAnalysisConfig {
  modelId: string;
  reasoning: {
    effort: ReasoningEffortType;
  };
}

export const REASONING_EFFORT_OPTIONS: readonly ReasoningEffortOption[] = [
  {
    id: ReasoningEffortSettingAuto,
    label: "Auto",
    description: "Use the model’s recommended default",
  },
  {
    id: ReasoningEffort.None,
    label: "None",
    description: "Fastest · no extra reasoning",
  },
  {
    id: ReasoningEffort.Low,
    label: "Low",
    description: "Light reasoning · lower latency",
  },
  {
    id: ReasoningEffort.Medium,
    label: "Medium",
    description: "Balanced default for analysis",
  },
  {
    id: ReasoningEffort.High,
    label: "High",
    description: "Harder roles · deeper checks",
  },
  {
    id: ReasoningEffort.XHigh,
    label: "Extra high",
    description: "Longer agentic research",
  },
  {
    id: ReasoningEffort.Max,
    label: "Max",
    description: "GPT-5.6 only · maximum deliberation",
  },
] as const;

const GPT_5_6_EFFORTS = [
  ReasoningEffort.None,
  ReasoningEffort.Low,
  ReasoningEffort.Medium,
  ReasoningEffort.High,
  ReasoningEffort.XHigh,
  ReasoningEffort.Max,
] as const satisfies readonly ReasoningEffortType[];

const GPT_5_5_EFFORTS = [
  ReasoningEffort.None,
  ReasoningEffort.Low,
  ReasoningEffort.Medium,
  ReasoningEffort.High,
  ReasoningEffort.XHigh,
] as const satisfies readonly ReasoningEffortType[];

const GPT_5_5_PRO_EFFORTS = [
  ReasoningEffort.Medium,
  ReasoningEffort.High,
  ReasoningEffort.XHigh,
] as const satisfies readonly ReasoningEffortType[];

/** Supported OpenAI Responses models and per-tier analysis defaults. */
export const OPENAI_MODELS: readonly ModelOption[] = [
  {
    provider: Provider.OpenAI,
    id: OpenAiModelId.Gpt56Terra,
    label: "GPT-5.6 Terra",
    description: "Balanced quality and cost",
    defaultReasoningEffort: ReasoningEffort.Medium,
    supportedReasoningEfforts: GPT_5_6_EFFORTS,
    maxOutputTokens: 16_384,
  },
  {
    provider: Provider.OpenAI,
    id: OpenAiModelId.Gpt56Sol,
    label: "GPT-5.6 Sol",
    description: "Best quality",
    defaultReasoningEffort: ReasoningEffort.High,
    supportedReasoningEfforts: GPT_5_6_EFFORTS,
    maxOutputTokens: 16_384,
  },
  {
    provider: Provider.OpenAI,
    id: OpenAiModelId.Gpt56Luna,
    label: "GPT-5.6 Luna",
    description: "Lowest cost",
    defaultReasoningEffort: ReasoningEffort.Low,
    supportedReasoningEfforts: GPT_5_6_EFFORTS,
    maxOutputTokens: 16_384,
  },
  {
    provider: Provider.OpenAI,
    id: OpenAiModelId.Gpt55,
    label: "GPT-5.5",
    description: "Prior frontier, stable fallback",
    defaultReasoningEffort: ReasoningEffort.Medium,
    supportedReasoningEfforts: GPT_5_5_EFFORTS,
    maxOutputTokens: 8_192,
  },
  {
    provider: Provider.OpenAI,
    id: OpenAiModelId.Gpt55Pro,
    label: "GPT-5.5 Pro",
    description: "Highest-quality GPT-5.5 analysis",
    defaultReasoningEffort: ReasoningEffort.High,
    supportedReasoningEfforts: GPT_5_5_PRO_EFFORTS,
    maxOutputTokens: 8_192,
  },
] as const;

/**
 * Gemini 3.8 Flash thinking levels.
 *
 * Google documents tunable `low | medium | high` for this model and states that
 * `minimal` is not supported, so `ReasoningEffort.None` is deliberately absent
 * and resolves to the model default instead.
 */
const GEMINI_3_8_FLASH_EFFORTS = [
  ReasoningEffort.Low,
  ReasoningEffort.Medium,
  ReasoningEffort.High,
] as const satisfies readonly ReasoningEffortType[];

/** Current Gemini text models that support structured output. */
export const GEMINI_MODELS: readonly ModelOption[] = [
  {
    provider: Provider.Gemini,
    id: GeminiModelId.Gemini38Flash,
    label: "Gemini 3.8 Flash",
    description:
      "Most intelligent Flash model for long-horizon engineering and agents",
    defaultReasoningEffort: ReasoningEffort.Medium,
    supportedReasoningEfforts: GEMINI_3_8_FLASH_EFFORTS,
    // Documented 64k ceiling, but an analysis response is a bounded JSON object.
    // 16,384 leaves headroom for thinking tokens (which count against this
    // budget) without declaring a 64k allowance on every ordinary run.
    maxOutputTokens: 65_536,
    defaultMaxOutputTokens: 16_384,
  },
  {
    provider: Provider.Gemini,
    id: GeminiModelId.Gemini37Flash,
    label: "Gemini 3.7 Flash",
    description: "Most intelligent Gemini workhorse for coding and agents",
    defaultReasoningEffort: ReasoningEffort.None,
    supportedReasoningEfforts: [],
    maxOutputTokens: 8_192,
  },
  {
    provider: Provider.Gemini,
    id: GeminiModelId.Gemini36Flash,
    label: "Gemini 3.6 Flash",
    description: "Fast workhorse for coding, knowledge work, and multimodal tasks",
    defaultReasoningEffort: ReasoningEffort.None,
    supportedReasoningEfforts: [],
    maxOutputTokens: 8_192,
  },
  {
    provider: Provider.Gemini,
    id: GeminiModelId.Gemini35Flash,
    label: "Gemini 3.5 Flash",
    description: "Frontier performance at higher speed",
    defaultReasoningEffort: ReasoningEffort.None,
    supportedReasoningEfforts: [],
    maxOutputTokens: 8_192,
  },
  {
    provider: Provider.Gemini,
    id: GeminiModelId.Gemini35FlashLite,
    label: "Gemini 3.5 Flash-Lite",
    description: "Fast, economical high-volume analysis",
    defaultReasoningEffort: ReasoningEffort.None,
    supportedReasoningEfforts: [],
    maxOutputTokens: 8_192,
  },
] as const;

/** Custom provider placeholder. The real model id lives after `custom:` in settings.model. */
const CUSTOM_MODEL_PLACEHOLDER: ModelOption = {
  provider: Provider.Custom,
  id: `${CUSTOM_MODEL_PREFIX}`,
  label: "Custom model",
  description: "Any OpenAI- or Anthropic-compatible endpoint (Fireworks, Together, Groq, OpenRouter, Anthropic, MiniMax…)",
  defaultReasoningEffort: ReasoningEffort.None,
  supportedReasoningEfforts: [ReasoningEffort.None],
  maxOutputTokens: 4_096,
} as const;

/** Combined catalog used by the UI and runtime. */
export const AI_MODELS: readonly ModelOption[] = [
  ...OPENAI_MODELS,
  ...GEMINI_MODELS,
  CUSTOM_MODEL_PLACEHOLDER,
] as const;

export function isProvider(value: string): value is Provider {
  return Object.values(Provider).includes(value as Provider);
}

export function modelsForProvider(provider: Provider): readonly ModelOption[] {
  if (provider === Provider.Custom) return [CUSTOM_MODEL_PLACEHOLDER];
  return AI_MODELS.filter((model) => model.provider === provider);
}

export function defaultModelForProvider(provider: Provider): ModelOption {
  if (provider === Provider.Custom) return CUSTOM_MODEL_PLACEHOLDER;
  return modelsForProvider(provider)[0] ?? AI_MODELS[0];
}

/** Single default model for Analyze + Evals when nothing is saved yet. */
export const DEFAULT_MODEL_ID: string = AI_MODELS[0].id;

/** Analyze UI default: Auto → model.defaultReasoningEffort. */
export const DEFAULT_REASONING_EFFORT: ReasoningEffortSetting =
  ReasoningEffortSettingAuto;

/** Live fixture evals default to the same catalog model. */
export const DEFAULT_EVAL_MODEL_ID: string = DEFAULT_MODEL_ID;

/**
 * Live fixture evals prefer high reasoning. Prefer this over hardcoding
 * `ReasoningEffort.High` at call sites — use preferredEvalReasoningEffort()
 * when clamping to a specific model.
 */
export const DEFAULT_EVAL_REASONING_EFFORT: ReasoningEffortSetting =
  ReasoningEffort.High;

/** Connection probe stays cheap and fixed. */
export const CONNECTION_TEST_REASONING_EFFORT: ReasoningEffortType =
  ReasoningEffort.None;

function createCustomModelOption(actualModelId: string): ModelOption {
  return {
    ...CUSTOM_MODEL_PLACEHOLDER,
    id: `${CUSTOM_MODEL_PREFIX}${actualModelId}`,
    description: actualModelId || "Enter a model ID",
  };
}

export function customModelId(modelId: string): string {
  return modelId.startsWith(CUSTOM_MODEL_PREFIX)
    ? modelId.slice(CUSTOM_MODEL_PREFIX.length)
    : "";
}

export function isCustomModelId(modelId: string): boolean {
  return modelId.startsWith(CUSTOM_MODEL_PREFIX);
}

/**
 * Normalizes a user-pasted OpenAI-compatible base URL.
 * Many providers document the full `/chat/completions` endpoint, but the SDK
 * appends that path itself, so strip it here to avoid `.../chat/completions/chat/completions`.
 * Also ensure the URL ends at the API version root (`/v1`) because the SDK
 * expects that path segment to precede `/chat/completions`.
 */
export function sanitizeCustomBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl
    .trim()
    .replace(/\/chat\/completions\/?$/i, "")
    .replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/\/v\d+$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
}

/**
 * Normalizes a user-pasted Anthropic-compatible base URL.
 * The AI SDK appends `/messages` to the base URL, so the base must end at the
 * API version root (`/v1`). Strip accidental endpoint suffixes and add `/v1`
 * when no version segment is present.
 */
export function sanitizeAnthropicBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl
    .trim()
    .replace(/\/chat\/completions\/?$/i, "")
    .replace(/\/messages\/?$/i, "")
    .replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/\/v\d+$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
}

export function isKnownModel(modelId: string): boolean {
  return (
    AI_MODELS.some((model) => model.id === modelId) || isCustomModelId(modelId)
  );
}

export function resolveModel(modelId: string): ModelOption {
  const catalog = AI_MODELS.find((model) => model.id === modelId);
  if (catalog) return catalog;
  if (isCustomModelId(modelId)) {
    return createCustomModelOption(customModelId(modelId));
  }
  return AI_MODELS[0];
}

/** Effort options valid for the selected model, always including Auto. */
export function reasoningEffortsForModel(
  modelId: string,
): readonly ReasoningEffortOption[] {
  const model = resolveModel(modelId);
  const supported = new Set<string>(model.supportedReasoningEfforts);
  return REASONING_EFFORT_OPTIONS.filter(
    (option) =>
      option.id === ReasoningEffortSettingAuto || supported.has(option.id),
  );
}

export function resolveReasoningEffort(
  modelId: string,
  setting: ReasoningEffortSetting,
): ReasoningEffortType {
  const model = resolveModel(modelId);
  if (setting === ReasoningEffortSettingAuto) return model.defaultReasoningEffort;
  if (model.supportedReasoningEfforts.includes(setting)) return setting;
  return model.defaultReasoningEffort;
}

/**
 * Eval preference: DEFAULT_EVAL_REASONING_EFFORT when the model supports it,
 * otherwise the model’s own default effort.
 */
export function preferredEvalReasoningEffort(
  modelId: string,
): ReasoningEffortSetting {
  const model = resolveModel(modelId);
  if (
    DEFAULT_EVAL_REASONING_EFFORT !== ReasoningEffortSettingAuto &&
    model.supportedReasoningEfforts.includes(DEFAULT_EVAL_REASONING_EFFORT)
  ) {
    return DEFAULT_EVAL_REASONING_EFFORT;
  }
  return model.defaultReasoningEffort;
}

/**
 * Gemini `thinkingConfig.thinkingLevel` for each Fieldcraft reasoning effort.
 *
 * Fieldcraft's effort vocabulary mirrors OpenAI's (`none`…`max`) while Gemini
 * only accepts `minimal | low | medium | high`, so `xhigh` and `max` both cap
 * at `high`, and `none` maps to the cheapest level Gemini understands.
 *
 * Callers must pass an effort already clamped by {@link resolveReasoningEffort}.
 * A model that rejects a level (3.8 Flash does not accept `minimal`) never lists
 * the matching effort in `supportedReasoningEfforts`, so clamping prevents an
 * unsupported level from ever reaching the API.
 */
const GEMINI_THINKING_LEVEL_BY_EFFORT: Record<
  ReasoningEffortType,
  GeminiThinkingLevelType
> = {
  [ReasoningEffort.None]: GeminiThinkingLevel.Minimal,
  [ReasoningEffort.Low]: GeminiThinkingLevel.Low,
  [ReasoningEffort.Medium]: GeminiThinkingLevel.Medium,
  [ReasoningEffort.High]: GeminiThinkingLevel.High,
  [ReasoningEffort.XHigh]: GeminiThinkingLevel.High,
  [ReasoningEffort.Max]: GeminiThinkingLevel.High,
};

/** Translate a resolved reasoning effort into a Gemini thinking level. */
export function toGeminiThinkingLevel(
  effort: ReasoningEffortType,
): GeminiThinkingLevelType {
  return GEMINI_THINKING_LEVEL_BY_EFFORT[effort];
}

/** Hard sanity ceiling for any user-supplied max output tokens value. */
const MAX_OUTPUT_TOKENS_SANITY = 1_000_000;

/**
 * Human-readable ceiling for the Settings "Max output tokens" hint.
 *
 * Returns `undefined` for custom endpoints: their real limit is whatever the
 * third-party endpoint accepts (guarded only by the sanity limit), so quoting
 * the custom placeholder's conservative default would be misleading.
 */
export function modelMaxOutputTokensCeiling(modelId: string): number | undefined {
  const model = resolveModel(modelId);
  if (model.provider === Provider.Custom) return undefined;
  return model.maxOutputTokens;
}

/**
 * Resolve the maximum output tokens for a model.
 *
 * Built-in models start from their routine request budget and are always capped
 * to their documented ceiling, so a user cannot exceed a known provider limit.
 * Custom providers are unknown and subscription-tier dependent, so we default to
 * a conservative value (4096) and allow the user to raise it if their endpoint
 * supports more.
 */
export function resolveMaxOutputTokens(
  modelId: string,
  userValue?: number,
): number {
  const model = resolveModel(modelId);
  const userMax =
    typeof userValue === "number" && Number.isFinite(userValue) && userValue > 0
      ? Math.round(userValue)
      : undefined;

  if (model.provider === Provider.Custom) {
    return Math.min(
      userMax ?? model.maxOutputTokens,
      MAX_OUTPUT_TOKENS_SANITY,
    );
  }

  return Math.min(
    userMax ?? model.defaultMaxOutputTokens ?? model.maxOutputTokens,
    model.maxOutputTokens,
    MAX_OUTPUT_TOKENS_SANITY,
  );
}

/**
 * Resolve the model and reasoning effort for an analysis call.
 * Invalid user choices are clamped to the model's supported set.
 */
export function resolveAnalysisConfig(input: {
  model: string;
  reasoningEffort: ReasoningEffortSetting;
}): ResolvedAnalysisConfig {
  const model = resolveModel(input.model);
  return {
    modelId: model.id,
    reasoning: {
      effort: resolveReasoningEffort(model.id, input.reasoningEffort),
    },
  };
}
