import {
  HARD_BLOCKER_SCORE_CAP,
  JudgeId,
  PageFieldKind,
  SuggestionAction,
  type JudgeId as JudgeIdType,
} from "../enums";
import { optionMatches } from "../fields";
import { verdictForScore } from "../fit";
import type {
  CandidateProfile,
  JobAnalysis,
  PageSnapshot,
} from "../../types";
import type {
  EvalExpectations,
  EvalFixture,
  EvalReport,
  JudgeResult,
} from "./types";

/** Run the full deterministic judge suite against a sanitized analysis. */
export function evaluateAnalysis(
  fixture: EvalFixture,
  analysis: JobAnalysis,
): EvalReport {
  const results = [
    judgeFitScoreRange(analysis, fixture.expectations),
    judgeFitVerdictMatchesScore(analysis),
    judgeHardBlockerScoreCap(analysis),
    judgeRequiredBlockers(analysis, fixture.expectations),
    judgeFieldCoverage(analysis, fixture.snapshot),
    judgeUniqueFieldIds(analysis),
    judgeSelectOptionValidity(analysis, fixture.snapshot),
    judgeFillRequiresEvidence(analysis),
    judgeEmptyFillForbidden(analysis),
    judgeSensitiveSafety(analysis, fixture.snapshot),
    judgeBannedPhrases(analysis, fixture.profile),
    judgeMustNotClaim(analysis, fixture.expectations),
    judgeFieldExpectations(analysis, fixture.expectations),
    judgeResearchMeta(analysis, fixture),
    judgeSourceUrls(analysis),
  ];

  const failures = [];
  for (const result of results) {
    if (result.ok) continue;
    failures.push({
      judge: result.judge,
      message: result.message || "failed",
    });
  }

  return {
    fixtureId: fixture.id,
    ok: failures.length === 0,
    results,
    failures,
  };
}

export function judgeFitScoreRange(
  analysis: JobAnalysis,
  expectations: EvalExpectations,
): JudgeResult {
  const score = analysis.fit.score;
  const { min, max } = expectations.score;
  if (score < min || score > max) {
    return fail(
      JudgeId.FitScoreRange,
      `score ${score} outside expected [${min}, ${max}]`,
    );
  }
  return pass(JudgeId.FitScoreRange);
}

export function judgeFitVerdictMatchesScore(analysis: JobAnalysis): JudgeResult {
  const expected = verdictForScore(analysis.fit.score);
  if (analysis.fit.verdict !== expected) {
    return fail(
      JudgeId.FitVerdictBand,
      `verdict "${analysis.fit.verdict}" does not match score ${analysis.fit.score} (expected ${expected})`,
    );
  }
  return pass(JudgeId.FitVerdictBand);
}

export function judgeHardBlockerScoreCap(analysis: JobAnalysis): JudgeResult {
  if (
    analysis.fit.hardBlockers.length > 0 &&
    analysis.fit.score > HARD_BLOCKER_SCORE_CAP
  ) {
    return fail(
      JudgeId.FitHardBlockerCap,
      `hard blockers present but score is ${analysis.fit.score} (> ${HARD_BLOCKER_SCORE_CAP})`,
    );
  }
  return pass(JudgeId.FitHardBlockerCap);
}

export function judgeRequiredBlockers(
  analysis: JobAnalysis,
  expectations: EvalExpectations,
): JudgeResult {
  const required = expectations.requiredBlockerSubstrings ?? [];
  if (required.length === 0) return pass(JudgeId.FitRequiredBlockers);

  const joined = analysis.fit.hardBlockers.join(" · ").toLocaleLowerCase();
  const missing = required.filter(
    (needle) => !joined.includes(needle.toLocaleLowerCase()),
  );
  if (missing.length > 0) {
    return fail(
      JudgeId.FitRequiredBlockers,
      `missing blocker signal(s): ${missing.join(", ")}`,
    );
  }
  return pass(JudgeId.FitRequiredBlockers);
}

export function judgeFieldCoverage(
  analysis: JobAnalysis,
  snapshot: PageSnapshot,
): JudgeResult {
  const suggested = new Set(analysis.suggestions.map((item) => item.fieldId));
  const missing: string[] = [];
  for (const field of snapshot.fields) {
    if (!suggested.has(field.id)) missing.push(field.id);
  }
  if (missing.length > 0) {
    return fail(
      JudgeId.FieldsCoverage,
      `missing suggestions for: ${missing.join(", ")}`,
    );
  }
  return pass(JudgeId.FieldsCoverage);
}

