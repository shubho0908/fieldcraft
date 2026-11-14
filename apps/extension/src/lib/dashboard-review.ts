import { Confidence, SuggestionAction } from "./enums";
import type { FieldSuggestion, JobAnalysis, TabAnalysisSession } from "../types";

export type ResultTab = "fit" | "answers" | "research";

export type ReviewDraft = {
  runId: string;
  analysis: JobAnalysis;
  selectedFieldIds: Set<string>;
};

export function defaultSelection(suggestions: FieldSuggestion[]): Set<string> {
  const ids: string[] = [];
  for (const item of suggestions) {
    if (
      item.action === SuggestionAction.Fill &&
      item.confidence !== Confidence.Low &&
      !item.warning &&
      item.value.trim()
    ) {
      ids.push(item.fieldId);
    }
  }
  return new Set(ids);
}

export function createReviewDraft(session: TabAnalysisSession): ReviewDraft | null {
  if (!session.analysis || !session.snapshot) return null;
  return {
    runId: session.runId,
    analysis: session.analysis,
    selectedFieldIds: new Set(
      session.selectedFieldIds.length
        ? session.selectedFieldIds
        : defaultSelection(session.analysis.suggestions),
    ),
  };
}
