import { DEFAULT_SETTINGS } from "../defaults";
import { parseCustomHeaderLines, sanitizeCustomHeaders } from "../custom-headers";
import { isReasoningEffortSetting, type ReasoningEffortSetting } from "../enums";
import { CUSTOM_MODEL_PREFIX, CustomProtocol, DEFAULT_EVAL_MODEL_ID, DEFAULT_EVAL_REASONING_EFFORT, Provider, defaultModelForProvider, isCustomModelId, isCustomProtocol, isKnownModel, preferredEvalReasoningEffort, resolveModel, resolveReasoningEffort } from "../models";
import { createAiModel } from "../ai-provider";
import { runJobAnalysis } from "../openai";
import type { ExtensionSettings } from "../../types";
import { EVAL_FIXTURES } from "./fixtures";
import { evaluateAnalysis, report, result } from "./judges";
import { auditGrounding, groundingSources } from "./grounding";
import type { EvalReport, GroundingSource } from "./types";

export { DEFAULT_EVAL_MODEL_ID as DEFAULT_EVAL_MODEL, DEFAULT_EVAL_REASONING_EFFORT as DEFAULT_EVAL_REASONING };

export interface LiveEvalOptions {
  apiKey: string;
  exaApiKey?: string;
  model?: string;
  reasoningEffort?: ReasoningEffortSetting;
  researchCompany?: boolean;
  fixtureIds?: string[];
  repetitions?: number;
  provider?: Provider;
  customBaseUrl?: string;
  customProtocol?: CustomProtocol;
  customHeaders?: Record<string, string>;
  judgeModel?: string;
  judgeApiKey?: string;
}

export interface LiveEvalAttempt {
  run: number;
  score: number | null;
  verdict: string | null;
  report: EvalReport;
  error?: string;
}

export interface LiveEvalCaseResult {
  fixtureId: string;
  model: string;
  reasoningEffort: ReasoningEffortSetting;
  researchEnabled: boolean;
  researchDisabledReason?: string;
  runs: LiveEvalAttempt[];
  statistics: ReturnType<typeof summarizeRuns>;
  report: EvalReport;
}

export interface ResolvedLiveEvalConfig {
  model: string;
  modelLabel: string;
  reasoningEffort: ReasoningEffortSetting;
  resolvedReasoningEffort: ReturnType<typeof resolveReasoningEffort>;
  researchCompany: boolean;
  provider: Provider;
  customBaseUrl?: string;
  customProtocol?: CustomProtocol;
  customHeaders?: Record<string, string>;
}

export function resolveLiveEvalConfig(options: Partial<LiveEvalOptions>): ResolvedLiveEvalConfig {
  let modelId = options.model ?? (options.provider ? defaultModelForProvider(options.provider).id : DEFAULT_EVAL_MODEL_ID);
  const provider = options.provider ?? resolveModel(modelId).provider;
  if (provider === Provider.Custom && !isCustomModelId(modelId)) modelId = `${CUSTOM_MODEL_PREFIX}${modelId}`;
  if (!isKnownModel(modelId) || (isCustomModelId(modelId) && !modelId.slice(CUSTOM_MODEL_PREFIX.length).trim())) throw new Error("Choose a valid FIELDCRAFT_EVAL_MODEL.");
  const model = resolveModel(modelId);
  if (model.provider !== provider) throw new Error("FIELDCRAFT_EVAL_PROVIDER does not match FIELDCRAFT_EVAL_MODEL.");
  if (provider === Provider.Custom) {
    if (options.customProtocol !== undefined && !isCustomProtocol(options.customProtocol)) throw new Error("Invalid FIELDCRAFT_CUSTOM_PROTOCOL.");
    if (!options.customBaseUrl) throw new Error("FIELDCRAFT_CUSTOM_BASE_URL is required for custom evals.");
    const url = new URL(options.customBaseUrl);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Custom base URL must be HTTP(S), without credentials.");
  }
  const reasoningEffort = options.reasoningEffort ?? preferredEvalReasoningEffort(model.id);
  return { model: modelId, modelLabel: model.label, reasoningEffort, resolvedReasoningEffort: resolveReasoningEffort(model.id, reasoningEffort), researchCompany: options.researchCompany ?? false, provider, customBaseUrl: options.customBaseUrl, customProtocol: options.customProtocol, customHeaders: sanitizeCustomHeaders(options.customHeaders) };
}