export function judgeUniqueFieldIds(analysis: JobAnalysis): JudgeResult {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const suggestion of analysis.suggestions) {
    if (seen.has(suggestion.fieldId)) dupes.push(suggestion.fieldId);
    seen.add(suggestion.fieldId);
  }
  if (dupes.length > 0) {
    return fail(
      JudgeId.FieldsUniqueIds,
      `duplicate fieldIds: ${dupes.join(", ")}`,
    );
  }
  return pass(JudgeId.FieldsUniqueIds);
}

export function judgeSelectOptionValidity(
  analysis: JobAnalysis,
  snapshot: PageSnapshot,
): JudgeResult {
  const fields = new Map(snapshot.fields.map((field) => [field.id, field]));
  const invalid: string[] = [];

  for (const suggestion of analysis.suggestions) {
    if (suggestion.action !== SuggestionAction.Fill) continue;
    const field = fields.get(suggestion.fieldId);
    if (
      !field ||
      (field.kind !== PageFieldKind.Select && field.kind !== PageFieldKind.Radio)
    ) {
      continue;
    }
    if (!field.options.length) continue;
    if (!optionMatches(field, suggestion.value)) {
      invalid.push(`${suggestion.fieldId}→${JSON.stringify(suggestion.value)}`);
    }
  }

  if (invalid.length > 0) {
    return fail(
      JudgeId.FieldsSelectOptions,
      `fill values not in options: ${invalid.join(", ")}`,
    );
  }
  return pass(JudgeId.FieldsSelectOptions);
}

export function judgeFillRequiresEvidence(analysis: JobAnalysis): JudgeResult {
  const bad = analysis.suggestions.filter(
    (item) =>
      item.action === SuggestionAction.Fill &&
      item.value.trim() &&
      !item.evidence.trim(),
  );
  if (bad.length > 0) {
    return fail(
      JudgeId.FieldsFillEvidence,
      `fill without evidence: ${bad.map((item) => item.fieldId).join(", ")}`,
    );
  }
  return pass(JudgeId.FieldsFillEvidence);
}

export function judgeEmptyFillForbidden(analysis: JobAnalysis): JudgeResult {
  const bad = analysis.suggestions.filter(
    (item) => item.action === SuggestionAction.Fill && !item.value.trim(),
  );
  if (bad.length > 0) {
    return fail(
      JudgeId.FieldsEmptyFill,
      `empty fill actions: ${bad.map((item) => item.fieldId).join(", ")}`,
    );
  }
  return pass(JudgeId.FieldsEmptyFill);
}

export function judgeSensitiveSafety(
  analysis: JobAnalysis,
  snapshot: PageSnapshot,
): JudgeResult {
  const sensitiveIds = new Set<string>();
  for (const field of snapshot.fields) {
    if (field.sensitive) sensitiveIds.add(field.id);
  }
  const bad: typeof analysis.suggestions = [];
  for (const item of analysis.suggestions) {
    if (
      sensitiveIds.has(item.fieldId) &&
      item.action === SuggestionAction.Fill &&
      item.value.trim()
    ) {
      bad.push(item);
    }
  }
  if (bad.length > 0) {
    return fail(
      JudgeId.FieldsSensitive,
      `sensitive fields filled without review gate: ${bad
        .map((item) => item.fieldId)
        .join(", ")}`,
    );
  }
  return pass(JudgeId.FieldsSensitive);
}

export function judgeBannedPhrases(
  analysis: JobAnalysis,
  profile: CandidateProfile,
): JudgeResult {
  const phrases = profile.voice.bannedPhrases
    .split(",")
    .map((part) => part.trim().toLocaleLowerCase())
    .filter(Boolean);
  if (phrases.length === 0) return pass(JudgeId.WritingBannedPhrases);

  const hits: string[] = [];
  for (const suggestion of analysis.suggestions) {
    if (!suggestion.value.trim()) continue;
    const haystack = suggestion.value.toLocaleLowerCase();
    for (const phrase of phrases) {
      if (haystack.includes(phrase)) {
        hits.push(`${suggestion.fieldId}:"${phrase}"`);
      }
    }
  }
  if (hits.length > 0) {
    return fail(
      JudgeId.WritingBannedPhrases,
      `banned phrase hits: ${hits.join(", ")}`,
    );
  }
  return pass(JudgeId.WritingBannedPhrases);
}

