import { describe, expect, it, vi } from "vitest";
import { EVAL_FIXTURES, getEvalFixture } from "./fixtures";
import { evaluateAnalysis, judgeMustNotClaim } from "./judges";
import { liveOptionsFromEnv, runLiveEval, summarizeRuns, type LiveEvalOptions } from "./live";
import { runJobAnalysis } from "../openai";
import type { JobAnalysis } from "../../types";
import type { EvalExpectations } from "./types";
import { auditGrounding } from "./grounding";

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

  it.each([
    { judgeModel: "custom:judge" },
    { judgeModel: "custom:", customBaseUrl: "https://judge.example.test/v1" },
    { judgeModel: "custom:   ", customBaseUrl: "https://judge.example.test/v1" },
    { judgeModel: "custom:judge", customBaseUrl: "file:///tmp/judge" },
    { judgeModel: "custom:judge", customBaseUrl: "https://user:password@judge.example.test/v1" },
    { judgeModel: "custom:judge", customBaseUrl: "https://judge.example.test/v1", customProtocol: "invalid" },
  ])("rejects invalid auditor configuration before analysis: %j", async (judgeOptions) => {
    vi.mocked(runJobAnalysis).mockClear();
    await expect(runLiveEval({
      apiKey: "test-only", fixtureIds: [EVAL_FIXTURES[0].id], judgeApiKey: "judge-test-only",
      ...judgeOptions,
    } as LiveEvalOptions)).rejects.toThrow();
    expect(runJobAnalysis).not.toHaveBeenCalled();
  });

  it.each(["openai", "anthropic"] as const)("accepts a separately configured custom %s auditor without changing the analysis model", async (customProtocol) => {
    vi.mocked(runJobAnalysis).mockClear().mockResolvedValue(analysis());
    vi.mocked(auditGrounding).mockClear();
    await runLiveEval({
      apiKey: "analysis-test-only", fixtureIds: [EVAL_FIXTURES[0].id],
      judgeModel: "custom:offline-judge", judgeApiKey: "judge-test-only",
      customBaseUrl: "https://judge.example.test/v1", customProtocol,
      customHeaders: { "x-test": "judge-header" },
    });
    expect(runJobAnalysis).toHaveBeenCalledTimes(3);
    expect(auditGrounding).toHaveBeenCalledTimes(3);
    expect(auditGrounding).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), {
      model: "custom:offline-judge", apiKey: "judge-test-only",
      customBaseUrl: "https://judge.example.test/v1", customProtocol,
      customHeaders: { "x-test": "judge-header" },
    });
    expect(vi.mocked(runJobAnalysis).mock.calls[0][2].model).not.toMatch(/^custom:/);
  });
});

describe("forbidden claim attribution and polarity", () => {
  const fixture = getEvalFixture("backend-clinician-mismatch");
  const expectations: EvalExpectations = fixture.expectations;

  it("accepts accurate posted roles and requirements through evaluateAnalysis", () => {
    const output = analysis();
    output.job.role = "Registered Nurse, Adult Clinical Services";
    output.job.requirements = ["Active Washington RN license, BS Nursing, BLS and three years of bedside adult nursing."];
    output.job.summary = "The role requires BS Nursing.";
    output.fit.gaps = ["The role requires BS Nursing; the candidate has no nursing license."];
    const judged = evaluateAnalysis(fixture, output).results.find((item) => item.judge === "truth.must_not_claim");
    expect(judged).toEqual({ judge: "truth.must_not_claim", ok: true });
  });

  it.each([
    "The applicant is required to hold BS Nursing.",
    "The candidate has to hold BS Nursing.",
    "BS Nursing is required for this role.",
  ])("does not confuse applicant obligations with held qualifications: %s", (text) => {
    const output = analysis();
    output.job.requirements = [text];
    expect(judgeMustNotClaim(output, expectations, fixture.snapshot).ok).toBe(true);
  });

  it.each([
    ["job", "role", "The candidate is a registered nurse."],
    ["job", "summary", "The candidate holds BS Nursing as required by the role."],
    ["job", "summary", "A BS Nursing degree is held by the applicant."],
    ["company", "summary", "The applicant is a registered nurse."],
    ["company", "product", "The applicant's BS Nursing qualifies them for this role."],
    ["company", "summary", "I am a registered nurse."],
  ] as const)("rejects applicant fabrications in %s.%s", (section, key, text) => {
    const output = analysis();
    Object.assign(output[section], { [key]: text });
    expect(judgeMustNotClaim(output, expectations, fixture.snapshot).ok).toBe(false);
  });

  it("does not exempt fabricated applicant requirements copied from a posting", () => {
    const output = analysis();
    output.job.requirements = ["The applicant holds BS Nursing."];
    const snapshot = { ...fixture.snapshot, pageText: `${fixture.snapshot.pageText}\nThe applicant holds BS Nursing.` };
    expect(judgeMustNotClaim(output, expectations, snapshot).ok).toBe(false);
  });

  it("does not treat a required qualification absent from the posting as evidence", () => {
    const output = analysis();
    output.job.requirements = ["The role requires a PhD."];
    expect(judgeMustNotClaim(output, { ...expectations, mustNotClaim: ["PhD"] }, fixture.snapshot).ok).toBe(false);
  });

  it.each([
    "No relocation is required and I am a registered nurse.",
    "I do not need sponsorship because I am a registered nurse.",
    "The applicant has no relocation restrictions and is a registered nurse.",
    "I am not only a registered nurse but also a backend engineer.",
    "I am not just a registered nurse.",
    "Registered nurse is not only my current position.",
    "No relocation is required to start as a registered nurse.",
    "No evidence of BS Nursing is available, but the applicant has BS Nursing.",
    "The candidate does not lack a BS Nursing degree.",
    "I am not without BS Nursing.",
    "BS Nursing is not missing from my credentials.",
    "No evidence was requested as the applicant holds BS Nursing.",
  ])("rejects positive claims beside unrelated negatives: %s", (text) => {
    const output = analysis();
    output.fit.recommendation = text;
    expect(judgeMustNotClaim(output, expectations, fixture.snapshot).ok).toBe(false);
  });

  it.each([
    "The candidate is not a registered nurse.",
    "The candidate lacks a BS Nursing degree.",
    "The candidate does not hold BS Nursing.",
    "No evidence of BS Nursing is provided.",
    "No evidence in the supplied profile supports a BS Nursing qualification.",
    "The supplied profile does not establish registered nurse licensure.",
    "Registered nurse licensure is not supported by the supplied profile.",
    "BS Nursing is missing from the supplied profile.",
    "Cannot verify a BS Nursing degree.",
    "No evidence of registered nurse licensure or BS Nursing is provided.",
    "The candidate lacks the required BS Nursing degree.",
    "No evidence of holding BS Nursing is provided.",
    "No evidence that the applicant holds BS Nursing is provided.",
  ])("preserves negative and no-evidence diagnostics: %s", (text) => {
    const output = analysis();
    output.fit.recommendation = text;
    expect(judgeMustNotClaim(output, expectations, fixture.snapshot).ok).toBe(true);
  });

  it("preserves absence diagnostics when the forbidden phrase includes its verb", () => {
    const output = analysis();
    output.fit.recommendation = "No evidence the candidate holds a PhD.";
    expect(judgeMustNotClaim(output, { ...expectations, mustNotClaim: ["holds a PhD"] }, fixture.snapshot).ok).toBe(true);
  });
});