export const PROVIDER_KEY_ENV: Record<Provider, string> = {
  [Provider.OpenAI]: "OPENAI_API_KEY", [Provider.Gemini]: "GEMINI_API_KEY", [Provider.Anthropic]: "ANTHROPIC_API_KEY", [Provider.Custom]: "CUSTOM_API_KEY",
};

export function liveOptionsFromEnv(env: Record<string, string | undefined>): LiveEvalOptions {
  const rawProvider = env.FIELDCRAFT_EVAL_PROVIDER?.trim();
  if (rawProvider && !Object.values(Provider).includes(rawProvider as Provider)) throw new Error("Unknown FIELDCRAFT_EVAL_PROVIDER.");
  const suppliedModel = env.FIELDCRAFT_EVAL_MODEL?.trim() || env.FIELDCRAFT_CUSTOM_MODEL_ID?.trim();
  const provider = (rawProvider as Provider | undefined) ?? (suppliedModel ? resolveModel(suppliedModel).provider : Provider.OpenAI);
  const reasoning = env.FIELDCRAFT_EVAL_REASONING?.trim();
  if (reasoning && !isReasoningEffortSetting(reasoning)) throw new Error("Invalid FIELDCRAFT_EVAL_REASONING.");
  const judgeModel = env.FIELDCRAFT_EVAL_JUDGE_MODEL?.trim();
  const judgeProvider = judgeModel ? resolveModel(judgeModel).provider : provider;
  const repetitions = Number(env.FIELDCRAFT_EVAL_REPETITIONS ?? 3);
  if (!Number.isInteger(repetitions) || repetitions < 3) throw new Error("FIELDCRAFT_EVAL_REPETITIONS must be an integer >= 3.");
  const protocol = env.FIELDCRAFT_CUSTOM_PROTOCOL?.trim();
  if (protocol && !Object.values(CustomProtocol).includes(protocol as CustomProtocol)) throw new Error("Invalid FIELDCRAFT_CUSTOM_PROTOCOL.");
  return {
    apiKey: env[PROVIDER_KEY_ENV[provider]]?.trim() ?? "",
    exaApiKey: env.EXA_API_KEY?.trim(), provider, model: suppliedModel,
    reasoningEffort: reasoning as ReasoningEffortSetting | undefined,
    researchCompany: env.FIELDCRAFT_EVAL_RESEARCH === "1", repetitions,
    fixtureIds: env.FIELDCRAFT_EVAL_FIXTURES?.split(",").map((s) => s.trim()).filter(Boolean),
    customBaseUrl: env.FIELDCRAFT_CUSTOM_BASE_URL?.trim(), customProtocol: protocol as CustomProtocol | undefined,
    customHeaders: parseCustomHeaderLines(env.FIELDCRAFT_CUSTOM_HEADERS ?? ""),
    judgeModel, judgeApiKey: env[PROVIDER_KEY_ENV[judgeProvider]]?.trim(),
  };
}

export function summarizeRuns(runs: LiveEvalAttempt[]) {
  const scores = runs.flatMap((run) => run.score === null ? [] : [run.score]);
  const mean = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
  const standardDeviation = scores.length > 1 && mean !== null
    ? Math.sqrt(scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (scores.length - 1)) : null;
  const verdictCounts: Record<string, number> = {};
  for (const run of runs) {
    const verdict = run.error ? "error" : run.verdict ?? "unavailable";
    verdictCounts[verdict] = (verdictCounts[verdict] ?? 0) + 1;
  }
  const successfulCounts = Object.entries(verdictCounts).filter(([key]) => key !== "error").map(([, count]) => count);
  return { samples: runs.length, scoredSamples: scores.length, mean, standardDeviation, verdictCounts, verdictAgreement: runs.length ? Math.max(0, ...successfulCounts) / runs.length : 0 };
}

