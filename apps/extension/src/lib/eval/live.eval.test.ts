import { describe, expect, it } from "vitest";
import { isReasoningEffortSetting } from "../enums";
import {
  DEFAULT_EVAL_MODEL_ID,
  DEFAULT_EVAL_REASONING_EFFORT,
  DEFAULT_MODEL_ID,
  OPENAI_MODELS,
  preferredEvalReasoningEffort,
  resolveModel,
} from "../models";
import { resolveLiveEvalConfig, runLiveEval } from "./live";

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};
const apiKey = env.OPENAI_API_KEY?.trim();
const runLive = apiKey ? describe : describe.skip;

function evalModelFromEnv(): string {
  return env.FIELDCRAFT_EVAL_MODEL?.trim() || DEFAULT_EVAL_MODEL_ID;
}

function evalReasoningFromEnv() {
  const raw = env.FIELDCRAFT_EVAL_REASONING?.trim().toLowerCase();
  if (raw && isReasoningEffortSetting(raw)) return raw;
  return DEFAULT_EVAL_REASONING_EFFORT;
}

describe("live eval config", () => {
  it("defaults from the model catalog — no hard-coded model/reasoning ids", () => {
    const defaults = resolveLiveEvalConfig({});
    expect(defaults.model).toBe(DEFAULT_EVAL_MODEL_ID);
    expect(defaults.model).toBe(DEFAULT_MODEL_ID);
    expect(defaults.reasoningEffort).toBe(
      preferredEvalReasoningEffort(defaults.model),
    );
    expect(defaults.resolvedReasoningEffort).toBe(
      preferredEvalReasoningEffort(defaults.model),
    );

    const other = OPENAI_MODELS.find((m) => m.id !== DEFAULT_EVAL_MODEL_ID);
    if (other) {
      const custom = resolveLiveEvalConfig({
        model: other.id,
        reasoningEffort: DEFAULT_EVAL_REASONING_EFFORT,
      });
      expect(custom.model).toBe(other.id);
      expect(custom.reasoningEffort).toBe(DEFAULT_EVAL_REASONING_EFFORT);
    }
  });

  it("exposes catalog models for selection", () => {
    expect(OPENAI_MODELS.length).toBeGreaterThan(0);
    for (const model of OPENAI_MODELS) {
      expect(resolveModel(model.id).id).toBe(model.id);
    }
  });
});

/**
 * Optional live matrix. Skipped unless OPENAI_API_KEY is set.
 *
 * Examples:
 *   OPENAI_API_KEY=sk-... npm run eval:live
 *   OPENAI_API_KEY=sk-... FIELDCRAFT_EVAL_MODEL=<catalog-id> npm run eval:live
 *   OPENAI_API_KEY=sk-... FIELDCRAFT_EVAL_REASONING=high npm run eval:live
 *   OPENAI_API_KEY=sk-... FIELDCRAFT_EVAL_RESEARCH=1 npm run eval:live
 *
 * Env:
 *   FIELDCRAFT_EVAL_MODEL      — catalog model id (default: DEFAULT_EVAL_MODEL_ID)
 *   FIELDCRAFT_EVAL_REASONING  — none|low|medium|high|xhigh|max|auto
 *                                (default: DEFAULT_EVAL_REASONING_EFFORT)
 *   FIELDCRAFT_EVAL_RESEARCH=1 — enable company web research
 */
runLive("live OpenAI fixture eval", () => {
  it(
    "runs the fixture pack against the real Responses API",
    async () => {
      const model = evalModelFromEnv();
      const reasoningEffort = evalReasoningFromEnv();
      const config = resolveLiveEvalConfig({ model, reasoningEffort });

      // Visible in vitest output so you know which model was used.
      console.info(
        `[fieldcraft eval] model=${config.model} (${config.modelLabel}) reasoning=${config.reasoningEffort}→${config.resolvedReasoningEffort} research=${config.researchCompany}`,
      );

      const results = await runLiveEval({
        apiKey: apiKey!,
        model: config.model,
        reasoningEffort: config.reasoningEffort,
        researchCompany: env.FIELDCRAFT_EVAL_RESEARCH === "1",
      });

      const failed = results.filter((result) => !result.report.ok || result.error);
      if (failed.length > 0) {
        const details = failed
          .map((result) => {
            const judges = result.report.failures
              .map((failure) => `${failure.judge}: ${failure.message}`)
              .join("; ");
            return `${result.fixtureId} [${result.model}] → ${result.error || judges}`;
          })
          .join("\n");
        expect.fail(`Live eval failures:\n${details}`);
      }

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.model).toBe(config.model);
        expect(result.reasoningEffort).toBe(config.reasoningEffort);
        expect(result.report.ok).toBe(true);
      }
    },
    300_000,
  );
});
