// @vitest-environment node
import { describe, expect, it } from "vitest";
import { liveOptionsFromEnv, resolveLiveEvalConfig, runLiveEval } from "./live";

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

describe.skipIf(env.FIELDCRAFT_EVAL_LIVE !== "1")("live model accuracy matrix (paid network calls)", () => {
  it("repeats full scenarios with independent source-aware grounding audits", async () => {
    const options = liveOptionsFromEnv(env);
    const config = resolveLiveEvalConfig(options);
    console.info(`[fieldcraft eval] provider=${config.provider} model=${config.model} judge=${options.judgeModel ?? config.model} repetitions=${options.repetitions} research=${config.researchCompany}`);
    const results = await runLiveEval(options);
    for (const result of results) {
      console.info(JSON.stringify({ fixture: result.fixtureId, model: result.model, researchEnabled: result.researchEnabled, researchDisabledReason: result.researchDisabledReason, ...result.statistics, runs: result.runs.map((run) => ({ run: run.run, score: run.score, verdict: run.verdict, ok: run.report.ok, failures: run.report.failures })) }));
    }
    const failed = results.filter((result) => !result.report.ok);
    expect(failed.map((result) => ({ fixture: result.fixtureId, failures: result.report.failures }))).toEqual([]);
    expect(results.length).toBeGreaterThan(0);
  }, 7_200_000);
});
