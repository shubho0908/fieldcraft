/**
 * AI model catalog (multi-provider).
 * Effort / search enums live in ./enums (single source of truth).
 */

import {
  OpenAiModelId,
  ReasoningEffort,
  ReasoningEffortSettingAuto,
  isReasoningEffortSetting,
  type ReasoningEffort as ReasoningEffortType,
  type ReasoningEffortSetting,
} from "./enums";

export type { ReasoningEffortSetting };
export {
  OpenAiModelId,
  ReasoningEffort,
  ReasoningEffortSettingAuto,
  isReasoningEffortSetting,
};

export const Provider = {
  OpenAI: "openai",
  Gemini: "gemini",
} as const;

export type Provider = (typeof Provider)[keyof typeof Provider];

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
  },
  {
    provider: Provider.OpenAI,
    id: OpenAiModelId.Gpt56Sol,
    label: "GPT-5.6 Sol",
    description: "Best quality",
    defaultReasoningEffort: ReasoningEffort.High,
    supportedReasoningEfforts: GPT_5_6_EFFORTS,
  },
  {
    provider: Provider.OpenAI,
    id: OpenAiModelId.Gpt56Luna,
    label: "GPT-5.6 Luna",
    description: "Lowest cost",
    defaultReasoningEffort: ReasoningEffort.Low,
    supportedReasoningEfforts: GPT_5_6_EFFORTS,
  },
  {
    provider: Provider.OpenAI,
    id: OpenAiModelId.Gpt55,
    label: "GPT-5.5",
    description: "Prior frontier, stable fallback",
    defaultReasoningEffort: ReasoningEffort.Medium,
    supportedReasoningEfforts: GPT_5_5_EFFORTS,
  },
  {
    provider: Provider.OpenAI,
    id: OpenAiModelId.Gpt55Pro,
    label: "GPT-5.5 Pro",
    description: "Highest-quality GPT-5.5 analysis",
    defaultReasoningEffort: ReasoningEffort.High,
    supportedReasoningEfforts: GPT_5_5_PRO_EFFORTS,
  },
] as const;

/** Current Gemini text models that support structured output. */
export const GEMINI_MODELS: readonly ModelOption[] = [
  {
    provider: Provider.Gemini,
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro Preview",
    description: "Most capable Gemini reasoning model",
    defaultReasoningEffort: ReasoningEffort.None,
    supportedReasoningEfforts: [],
  },
  {
    provider: Provider.Gemini,
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    description: "Frontier performance at higher speed",
    defaultReasoningEffort: ReasoningEffort.None,
    supportedReasoningEfforts: [],
  },
  {
    provider: Provider.Gemini,
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite",
    description: "Fast, economical high-volume analysis",
    defaultReasoningEffort: ReasoningEffort.None,
    supportedReasoningEfforts: [],
  },
] as const;

/** Combined catalog used by the UI and runtime. */
export const AI_MODELS: readonly ModelOption[] = [
  ...OPENAI_MODELS,
  ...GEMINI_MODELS,
] as const;

export function isProvider(value: string): value is Provider {
  return Object.values(Provider).includes(value as Provider);
}

export function modelsForProvider(provider: Provider): readonly ModelOption[] {
  return AI_MODELS.filter((model) => model.provider === provider);
}

export function defaultModelForProvider(provider: Provider): ModelOption {
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

export function isKnownModel(modelId: string): boolean {
  return AI_MODELS.some((model) => model.id === modelId);
}

export function resolveModel(modelId: string): ModelOption {
  return AI_MODELS.find((model) => model.id === modelId) ?? AI_MODELS[0];
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
