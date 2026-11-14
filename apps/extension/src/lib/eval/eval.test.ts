import { describe, expect, it } from "vitest";
import { EVAL_FIXTURES, getEvalFixture } from "./fixtures";
import { evaluateAnalysis } from "./judges";
import { FIT_SCORE_BANDS } from "../enums";

describe("accuracy fixture contract", () => {
  it("ships unique full-length scenarios rather than hand-written model samples", () => {
    expect(EVAL_FIXTURES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(EVAL_FIXTURES.map((fixture) => fixture.id)).size).toBe(EVAL_FIXTURES.length);
    for (const fixture of EVAL_FIXTURES) {
      expect(getEvalFixture(fixture.id)).toBe(fixture);
      expect(fixture.profile.resumeText.length).toBeGreaterThan(1500);
      if (fixture.snapshot.jobDescriptionDetected) expect(fixture.snapshot.pageText.length).toBeGreaterThan(1500);
    }
  });

  it("keeps every numeric score range wholly inside its expected verdict band", () => {
    for (const fixture of EVAL_FIXTURES) {
      const { score, verdict } = fixture.expectations;
      if (score === null) {
        expect(verdict).toBeNull();
        expect(fixture.snapshot.jobDescriptionDetected).toBe(false);
        continue;
      }
      const band = FIT_SCORE_BANDS.find((item) => item.verdict === verdict)!;
      expect(score.min).toBeGreaterThanOrEqual(band.min);
      expect(score.max).toBeLessThanOrEqual(band.max);
      expect(score.min).toBeLessThanOrEqual(score.max);
    }
  });

  it("rejects an analysis that disagrees with a clear expected verdict", () => {
    const fixture = EVAL_FIXTURES.find((item) => item.expectations.verdict === "strong")!;
    const report = evaluateAnalysis(fixture, {
      job: { summary: "" }, fit: { score: 20, verdict: "weak", strongestMatches: [], gaps: [], hardBlockers: [], recommendation: "" },
      company: { sources: [] }, suggestions: [], missingFacts: [],
    } as never);
    expect(report.ok).toBe(false);
    expect(report.failures.some((item) => item.judge === "fit.expected_verdict")).toBe(true);
  });
});
