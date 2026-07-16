import { DEFAULT_SETTINGS } from "../defaults";
import { JudgeId, OpenAiModelId } from "../enums";
import { runJobAnalysis } from "../openai";
import type { ExtensionSettings } from "../../types";
import { EVAL_FIXTURES } from "./fixtures";
import { evaluateAnalysis } from "./judges";
import type { EvalReport } from "./types";

export interface LiveEvalOptions {
  apiKey: string;
  model?: string;
  reasoningEffort?: ExtensionSettings["reasoningEffort"];
  researchCompany?: boolean;
  /** Limit fixtures for cheaper smoke runs. */
  fixtureIds?: string[];
}

export interface LiveEvalCaseResult {
  fixtureId: string;
  model: string;
  report: EvalReport;
  error?: string;
}

/**
 * Run fixture pack against the live OpenAI Responses API, then apply judges.
 * Requires a real API key. Not used by the Chrome extension runtime.
 */
export async function runLiveEval(
  options: LiveEvalOptions,
): Promise<LiveEvalCaseResult[]> {
  const settings: ExtensionSettings = {
    ...DEFAULT_SETTINGS,
    model: options.model ?? OpenAiModelId.Gpt56Terra,
    reasoningEffort: options.reasoningEffort ?? DEFAULT_SETTINGS.reasoningEffort,
    researchCompany: options.researchCompany ?? false,
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
        model: settings.model,
        report,
      });
    } catch (error) {
      results.push({
        fixtureId: fixture.id,
        model: settings.model,
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
