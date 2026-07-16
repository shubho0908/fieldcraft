import type { JudgeId, SuggestionAction } from "../enums";
import type {
  CandidateProfile,
  JobAnalysis,
  PageSnapshot,
} from "../../types";

export interface ScoreRange {
  min: number;
  max: number;
}

export interface FieldExpectation {
  fieldId: string;
  /** If set, action must match exactly. */
  action?: SuggestionAction;
  /** If set, value must equal (after trim). */
  valueEquals?: string;
  /** If set, filled/reviewed value must include this substring (case-insensitive). */
  valueIncludes?: string;
  /** If set, value must not include this substring (case-insensitive). */
  valueExcludes?: string;
}

/**
 * Golden expectations for one profile × job pair.
 * Ranges are intentional: fit is judgmental; we pin structure and hard facts.
 */
export interface EvalExpectations {
  score: ScoreRange;
  /** Each entry must appear as a case-insensitive substring of some hardBlocker. */
  requiredBlockerSubstrings?: string[];
  /** Candidate claims that must never appear in suggestion values. */
  mustNotClaim?: string[];
  fields?: FieldExpectation[];
}

export interface EvalFixture {
  id: string;
  description: string;
  profile: CandidateProfile;
  snapshot: PageSnapshot;
  researchAttempted: boolean;
  expectations: EvalExpectations;
}

export interface JudgeFailure {
  judge: JudgeId;
  message: string;
}

export interface JudgeResult {
  judge: JudgeId;
  ok: boolean;
  message?: string;
}

export interface EvalReport {
  fixtureId: string;
  ok: boolean;
  results: JudgeResult[];
  failures: JudgeFailure[];
}
