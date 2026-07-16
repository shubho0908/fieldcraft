import { describe, expect, it } from "vitest";
import { OpenAiModelId } from "../enums";
import { runLiveEval } from "./live";

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};
const apiKey = env.OPENAI_API_KEY?.trim();
const runLive = apiKey ? describe : describe.skip;

/**
 * Optional live matrix. Skipped unless OPENAI_API_KEY is set.
 * Example:
 *   OPENAI_API_KEY=sk-... npm run eval:live
 */
runLive("live OpenAI fixture eval", () => {
  it(
    "runs the fixture pack against the real Responses API",
    async () => {
      const results = await runLiveEval({
        apiKey: apiKey!,
        model: env.FIELDCRAFT_EVAL_MODEL || OpenAiModelId.Gpt56Terra,
        // Research off by default for cost/latency in CI-like runs.
        researchCompany: env.FIELDCRAFT_EVAL_RESEARCH === "1",
      });

      const failed = results.filter((result) => !result.report.ok || result.error);
      if (failed.length > 0) {
        const details = failed
          .map((result) => {
            const judges = result.report.failures
              .map((failure) => `${failure.judge}: ${failure.message}`)
              .join("; ");
            return `${result.fixtureId} → ${result.error || judges}`;
          })
          .join("\n");
        expect.fail(`Live eval failures:\n${details}`);
      }

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.report.ok).toBe(true);
      }
    },
    300_000,
  );
});
