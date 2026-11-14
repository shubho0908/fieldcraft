import type { CandidateProfile, JobAnalysis } from "../../types";
import type { JudgeId } from "../enums";
import type { EvalExpectations, EvalFixture, EvalReport, GroundingAudit, JudgeResult } from "./types";
import { analysisUnits, judgeGrounding } from "./grounding";

export function result(judge: JudgeId, problems: string[] = []): JudgeResult {
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
    judgeMustNotClaim(analysis, fixture.expectations, fixture.snapshot),
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

// Split coordinated assertions, but retain noun lists such as "no PhD or BS Nursing".
// Negation is checked against the matched assertion, never an arbitrary nearby window.
const ASSERTION_BOUNDARY = /[.!?;,\n]|\b(?:and|or|but|yet|because|while|whereas|although|however|so)\s+(?=(?:(?:the|this)\s+)?(?:candidate|applicant|i|he|she|they|we|you|is|am|are|has|have|holds?|possesses?|earned|completed|obtained|demonstrates?|brings?)\b)/giu;
const CLAIM_QUALIFIERS = "(?:(?:an?|any|the|current|active|verified|documented|professional|production|prior|relevant|explicit|formal|valid|required|mandatory|such|holding|having|being)\\s+)*";
const DIRECT_ABSENCE = new RegExp(
  `\\b(?:(?:no|without|lacks?|lacking|missing|neither)\\s+|lack\\s+of\\s+|(?:not|never|doesn't|isn't)\\s+(?:(?:have|has|hold|holds|possess|possesses|earned|completed|obtained|be|been|claim|claims|demonstrate|demonstrates|establish|establishes|document|documented|show|shows|support|supports)\\s+)?|(?:cannot|can't)\\s+(?:verify|confirm|establish|claim|demonstrate|document|support)\\s+)${CLAIM_QUALIFIERS}$`,
  "iu",
);
const EVIDENCE_ABSENCE = new RegExp(
  `\\b(?:no|without)\\s+(?:(?:explicit|documented|verified|supporting|sufficient)\\s+)?evidence(?:\\b[^.!?;,\\n]*\\b(?:of|for|supporting|supports|establishing|establishes|shows|showing|or|nor|and)|\\s+(?:that\\s+)?(?:(?:the|this)\\s+)?(?:candidate|applicant)(?:\\s+(?:has|holds?|possesses?|earned|completed|obtained))?)\\s+${CLAIM_QUALIFIERS}$`,
  "iu",
);
// Named absence forms ("no mention of", "no record of") assert that a claim is
// unsupported. They are scoped to the phrase they introduce, so they never
// exempt an unrelated assertion that follows.
const NAMED_ABSENCE = new RegExp(
  `\\b(?:no|without)\\s+(?:(?:explicit|documented|verified|mention|record|indication|trace|sign|reference|listing|sighting)\\s+of\\s+)${CLAIM_QUALIFIERS}$`,
  "iu",
);
const FOLLOWING_ABSENCE = /^\s+(?:(?:degree|licen[cs]e|licen[cs]ure|qualification|experience|credential|certification|status|background|evidence|claim|training)\s+)*(?:(?:is|are|was|were|has been|have been)\s+)?(?:not(?!\s+(?:only|just|merely|without|missing|absent|lacking|unsupported|unverified|undocumented)\b)|unverified|missing|absent|unsupported|undocumented)\b/iu;
const PRECEDING_REQUIREMENT = new RegExp(
  `\\b(?:requires?|requiring|(?:must|has\\s+to|required\\s+to)\\s+(?:have|hold|possess)|required(?:\\s+qualifications?)?\\s*:?|mandatory\\s*:?)\\s+${CLAIM_QUALIFIERS}$`,
  "iu",
);
const FOLLOWING_REQUIREMENT = /^\s+(?:(?:degree|licen[cs]e|licen[cs]ure|qualification|experience|credential|certification)\s+)*(?:(?:is|are)\s+)?(?:required|mandatory)\b/iu;

function assertionAt(text: string, start: number, end: number) {
  let left = 0;
  let right = text.length;
  for (const boundary of text.matchAll(ASSERTION_BOUNDARY)) {
    if (boundary.index < start) left = boundary.index + boundary[0].length;
    else if (boundary.index >= end) { right = boundary.index; break; }
  }
  return { text: text.slice(left, right), prefix: text.slice(left, start), suffix: text.slice(end, right) };
}

function explicitlyAboutApplicant(text: string): boolean {
  return /\b(?:i|my|me)\b|\b(?:candidate|applicant)['’]s\b|\b(?:candidate|applicant|resume|profile)\s*:|\b(?:candidate|applicant)(?:\s+(?:background|profile))?\s+(?:(?:already|currently|also|personally)\s+)*(?:is(?!\s+(?:required|expected|asked|obliged)\b)|has(?!\s+to\b)|holds?|possesses?|earned|completed|obtained|demonstrates?|brings?|meets?|qualifies|trained|worked|graduated)\b|\b(?:held|earned|completed|obtained|possessed|demonstrated)\s+by\s+(?:(?:the|this)\s+)?(?:candidate|applicant)\b/iu.test(text);
}

function isNegativeAssertion(prefix: string, suffix: string): boolean {
  const absence = DIRECT_ABSENCE.exec(prefix) ?? EVIDENCE_ABSENCE.exec(prefix) ?? NAMED_ABSENCE.exec(prefix);
  if (absence && !/\b(?:not|never|no|doesn't|isn't|can't|cannot)\s+(?:(?:currently|actually|really|entirely)\s+)*$/iu.test(prefix.slice(0, absence.index))) return true;
  return FOLLOWING_ABSENCE.test(suffix);
}

function normalizedClaim(text: string): string {
  return text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isPostedRoleOrRequirement(unitId: string, unitText: string, assertion: ReturnType<typeof assertionAt>, claim: string, snapshot?: EvalFixture["snapshot"]): boolean {
  if (!snapshot || explicitlyAboutApplicant(assertion.text)) return false;
  // Embedded instructions do not establish qualifications or company facts.
  const source = [snapshot.title, ...snapshot.headings, ...snapshot.pageText.split("\n").filter((line) => !/\b(?:ignore|invent|override)\b/iu.test(line))].join("\n");
  const normalizedSource = ` ${normalizedClaim(source)} `;
  if (!normalizedSource.includes(` ${normalizedClaim(claim)} `)) return false;
  if (unitId === "job.role") {
    return !explicitlyAboutApplicant(unitText) && [snapshot.title, ...snapshot.headings]
      .some((title) => ` ${normalizedClaim(title)} `.includes(` ${normalizedClaim(unitText)} `));
  }
  if (/^job\.(?:requirements|responsibilities|keywords)\./u.test(unitId) && !explicitlyAboutApplicant(unitText)
    && normalizedSource.includes(` ${normalizedClaim(unitText)} `)) return true;
  return PRECEDING_REQUIREMENT.test(assertion.prefix) || FOLLOWING_REQUIREMENT.test(assertion.suffix);
}

export function judgeMustNotClaim(analysis: JobAnalysis, expectations: EvalExpectations, snapshot?: EvalFixture["snapshot"]): JudgeResult {
  const problems: string[] = [];
  for (const unit of analysisUnits(analysis)) {
    for (const claim of expectations.mustNotClaim ?? []) {
      const escaped = claim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
      for (const match of unit.text.matchAll(pattern)) {
        const assertion = assertionAt(unit.text, match.index, match.index + match[0].length);
        if (isNegativeAssertion(assertion.prefix, assertion.suffix)) continue;
        if (!isPostedRoleOrRequirement(unit.id, unit.text, assertion, claim, snapshot)) {
          problems.push(`${unit.id}: forbidden positive claim ${JSON.stringify(claim)}`);
        }
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
