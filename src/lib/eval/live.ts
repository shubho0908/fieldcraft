import { DEFAULT_SETTINGS } from "../defaults";
import { JudgeId } from "../enums";
import type { ReasoningEffortSetting } from "../enums";
import {
  DEFAULT_EVAL_MODEL_ID,
  DEFAULT_EVAL_REASONING_EFFORT,
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
  /** OpenAI model id from the Fieldcraft catalog (defaults to DEFAULT_EVAL_MODEL_ID). */
  model?: string;
  /**
   * Reasoning effort for the eval run.
   * Defaults to DEFAULT_EVAL_REASONING_EFFORT (high), clamped per model.
   */
  reasoningEffort?: ReasoningEffortSetting;
  researchCompany?: boolean;
  /** Limit fixtures for cheaper smoke runs. */
  fixtureIds?: string[];
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
  /** Concrete effort sent to OpenAI after model clamp. */
  resolvedReasoningEffort: ReturnType<typeof resolveReasoningEffort>;
  researchCompany: boolean;
}

/**
 * Resolve model + reasoning for a live eval run.
 * All defaults come from the model catalog — nothing hardcoded here.
 */
export function resolveLiveEvalConfig(
  options: Pick<LiveEvalOptions, "model" | "reasoningEffort" | "researchCompany">,
): ResolvedLiveEvalConfig {
  const model = resolveModel(options.model ?? DEFAULT_EVAL_MODEL_ID);
  const reasoningEffort =
    options.reasoningEffort ?? preferredEvalReasoningEffort(model.id);
  return {
    model: model.id,
    modelLabel: model.label,
    reasoningEffort,
    resolvedReasoningEffort: resolveReasoningEffort(model.id, reasoningEffort),
    researchCompany: options.researchCompany ?? false,
  };
}

/**
 * Run fixture pack against the live OpenAI Responses API, then apply judges.
 * Requires a real API key. Not used by the Chrome extension runtime.
 */
export async function runLiveEval(
  options: LiveEvalOptions,
): Promise<LiveEvalCaseResult[]> {
  const resolved = resolveLiveEvalConfig(options);
  const settings: ExtensionSettings = {
    ...DEFAULT_SETTINGS,
    model: resolved.model,
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
