import type { FitVerdict, JudgeId, SuggestionAction } from "../enums";
import type { CandidateProfile, PageSnapshot } from "../../types";

export interface ScoreRange { min: number; max: number }
export interface FieldExpectation {
  fieldId: string;
  action?: SuggestionAction;
  valueEquals?: string;
  valueIncludes?: string;
  valueExcludes?: string;
}
export interface EvalExpectations {
  score: ScoreRange | null;
  verdict?: FitVerdict | null;
  requiredBlockerSubstrings?: string[];
  mustNotClaim?: string[];
  fields?: FieldExpectation[];
}
export interface EvalFixture {
  id: string;
  description: string;
  provenance: "authored-realistic";
  coverage: string[];
  company: { name: string; officialDomain: string; researchAllowed: boolean };
  profile: CandidateProfile;
  snapshot: PageSnapshot;
  expectations: EvalExpectations;
}
export interface JudgeFailure { judge: JudgeId; message: string }
export interface JudgeResult { judge: JudgeId; ok: boolean; message?: string }
export interface EvalReport {
  fixtureId: string;
  ok: boolean;
  results: JudgeResult[];
  failures: JudgeFailure[];
}
export interface GroundingSource {
  id: string;
  text: string;
  kind: "profile" | "job" | "research";
  url?: string;
}
export interface AnalysisUnit {
  id: string;
  text: string;
  allowedSources: GroundingSource["kind"][];
}
export interface GroundingFinding {
  id: string;
  status: "supported" | "unsupported" | "no_factual_claim";
  reason: string;
  citations: Array<{ sourceId: string; quote: string }>;
}
export interface GroundingAudit {
  findings: GroundingFinding[];
  sources: GroundingSource[];
}