export function judgeMustNotClaim(
  analysis: JobAnalysis,
  expectations: EvalExpectations,
): JudgeResult {
  const claims = expectations.mustNotClaim ?? [];
  if (claims.length === 0) return pass(JudgeId.TruthMustNotClaim);

  const hits: string[] = [];
  for (const claim of claims) {
    const needle = claim.toLocaleLowerCase();
    for (const suggestion of analysis.suggestions) {
      if (suggestion.value.toLocaleLowerCase().includes(needle)) {
        hits.push(`${suggestion.fieldId}:"${claim}"`);
      }
    }
    if (analysis.fit.recommendation.toLocaleLowerCase().includes(needle)) {
      hits.push(`fit.recommendation:"${claim}"`);
    }
  }
  if (hits.length > 0) {
    return fail(
      JudgeId.TruthMustNotClaim,
      `forbidden claims: ${hits.join(", ")}`,
    );
  }
  return pass(JudgeId.TruthMustNotClaim);
}

export function judgeFieldExpectations(
  analysis: JobAnalysis,
  expectations: EvalExpectations,
): JudgeResult {
  const wanted = expectations.fields ?? [];
  if (wanted.length === 0) return pass(JudgeId.FieldsExpectations);

  const byId = new Map(analysis.suggestions.map((item) => [item.fieldId, item]));
  const problems: string[] = [];

  for (const expect of wanted) {
    const actual = byId.get(expect.fieldId);
    if (!actual) {
      problems.push(`${expect.fieldId}: missing`);
      continue;
    }
    if (expect.action && actual.action !== expect.action) {
      problems.push(
        `${expect.fieldId}: action ${actual.action} ≠ ${expect.action}`,
      );
    }
    if (
      expect.valueEquals !== undefined &&
      actual.value.trim() !== expect.valueEquals.trim()
    ) {
      problems.push(`${expect.fieldId}: value mismatch`);
    }
    if (
      expect.valueIncludes &&
      !actual.value
        .toLocaleLowerCase()
        .includes(expect.valueIncludes.toLocaleLowerCase())
    ) {
      problems.push(`${expect.fieldId}: missing "${expect.valueIncludes}"`);
    }
    if (
      expect.valueExcludes &&
      actual.value
        .toLocaleLowerCase()
        .includes(expect.valueExcludes.toLocaleLowerCase())
    ) {
      problems.push(
        `${expect.fieldId}: contains excluded "${expect.valueExcludes}"`,
      );
    }
  }

  if (problems.length > 0) {
    return fail(JudgeId.FieldsExpectations, problems.join("; "));
  }
  return pass(JudgeId.FieldsExpectations);
}

export function judgeResearchMeta(
  analysis: JobAnalysis,
  fixture: EvalFixture,
): JudgeResult {
  if (analysis.research.attempted !== fixture.researchAttempted) {
    return fail(
      JudgeId.ResearchAttempted,
      `research.attempted=${analysis.research.attempted}, expected ${fixture.researchAttempted}`,
    );
  }
  if (
    fixture.expectations.researchAttempted !== undefined &&
    analysis.research.attempted !== fixture.expectations.researchAttempted
  ) {
    return fail(
      JudgeId.ResearchAttempted,
      `expectation researchAttempted=${fixture.expectations.researchAttempted}`,
    );
  }
  return pass(JudgeId.ResearchAttempted);
}

export function judgeSourceUrls(analysis: JobAnalysis): JudgeResult {
  const bad = analysis.company.sources.filter(
    (source) => !/^https?:\/\//i.test(source.url),
  );
  if (bad.length > 0) {
    return fail(
      JudgeId.ResearchSourceUrls,
      `non-http sources: ${bad.map((source) => source.url).join(", ")}`,
    );
  }
  return pass(JudgeId.ResearchSourceUrls);
}

function pass(judge: JudgeIdType): JudgeResult {
  return { judge, ok: true };
}

function fail(judge: JudgeIdType, message: string): JudgeResult {
  return { judge, ok: false, message };
}
