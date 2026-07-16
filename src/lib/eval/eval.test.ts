import { describe, expect, it } from "vitest";
import { sanitizeAnalysis } from "../openai";
import { sanitizeFit } from "../fit";
import { EVAL_FIXTURES, getEvalFixture } from "./fixtures";
import { evaluateAnalysis } from "./judges";
import {
  sampleAshaRemoteIndiaFit,
  sampleAshaUsStaffBlocked,
  sampleBrokenAnalysis,
  sampleJordanUsStaffStrong,
} from "./samples";

import { FitVerdict, HARD_BLOCKER_SCORE_CAP, JudgeId } from "../enums";
describe("eval fixtures", () => {
  it("ships a stable fixture pack", () => {
    expect(EVAL_FIXTURES.map((fixture) => fixture.id)).toEqual([
      "asha-us-staff-blocked",
      "asha-remote-india-fit",
      "jordan-us-staff-strong",
    ]);
  });
});

describe("deterministic judge suite", () => {
  it("passes the asha US-staff blocked sample", () => {
    const fixture = getEvalFixture("asha-us-staff-blocked");
    const report = evaluateAnalysis(fixture, sampleAshaUsStaffBlocked());
    expect(report.failures).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("passes the asha remote-India fit sample", () => {
    const fixture = getEvalFixture("asha-remote-india-fit");
    const report = evaluateAnalysis(fixture, sampleAshaRemoteIndiaFit());
    expect(report.failures).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("passes the jordan US-staff strong sample", () => {
    const fixture = getEvalFixture("jordan-us-staff-strong");
    const report = evaluateAnalysis(fixture, sampleJordanUsStaffStrong());
    expect(report.failures).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("fails a broken analysis on the expected contracts", () => {
    const fixture = getEvalFixture("asha-us-staff-blocked");
    const report = evaluateAnalysis(fixture, sampleBrokenAnalysis());
    expect(report.ok).toBe(false);

    const failedJudges = new Set(report.failures.map((item) => item.judge));
    expect(failedJudges.has(JudgeId.FitVerdictBand)).toBe(true);
    expect(failedJudges.has(JudgeId.FitHardBlockerCap)).toBe(true);
    expect(failedJudges.has(JudgeId.FieldsCoverage)).toBe(true);
    expect(failedJudges.has(JudgeId.FieldsSelectOptions)).toBe(true);
    expect(failedJudges.has(JudgeId.FieldsFillEvidence)).toBe(true);
    expect(failedJudges.has(JudgeId.FieldsSensitive)).toBe(true);
    expect(failedJudges.has(JudgeId.TruthMustNotClaim)).toBe(true);
    expect(failedJudges.has(JudgeId.ResearchAttempted)).toBe(true);
    expect(failedJudges.has(JudgeId.ResearchSourceUrls)).toBe(true);
  });
});

describe("sanitize + judge pipeline", () => {
  it("repairs fit drift before judging", () => {
    const fixture = getEvalFixture("asha-us-staff-blocked");
    const raw = sampleAshaUsStaffBlocked();
    // Simulate model inconsistency: high score + blockers + wrong verdict.
    raw.fit.score = 93;
    raw.fit.verdict = FitVerdict.Excellent;

    const repairedFit = sanitizeFit(raw.fit);
    expect(repairedFit.score).toBe(HARD_BLOCKER_SCORE_CAP);
    expect(repairedFit.verdict).toBe(FitVerdict.Mixed);

    const sanitized = sanitizeAnalysis(
      {
        job: raw.job,
        fit: {
          score: 93,
          verdict: FitVerdict.Excellent,
          strongestMatches: raw.fit.strongestMatches,
          gaps: raw.fit.gaps,
          hardBlockers: raw.fit.hardBlockers,
          recommendation: raw.fit.recommendation,
        },
        company: raw.company,
        suggestions: raw.suggestions,
        missingFacts: raw.missingFacts,
      },
      fixture.snapshot,
      [],
      true,
    );

    // After hard-blocker cap, score is 55 → still inside blocked fixture range.
    const report = evaluateAnalysis(fixture, sanitized);
    expect(report.ok).toBe(true);
  });
});
