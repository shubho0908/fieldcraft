import { describe, expect, it } from "vitest";
import { parseCustomHeaderLines } from "../custom-headers";
import { isReasoningEffortSetting } from "../enums";
import {
  CUSTOM_MODEL_PREFIX,
  DEFAULT_EVAL_MODEL_ID,
  DEFAULT_EVAL_REASONING_EFFORT,
  DEFAULT_MODEL_ID,
  OPENAI_MODELS,
  Provider,
  preferredEvalReasoningEffort,
  resolveModel,
} from "../models";
import { resolveLiveEvalConfig, runLiveEval } from "./live";

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};

const provider = (env.FIELDCRAFT_EVAL_PROVIDER?.trim() || Provider.OpenAI) as Provider;
const customBaseUrl = env.FIELDCRAFT_CUSTOM_BASE_URL?.trim();
const customModelId = env.FIELDCRAFT_CUSTOM_MODEL_ID?.trim();
const customApiKey = env.FIELDCRAFT_CUSTOM_API_KEY?.trim();
const customHeaders = parseCustomHeaderLines(env.FIELDCRAFT_CUSTOM_HEADERS ?? "");
const openAiApiKey = env.OPENAI_API_KEY?.trim();
const apiKey =
  (provider === Provider.Custom ? customApiKey || openAiApiKey : openAiApiKey) ??
  "";
const runLive = apiKey ? describe : describe.skip;

function evalModelFromEnv(): string {
  const fromEnv = env.FIELDCRAFT_EVAL_MODEL?.trim();
  if (provider === Provider.Custom && customModelId) {
    return `${CUSTOM_MODEL_PREFIX}${customModelId}`;
  }
  return fromEnv || DEFAULT_EVAL_MODEL_ID;
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
 *   FIELDCRAFT_CUSTOM_HEADERS  — multiline "Name: value" pairs for custom endpoints
 */
runLive("live OpenAI fixture eval", () => {
  it(
    "runs the fixture pack against the real Responses API",
    async () => {
      const model = evalModelFromEnv();
      const reasoningEffort = evalReasoningFromEnv();
      const config = resolveLiveEvalConfig({
        model,
        reasoningEffort,
        provider,
        customBaseUrl,
        customHeaders,
      });

      // Visible in vitest output so you know which model was used.
      const providerTag =
        config.provider === Provider.Custom
          ? ` provider=custom baseUrl=${config.customBaseUrl ?? ""}`
          : "";
      console.info(
        `[fieldcraft eval] model=${config.model} (${config.modelLabel}) reasoning=${config.reasoningEffort}→${config.resolvedReasoningEffort} research=${config.researchCompany}${providerTag}`,
      );

      const results = await runLiveEval({
        apiKey: apiKey!,
        model: config.model,
        reasoningEffort: config.reasoningEffort,
        researchCompany: env.FIELDCRAFT_EVAL_RESEARCH === "1",
        provider: config.provider,
        customBaseUrl: config.customBaseUrl,
        customHeaders: config.customHeaders,
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