export async function runLiveEval(options: LiveEvalOptions): Promise<LiveEvalCaseResult[]> {
  const resolved = resolveLiveEvalConfig(options);
  if (!options.apiKey.trim()) throw new Error(`${PROVIDER_KEY_ENV[resolved.provider]} is required for live evals.`);
  if (resolved.researchCompany && !options.exaApiKey?.trim()) throw new Error("EXA_API_KEY is required when FIELDCRAFT_EVAL_RESEARCH=1; Node evals never read Chrome storage.");
  const repetitions = options.repetitions ?? 3;
  if (!Number.isInteger(repetitions) || repetitions < 3) throw new Error("Live evals require repetitions >= 3.");
  const selected = options.fixtureIds?.length ? options.fixtureIds : EVAL_FIXTURES.map((fixture) => fixture.id);
  for (const id of selected) if (!EVAL_FIXTURES.some((fixture) => fixture.id === id)) throw new Error(`Unknown eval fixture: ${id}`);
  const fixtures = EVAL_FIXTURES.filter((fixture) => selected.includes(fixture.id));
  const judge = resolveLiveEvalConfig({
    model: options.judgeModel ?? resolved.model,
    customBaseUrl: options.customBaseUrl, customProtocol: options.customProtocol, customHeaders: options.customHeaders,
  });
  const judgeApiKey = options.judgeApiKey?.trim() || (judge.provider === resolved.provider ? options.apiKey.trim() : "");
  if (!judgeApiKey) throw new Error(`${PROVIDER_KEY_ENV[judge.provider]} is required for the grounding judge.`);
  // Constructing the provider performs local configuration validation, not a request.
  createAiModel({ model: resolveModel(judge.model), apiKey: judgeApiKey, baseURL: judge.customBaseUrl, protocol: judge.customProtocol, headers: judge.customHeaders });
  const settings: ExtensionSettings = {
    ...DEFAULT_SETTINGS, provider: resolved.provider, model: resolved.model, reasoningEffort: resolved.reasoningEffort,
    evalModel: resolved.model, evalReasoningEffort: resolved.reasoningEffort,
    customBaseUrl: resolved.customBaseUrl ?? "", customProtocol: resolved.customProtocol ?? DEFAULT_SETTINGS.customProtocol,
    customHeaders: resolved.customHeaders,
  };
  const results: LiveEvalCaseResult[] = [];
  for (const fixture of fixtures) {
    const researchEnabled = resolved.researchCompany && fixture.company.researchAllowed;
    const runs: LiveEvalAttempt[] = [];
    for (let run = 1; run <= repetitions; run++) {
      try {
        let researchSources: GroundingSource[] = [];
        const auth = {
          apiKey: options.apiKey, installId: `fieldcraft-eval-${fixture.id}-${run}`, exaApiKey: options.exaApiKey,
          onResearchEvidence: (sources: Array<{ title: string; url: string; text: string }>) => {
            researchSources = sources.filter((source) => source.text.trim()).map((source, index) => ({ id: `research.${index}`, kind: "research", url: source.url, text: source.text }));
          },
        };
        const analysis = await runJobAnalysis(fixture.snapshot, fixture.profile, { ...settings, researchCompany: researchEnabled }, auth);
        const sources = groundingSources(fixture, researchSources);
        const audit = await auditGrounding(fixture, analysis, sources, { apiKey: judgeApiKey, model: judge.model, customBaseUrl: judge.customBaseUrl, customProtocol: judge.customProtocol, customHeaders: judge.customHeaders });
        const evaluated = evaluateAnalysis(fixture, analysis, audit);
        runs.push({ run, score: analysis.fit.score, verdict: analysis.fit.score === null ? null : analysis.fit.verdict, report: evaluated });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Live evaluation failed";
        runs.push({ run, score: null, verdict: null, error: message, report: report(fixture.id, [result("live.runtime", [message])]) });
      }
    }
    const statistics = summarizeRuns(runs);
    const stable = result("live.verdict_stability", statistics.verdictAgreement === 1 ? [] : [`verdict flip or failed run: ${JSON.stringify(statistics.verdictCounts)}`]);
    results.push({ fixtureId: fixture.id, model: resolved.model, reasoningEffort: resolved.reasoningEffort, researchEnabled,
      ...(resolved.researchCompany && !researchEnabled ? { researchDisabledReason: "Authored fictitious/adversarial employer; external research prohibited." } : {}),
      runs, statistics,
      report: report(fixture.id, [...runs.flatMap((run) => run.report.results.map((item) => ({ ...item, ...(item.message ? { message: `run ${run.run}: ${item.message}` } : {}) }))), stable]),
    });
  }
  return results;
}
