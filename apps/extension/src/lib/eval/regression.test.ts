import { describe, expect, it, vi } from "vitest";
import { EVAL_FIXTURES } from "./fixtures";
import { evaluateAnalysis, judgeMustNotClaim } from "./judges";
import { liveOptionsFromEnv, runLiveEval, summarizeRuns } from "./live";
import { runJobAnalysis } from "../openai";
import type { JobAnalysis } from "../../types";

vi.mock("../openai", () => ({ runJobAnalysis: vi.fn() }));
vi.mock("./grounding", async (original) => ({ ...await original<typeof import("./grounding")>(), auditGrounding: vi.fn(async () => ({ findings: [], sources: [] })) }));

function analysis(): JobAnalysis {
  return {
    job: { company: "Unknown", role: "Unknown", location: "Unknown", employmentType: "Unknown", seniority: "Unknown", summary: "", requirements: [], responsibilities: [], keywords: [], compensation: "Unknown", remotePolicy: "Unknown" },
    fit: { score: 80, verdict: "strong", strongestMatches: [], gaps: [], hardBlockers: [], recommendation: "" },
    company: { summary: "Unknown", product: "Unknown", stage: "Unknown", size: "Unknown", funding: "Unknown", engineeringSignals: [], risks: [], sources: [] },
    suggestions: [], missingFacts: [], research: { attempted: false, thin: true }, generatedAt: "2026-11-14T00:00:00Z",
  };
}

describe("accuracy regressions reproduced on main", () => {
  it.each([["openai", "OPENAI_API_KEY"], ["gemini", "GEMINI_API_KEY"], ["anthropic", "ANTHROPIC_API_KEY"], ["custom", "CUSTOM_API_KEY"]])("routes %s to its own key", (provider, key) => {
    const options = liveOptionsFromEnv({ FIELDCRAFT_EVAL_PROVIDER: provider, [key]: "provider-test-key", EXA_API_KEY: "research-test-key", FIELDCRAFT_EVAL_RESEARCH: "1" });
    expect(options.apiKey).toBe("provider-test-key");
    expect(options.exaApiKey).toBe("research-test-key");
    expect(options.repetitions).toBe(3);
  });

  it("measures score variance and verdict disagreement rather than hiding flips", () => {
    const stats = summarizeRuns([{ score: 80, verdict: "strong" }, { score: 82, verdict: "strong" }, { score: 72, verdict: "mixed" }] as never);
    expect(stats.mean).toBe(78);
    expect(stats.standardDeviation).toBeCloseTo(Math.sqrt(28));
    expect(stats.verdictAgreement).toBeCloseTo(2 / 3);
  });
  it("has at least thirty full posting/profile pairs", () => {
    expect(EVAL_FIXTURES.length).toBeGreaterThanOrEqual(30);
    for (const fixture of EVAL_FIXTURES) {
      expect(fixture.profile.resumeText.length).toBeGreaterThan(1500);
    }
  });

  it("does not mistake an explicit negative for a fabricated positive", () => {
    const output = analysis();
    output.fit.recommendation = "The candidate is not a US citizen.";
    expect(judgeMustNotClaim(output, { score: { min: 0, max: 49 }, mustNotClaim: ["US citizen"] }).ok).toBe(true);
  });

  it.each(["strongestMatches", "gaps"] as const)("checks forbidden claims in fit.%s", (key) => {
    const output = analysis();
    output.fit[key] = ["The candidate has a PhD in physics."];
    expect(judgeMustNotClaim(output, { score: { min: 0, max: 49 }, mustNotClaim: ["PhD"] }).ok).toBe(false);
  });

  it("checks forbidden claims in job and company facts", () => {
    const output = analysis();
    output.company.funding = "Raised $999 billion";
    expect(judgeMustNotClaim(output, { score: { min: 0, max: 49 }, mustNotClaim: ["$999 billion"] }).ok).toBe(false);
    output.company.funding = "Unknown";
    output.job.summary = "A PhD in physics is held by the candidate.";
    expect(judgeMustNotClaim(output, { score: { min: 0, max: 49 }, mustNotClaim: ["PhD"] }).ok).toBe(false);
  });

  it("does not report sanitizer invariants as runtime accuracy judges", () => {
    const ids = evaluateAnalysis(EVAL_FIXTURES[0], analysis()).results.map((r) => r.judge);
    expect(ids).not.toContain("fit.verdict_band");
    expect(ids).not.toContain("fields.coverage");
  });

  it("runs every case at least three times even with no repetitions option", async () => {
    vi.mocked(runJobAnalysis).mockResolvedValue(analysis());
    await runLiveEval({ apiKey: "test-only", fixtureIds: [EVAL_FIXTURES[0].id], researchCompany: false });
    expect(runJobAnalysis).toHaveBeenCalledTimes(3);
  });

  it("rejects research before any analysis call when the explicit Exa key is absent", async () => {
    vi.mocked(runJobAnalysis).mockClear();
    await expect(runLiveEval({ apiKey: "test-only", fixtureIds: [EVAL_FIXTURES[0].id], researchCompany: true })).rejects.toThrow(/EXA_API_KEY/);
    expect(runJobAnalysis).not.toHaveBeenCalled();
  });
});
