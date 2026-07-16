/**
 * OpenAI Responses API model catalog.
 * Effort / search enums live in ./enums (single source of truth).
 */

import {
  OpenAiModelId,
  ReasoningEffort,
  ReasoningEffortSettingAuto,
  SearchContextSize,
  isOpenAiModelId,
  isReasoningEffortSetting,
  type OpenAiModelId as OpenAiModelIdType,
  type ReasoningEffort as ReasoningEffortType,
  type ReasoningEffortSetting,
  type SearchContextSize as SearchContextSizeType,
} from "./enums";

export type { ReasoningEffortSetting };
export {
  OpenAiModelId,
  ReasoningEffort,
  ReasoningEffortSettingAuto,
  SearchContextSize,
  isReasoningEffortSetting,
};

export interface ReasoningEffortOption {
  id: ReasoningEffortSetting;
  label: string;
  description: string;
}

export interface OpenAiModelOption {
  id: OpenAiModelIdType;
  label: string;
  description: string;
  defaultReasoningEffort: ReasoningEffortType;
  supportedReasoningEfforts: readonly ReasoningEffortType[];
  searchContextSize: SearchContextSizeType;
}

export interface ResolvedAnalysisConfig {
  modelId: OpenAiModelIdType;
  reasoning: {
    effort: ReasoningEffortType;
  };
  searchContextSize: SearchContextSizeType;
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

const GPT_5_4_EFFORTS = [
  ReasoningEffort.None,
  ReasoningEffort.Low,
  ReasoningEffort.Medium,
  ReasoningEffort.High,
  ReasoningEffort.XHigh,
] as const satisfies readonly ReasoningEffortType[];

const MINI_EFFORTS = [
  ReasoningEffort.None,
  ReasoningEffort.Low,
  ReasoningEffort.Medium,
  ReasoningEffort.High,
] as const satisfies readonly ReasoningEffortType[];

const NANO_EFFORTS = [
  ReasoningEffort.None,
  ReasoningEffort.Low,
  ReasoningEffort.Medium,
] as const satisfies readonly ReasoningEffortType[];

const REASONING_EFFORTS = [
  ReasoningEffort.Low,
  ReasoningEffort.Medium,
  ReasoningEffort.High,
] as const satisfies readonly ReasoningEffortType[];

/** Supported OpenAI Responses models and per-tier analysis defaults. */
export const OPENAI_MODELS: readonly OpenAiModelOption[] = [
  {
    id: OpenAiModelId.Gpt56Terra,
    label: "GPT-5.6 Terra",
    description: "Balanced quality and cost",
    defaultReasoningEffort: ReasoningEffort.Medium,
    supportedReasoningEfforts: GPT_5_6_EFFORTS,
    searchContextSize: SearchContextSize.Medium,
  },
  {
    id: OpenAiModelId.Gpt56Sol,
    label: "GPT-5.6 Sol",
    description: "Best quality",
    defaultReasoningEffort: ReasoningEffort.High,
    supportedReasoningEfforts: GPT_5_6_EFFORTS,
    searchContextSize: SearchContextSize.High,
  },
  {
    id: OpenAiModelId.Gpt56Luna,
    label: "GPT-5.6 Luna",
    description: "Lowest cost",
    defaultReasoningEffort: ReasoningEffort.Low,
    supportedReasoningEfforts: GPT_5_6_EFFORTS,
    searchContextSize: SearchContextSize.Low,
  },
  {
    id: OpenAiModelId.Gpt55,
    label: "GPT-5.5",
    description: "Prior frontier, stable fallback",
    defaultReasoningEffort: ReasoningEffort.Medium,
    supportedReasoningEfforts: GPT_5_5_EFFORTS,
    searchContextSize: SearchContextSize.Medium,
  },

  // ── Free tier — best reasoning (250K tokens/day) ─────────────────

  {
    id: OpenAiModelId.Gpt54,
    label: "GPT-5.4",
    description: "Latest flagship, excellent reasoning",
    defaultReasoningEffort: ReasoningEffort.Medium,
    supportedReasoningEfforts: GPT_5_4_EFFORTS,
    searchContextSize: SearchContextSize.Medium,
  },
  {
    id: OpenAiModelId.Gpt52,
    label: "GPT-5.2",
    description: "Strong reasoning, good value",
    defaultReasoningEffort: ReasoningEffort.Medium,
    supportedReasoningEfforts: GPT_5_4_EFFORTS,
    searchContextSize: SearchContextSize.Medium,
  },
  {
    id: OpenAiModelId.Gpt41,
    label: "GPT-4.1",
    description: "Reliable reasoning, strong generalist",
    defaultReasoningEffort: ReasoningEffort.Medium,
    supportedReasoningEfforts: GPT_5_4_EFFORTS,
    searchContextSize: SearchContextSize.Medium,
  },
  {
    id: OpenAiModelId.O3,
    label: "o3",
    description: "Dedicated deep reasoning model",
    defaultReasoningEffort: ReasoningEffort.High,
    supportedReasoningEfforts: REASONING_EFFORTS,
    searchContextSize: SearchContextSize.Medium,
  },
  {
    id: OpenAiModelId.O1,
    label: "o1",
    description: "Reasoning specialist, deliberate analysis",
    defaultReasoningEffort: ReasoningEffort.Medium,
    supportedReasoningEfforts: REASONING_EFFORTS,
    searchContextSize: SearchContextSize.Medium,
  },

  // ── Free tier — best reasoning mini/nano (2.5M tokens/day) ───────

  {
    id: OpenAiModelId.O4Mini,
    label: "o4-mini",
    description: "Latest reasoning mini, best in class",
    defaultReasoningEffort: ReasoningEffort.Medium,
    supportedReasoningEfforts: REASONING_EFFORTS,
    searchContextSize: SearchContextSize.Low,
  },
  {
    id: OpenAiModelId.O3Mini,
    label: "o3-mini",
    description: "Efficient reasoning at scale",
    defaultReasoningEffort: ReasoningEffort.Medium,
    supportedReasoningEfforts: REASONING_EFFORTS,
    searchContextSize: SearchContextSize.Low,
  },
  {
    id: OpenAiModelId.O1Mini,
    label: "o1-mini",
    description: "Budget reasoning, good for quick analysis",
    defaultReasoningEffort: ReasoningEffort.Medium,
    supportedReasoningEfforts: REASONING_EFFORTS,
    searchContextSize: SearchContextSize.Low,
  },
  {
    id: OpenAiModelId.Gpt54Mini,
    label: "GPT-5.4 Mini",
    description: "Strong quality at lower cost",
    defaultReasoningEffort: ReasoningEffort.Medium,
    supportedReasoningEfforts: MINI_EFFORTS,
    searchContextSize: SearchContextSize.Low,
  },
  {
    id: OpenAiModelId.Gpt54Nano,
    label: "GPT-5.4 Nano",
    description: "Lowest cost, fast everyday analysis",
    defaultReasoningEffort: ReasoningEffort.Low,
    supportedReasoningEfforts: NANO_EFFORTS,
    searchContextSize: SearchContextSize.Low,
  },
] as const;

/** Single default model for Analyze + Evals when nothing is saved yet. */
export const DEFAULT_MODEL_ID: OpenAiModelIdType = OPENAI_MODELS[0].id;

/** Analyze UI default: Auto → model.defaultReasoningEffort. */
export const DEFAULT_REASONING_EFFORT: ReasoningEffortSetting =
  ReasoningEffortSettingAuto;

/** Live fixture evals default to the same catalog model. */
export const DEFAULT_EVAL_MODEL_ID: OpenAiModelIdType = DEFAULT_MODEL_ID;

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

export function isKnownModel(modelId: string): modelId is OpenAiModelIdType {
  return isOpenAiModelId(modelId);
}

export function resolveModel(modelId: string): OpenAiModelOption {
  return OPENAI_MODELS.find((model) => model.id === modelId) ?? OPENAI_MODELS[0];
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
 * Build the Responses API reasoning payload + search tier for an analysis call.
 * Invalid user choices are clamped to the model’s supported set.
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
    searchContextSize: model.searchContextSize,
  };
}
