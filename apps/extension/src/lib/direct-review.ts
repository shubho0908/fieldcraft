import { toSafeAnalysis } from "./analysis";
import { buildDirectSuggestions } from "./direct-fill";
import { unavailableFit } from "./fit";
import type { CandidateProfile, JobAnalysis, PageSnapshot } from "../types";

export function prepareDirectReview(snapshot: PageSnapshot, profile: CandidateProfile): JobAnalysis {
  return toSafeAnalysis({
    fit: unavailableFit("Direct-fill maps saved profile facts only. Review and select answers, then choose Fill selected. No fit analysis was performed."),
    suggestions: buildDirectSuggestions(snapshot, profile),
  }, snapshot);
}
