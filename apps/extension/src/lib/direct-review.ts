import { toSafeAnalysis } from "./analysis";
import { buildDirectSuggestions } from "./direct-fill";
import { FitVerdict } from "./enums";
import type { CandidateProfile, JobAnalysis, PageSnapshot } from "../types";

export function prepareDirectReview(snapshot: PageSnapshot, profile: CandidateProfile): JobAnalysis {
  return toSafeAnalysis({
    fitUnavailableReason: "Direct-fill maps saved profile facts only. Review and select answers, then choose Fill selected. No fit analysis was performed.",
    fit: { score: 0, verdict: FitVerdict.Weak, strongestMatches: [], gaps: [], hardBlockers: [], recommendation: "Review saved profile answers" },
    suggestions: buildDirectSuggestions(snapshot, profile),
  }, snapshot);
}
