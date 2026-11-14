import { DEFAULT_SETTINGS } from "../defaults";
import { sanitizeCustomHeaders } from "../custom-headers";
import { JudgeId } from "../enums";
import type { ReasoningEffortSetting } from "../enums";
import {
  CUSTOM_MODEL_PREFIX,
  CustomProtocol,
  DEFAULT_EVAL_MODEL_ID,
  DEFAULT_EVAL_REASONING_EFFORT,
  Provider,
  isCustomModelId,
  preferredEvalReasoningEffort,
  resolveModel,
  resolveReasoningEffort,
} from "../models";
import { runJobAnalysis } from "../openai";
import type { ExtensionSettings } from "../../types";
import { EVAL_FIXTURES } from "./fixtures";
import { evaluateAnalysis } from "./judges";
import type { EvalReport } from "./types";

export {
  DEFAULT_EVAL_MODEL_ID as DEFAULT_EVAL_MODEL,
  DEFAULT_EVAL_REASONING_EFFORT as DEFAULT_EVAL_REASONING,
};

export interface LiveEvalOptions {
  apiKey: string;
  /** Exa API key for company research in eval runs. */
  exaApiKey?: string;
  /** Model id from the Fieldcraft catalog or a `custom:<id>` value (defaults to DEFAULT_EVAL_MODEL_ID). */
  model?: string;
  /**
   * Reasoning effort for the eval run.
   * Defaults to DEFAULT_EVAL_REASONING_EFFORT (high), clamped per model.
   */
  reasoningEffort?: ReasoningEffortSetting;
  researchCompany?: boolean;
  /** Limit fixtures for cheaper smoke runs. */
  fixtureIds?: string[];
  /** Override provider detection. Required for custom endpoints. */
  provider?: Provider;
  /** Base URL for {@link Provider.Custom}. */
  customBaseUrl?: string;
  /** Protocol for {@link Provider.Custom}. */
  customProtocol?: CustomProtocol;
  /** Optional extra headers for {@link Provider.Custom}. */
  customHeaders?: Record<string, string>;
}

export interface LiveEvalCaseResult {
  fixtureId: string;
  model: string;
  reasoningEffort: ReasoningEffortSetting;
  report: EvalReport;
  error?: string;
}

export interface ResolvedLiveEvalConfig {
  model: string;
  modelLabel: string;
  /** Setting after defaulting (e.g. high). */
  reasoningEffort: ReasoningEffortSetting;
  /** Concrete OpenAI effort after the model-specific clamp. */
  resolvedReasoningEffort: ReturnType<typeof resolveReasoningEffort>;
  researchCompany: boolean;
  provider: Provider;
  customBaseUrl?: string;
  customProtocol?: CustomProtocol;
  customHeaders?: Record<string, string>;
}

/**
 * Resolve model + reasoning for a live eval run.
 * All defaults come from the model catalog — nothing hardcoded here.
 */
export function resolveLiveEvalConfig(
  options: Pick<
    LiveEvalOptions,
    | "model"
    | "reasoningEffort"
    | "researchCompany"
    | "provider"
    | "customBaseUrl"
    | "customProtocol"
    | "customHeaders"
  >,
): ResolvedLiveEvalConfig {
  let modelId = options.model ?? DEFAULT_EVAL_MODEL_ID;
  let provider = options.provider ?? resolveModel(modelId).provider;

  // If the caller explicitly wants a custom provider, the model id must carry
  // the `custom:` prefix so downstream resolver/API key/base URL logic treats
  // it as a custom endpoint — even when a plain model string is passed.
  if (provider === Provider.Custom && !isCustomModelId(modelId)) {
    modelId = `${CUSTOM_MODEL_PREFIX}${modelId}`;
  }

  const model = resolveModel(modelId);
  provider = options.provider ?? model.provider;

  const reasoningEffort =
    options.reasoningEffort ?? preferredEvalReasoningEffort(model.id);
  return {
    model: modelId,
    modelLabel: model.label,
    reasoningEffort,
    resolvedReasoningEffort: resolveReasoningEffort(model.id, reasoningEffort),
    researchCompany: options.researchCompany ?? false,
    provider,
    customBaseUrl: options.customBaseUrl,
    customProtocol: options.customProtocol,
    customHeaders: sanitizeCustomHeaders(options.customHeaders),
  };
}

/**
 * Run fixture pack against the selected provider, then apply judges.
 * Requires a real API key. Not used by the Chrome extension runtime.
 */
export async function runLiveEval(
  options: LiveEvalOptions,
): Promise<LiveEvalCaseResult[]> {
  const resolved = resolveLiveEvalConfig(options);
  const settings: ExtensionSettings = {
    ...DEFAULT_SETTINGS,
    provider: resolved.provider,
    model: resolved.model,
    customBaseUrl: resolved.customBaseUrl ?? DEFAULT_SETTINGS.customBaseUrl,
    customProtocol: resolved.customProtocol ?? DEFAULT_SETTINGS.customProtocol,
    customHeaders: resolved.customHeaders ?? DEFAULT_SETTINGS.customHeaders,
    reasoningEffort: resolved.reasoningEffort,
    evalModel: resolved.model,
    evalReasoningEffort: resolved.reasoningEffort,
    researchCompany: resolved.researchCompany,
  };

  const fixtures = options.fixtureIds?.length
    ? EVAL_FIXTURES.filter((fixture) => options.fixtureIds!.includes(fixture.id))
    : EVAL_FIXTURES;

  const results: LiveEvalCaseResult[] = [];

  for (const fixture of fixtures) {
    try {
      const analysis = await runJobAnalysis(
        fixture.snapshot,
        fixture.profile,
        {
          ...settings,
          researchCompany:
            options.researchCompany ?? fixture.researchAttempted,
        },
        {
          apiKey: options.apiKey,
          installId: `fieldcraft-eval-${fixture.id}`,
          exaApiKey: options.exaApiKey,
        },
      );
      const report = evaluateAnalysis(
        {
          ...fixture,
          researchAttempted:
            options.researchCompany ?? fixture.researchAttempted,
        },
        analysis,
      );
      results.push({
        fixtureId: fixture.id,
        model: resolved.model,
        reasoningEffort: resolved.reasoningEffort,
        report,
      });
    } catch (error) {
      results.push({
        fixtureId: fixture.id,
        model: resolved.model,
        reasoningEffort: resolved.reasoningEffort,
        report: {
          fixtureId: fixture.id,
          ok: false,
          results: [],
          failures: [
            {
              judge: JudgeId.LiveRuntime,
              message:
                error instanceof Error ? error.message : "Live analysis failed",
            },
          ],
        },
        error: error instanceof Error ? error.message : "Live analysis failed",
      });
    }
  }

  return results;
}
