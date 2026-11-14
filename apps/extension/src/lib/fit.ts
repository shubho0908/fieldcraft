import {
  FIT_SCORE_BANDS,
  FitVerdict,
  HARD_BLOCKER_SCORE_CAP,
  type FitVerdict as FitVerdictType,
} from "./enums";
import type { JobAnalysis } from "../types";

export type { FitVerdictType as FitVerdict };

/** Score bands that define verdict labels. */
export function verdictForScore(score: number): FitVerdictType {
  for (const band of FIT_SCORE_BANDS) {
    if (score >= band.min && score <= band.max) return band.verdict;
  }
  // Out-of-range scores should not happen after clamp; default conservatively.
  return FitVerdict.Weak;
}

/**
 * Clamp score, enforce hard-blocker ceiling, and force verdict to match score band.
 * Model output is untrusted on consistency; this is the product invariant layer.
 */
export function sanitizeFit(
  fit: Partial<JobAnalysis["fit"]> | undefined,
): JobAnalysis["fit"] {
  const hardBlockers = cleanStringList(fit?.hardBlockers);
  let score = Math.max(0, Math.min(100, Math.round(Number(fit?.score) || 0)));

  if (hardBlockers.length > 0 && score > HARD_BLOCKER_SCORE_CAP) {
    score = HARD_BLOCKER_SCORE_CAP;
  }

  return {
    score,
    verdict: verdictForScore(score),
    strongestMatches: cleanStringList(fit?.strongestMatches),
    gaps: cleanStringList(fit?.gaps),
    hardBlockers,
    recommendation: (fit?.recommendation ?? "").trim(),
  };
}

export function isUnknownFact(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLocaleLowerCase();
  return !normalized || normalized === "unknown" || normalized === "n/a" || normalized === "na";
}

/**
 * Research is thin when it was requested but produced no sources and almost no
 * concrete company facts. Used for UI honesty, not for inventing data.
 */
export function isThinCompanyResearch(
  company: JobAnalysis["company"],
  researchAttempted: boolean,
): boolean {
  if (!researchAttempted) return false;
  if ((company.sources ?? []).length > 0) return false;

  const facts = [company.product, company.stage, company.size, company.funding];
  const unknownCount = facts.filter((fact) => isUnknownFact(fact)).length;
  return unknownCount >= 3;
}

export function cleanStringList(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
