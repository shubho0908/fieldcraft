import type { CandidateProfile, JobAnalysis } from "../../types";
import type { AccuracyJudgeId, EvalExpectations, EvalFixture, EvalReport, GroundingAudit, JudgeResult } from "./types";
import { analysisUnits, judgeGrounding } from "./grounding";

export function result(judge: AccuracyJudgeId, problems: string[] = []): JudgeResult {
  return { judge, ok: !problems.length, ...(problems.length ? { message: problems.join("; ") } : {}) };
}

export function report(fixtureId: string, results: JudgeResult[]): EvalReport {
  return {
    fixtureId, results, ok: results.every((item) => item.ok),
    failures: results.filter((item) => !item.ok).map((item) => ({ judge: item.judge, message: item.message || "failed" })),
  };
}

export function evaluateAnalysis(fixture: EvalFixture, analysis: JobAnalysis, audit?: GroundingAudit): EvalReport {
  const results = [
    judgeFitScoreRange(analysis, fixture.expectations),
    result("fit.expected_verdict", fixture.expectations.verdict && analysis.fit.verdict !== fixture.expectations.verdict
      ? [`expected ${fixture.expectations.verdict}, received ${analysis.fit.verdict}`] : []),
    judgeRequiredBlockers(analysis, fixture.expectations),
    judgeFieldExpectations(analysis, fixture.expectations),
    judgeBannedPhrases(analysis, fixture.profile),
    judgeMustNotClaim(analysis, fixture.expectations),
  ];
  if (audit) results.push(judgeGrounding(analysis, audit));
  return report(fixture.id, results);
}

export function judgeFitScoreRange(analysis: JobAnalysis, expectations: EvalExpectations): JudgeResult {
  const score: number | null = analysis.fit.score;
  const range = expectations.score;
  const valid = range === null ? score === null
    : typeof score === "number" && Number.isFinite(score) && score >= range.min && score <= range.max;
  return result("fit.score_range", valid ? [] : [`score ${score} outside expected ${range ? `[${range.min}, ${range.max}]` : "unavailable (null)"}`]);
}

export function judgeRequiredBlockers(analysis: JobAnalysis, expectations: EvalExpectations): JudgeResult {
  const text = analysis.fit.hardBlockers.join(" · ").toLowerCase();
  return result("fit.required_blockers", (expectations.requiredBlockerSubstrings ?? [])
    .filter((needle) => !text.includes(needle.toLowerCase())).map((needle) => `missing blocker: ${needle}`));
}

export function judgeBannedPhrases(analysis: JobAnalysis, profile: CandidateProfile): JudgeResult {
  const phrases = profile.voice.bannedPhrases.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return result("writing.banned_phrases", analysis.suggestions.flatMap((s) => phrases
    .filter((phrase) => s.value.toLowerCase().includes(phrase)).map((phrase) => `${s.fieldId}: ${phrase}`)));
}

export function judgeMustNotClaim(analysis: JobAnalysis, expectations: EvalExpectations): JudgeResult {
  const problems: string[] = [];
  for (const unit of analysisUnits(analysis)) {
    for (const claim of expectations.mustNotClaim ?? []) {
      const escaped = claim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
      for (const match of unit.text.matchAll(pattern)) {
        const prefix = unit.text.slice(0, match.index).split(/[.!?;\n]/).at(-1) ?? "";
        const suffix = unit.text.slice((match.index ?? 0) + match[0].length).split(/[.!?;\n]/)[0];
        const negated = /\b(?:not|no|never|without|lacks?|neither|doesn't|isn't|cannot|can't)\b[^,;:.!?]{0,65}$/i.test(prefix)
          || /^\s+(?:is|was|are)\s+(?:not|unverified)\b/i.test(suffix);
        if (!negated) problems.push(`${unit.id}: forbidden positive claim ${JSON.stringify(claim)}`);
      }
    }
  }
  return result("truth.must_not_claim", problems);
}

export function judgeFieldExpectations(analysis: JobAnalysis, expectations: EvalExpectations): JudgeResult {
  const problems: string[] = [];
  for (const wanted of expectations.fields ?? []) {
    const actual = analysis.suggestions.find((s) => s.fieldId === wanted.fieldId);
    if (!actual) { problems.push(`${wanted.fieldId}: missing`); continue; }
    if (wanted.action && actual.action !== wanted.action) problems.push(`${wanted.fieldId}: action ${actual.action} != ${wanted.action}`);
    if (wanted.valueEquals !== undefined && actual.value.trim() !== wanted.valueEquals.trim()) problems.push(`${wanted.fieldId}: value mismatch`);
    if (wanted.valueIncludes && !actual.value.toLowerCase().includes(wanted.valueIncludes.toLowerCase())) problems.push(`${wanted.fieldId}: missing ${wanted.valueIncludes}`);
    if (wanted.valueExcludes && actual.value.toLowerCase().includes(wanted.valueExcludes.toLowerCase())) problems.push(`${wanted.fieldId}: contains ${wanted.valueExcludes}`);
  }
  return result("fields.expectations", problems);
}
