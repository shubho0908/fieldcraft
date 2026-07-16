import { useMemo, useState } from "react";
import {
  createReviewDraft,
  defaultSelection,
  type ResultTab,
  type ReviewDraft,
} from "../lib/dashboard-review";
import { SuggestionAction } from "../lib/enums";
import type { FieldSuggestion, RuntimeRequest } from "../types";
import {
  AnalysisLoader,
  EmptyDashboard,
  ResultsDashboard,
  RetryDashboard,
} from "./DashboardViews";
import { useDashboardBinding } from "./useDashboardBinding";

interface Props {
  apiKeyExists: boolean;
  onOpenSettings: () => void;
}

export default function Dashboard({ apiKeyExists, onOpenSettings }: Props) {
  const { binding, bindIssue, session, setSession } = useDashboardBinding();
  const [review, setReview] = useState<ReviewDraft | null>(null);
  const [reviewSeed, setReviewSeed] = useState("");
  const [activeTab, setActiveTab] = useState<ResultTab>("fit");
  const [toast, setToast] = useState("");

  if (session?.analysis && session.snapshot) {
    if (reviewSeed !== session.runId) {
      setReviewSeed(session.runId);
      setReview(createReviewDraft(session));
    }
  } else if (reviewSeed !== "") {
    setReviewSeed("");
    setReview(null);
  }

  const analysis = review && review.runId === session?.runId ? review.analysis : session?.analysis;
  const snapshot = session?.snapshot ?? null;
  const status = session?.status ?? "idle";
  const error = session?.error ?? "";
  const emptySelection = useMemo(() => new Set<string>(), []);
  const selected =
    review && review.runId === session?.runId ? review.selectedFieldIds : emptySelection;

  const selectedSuggestions = useMemo(() => {
    if (!analysis) return [] as FieldSuggestion[];
    const next: FieldSuggestion[] = [];
    for (const item of analysis.suggestions) {
      if (selected.has(item.fieldId)) next.push(item);
    }
    return next;
  }, [analysis, selected]);

  function analyze() {
    if (status === "capturing" || status === "analyzing" || status === "filling") return;
    if (!apiKeyExists) {
      onOpenSettings();
      return;
    }
    if (!binding) return;
    setActiveTab("fit");
    setSession((current) =>
      current?.tabId === binding.id
        ? { ...current, status: "capturing", error: "", fillResults: [] }
        : current,
    );
    void chrome.runtime.sendMessage({
      type: "FIELDCRAFT_START_ANALYSIS",
      tabId: binding.id,
    } satisfies RuntimeRequest);
  }

  function fillSelected() {
    if (!binding || !review || !selectedSuggestions.length) return;
    void chrome.runtime
      .sendMessage({
        type: "FIELDCRAFT_FILL_TAB",
        tabId: binding.id,
        url: binding.url,
        runId: review.runId,
        suggestions: selectedSuggestions,
      } satisfies RuntimeRequest)
      .then((response) => {
        if (!response?.ok) return;
        const results = response.results as Array<{ status: string }>;
        let filled = 0;
        let failed = 0;
        for (const result of results) {
          if (result.status === "filled") filled += 1;
          if (result.status === "failed") failed += 1;
        }
        setToast(
          `${filled} field${filled === 1 ? "" : "s"} filled${failed ? ` · ${failed} need attention` : ""}`,
        );
        window.setTimeout(() => setToast(""), 4200);
      });
  }

  function saveReview(nextAnalysis: ReviewDraft["analysis"], selectedFieldIds: Set<string>) {
    if (!binding || !review) return;
    const nextReview = { runId: review.runId, analysis: nextAnalysis, selectedFieldIds };
    setReview(nextReview);
    void chrome.runtime.sendMessage({
      type: "FIELDCRAFT_UPDATE_TAB_REVIEW",
      tabId: binding.id,
      url: binding.url,
      runId: nextReview.runId,
      analysis: nextReview.analysis,
      selectedFieldIds: [...nextReview.selectedFieldIds],
    } satisfies RuntimeRequest);
  }

  function updateSuggestion(fieldId: string, value: string) {
    if (!review) return;
    saveReview(
      {
        ...review.analysis,
        suggestions: review.analysis.suggestions.map((item) =>
          item.fieldId === fieldId
            ? { ...item, value, action: value.trim() ? SuggestionAction.Review : item.action }
            : item,
        ),
      },
      review.selectedFieldIds,
    );
  }

  function toggleSelected(fieldId: string) {
    if (!review) return;
    const next = new Set(review.selectedFieldIds);
    if (next.has(fieldId)) next.delete(fieldId);
    else next.add(fieldId);
    saveReview(review.analysis, next);
  }

  if (!analysis && status !== "analyzing" && status !== "capturing") {
    return (
      <EmptyDashboard
        apiKeyExists={apiKeyExists}
        bindIssue={bindIssue}
        error={error}
        canAnalyze={Boolean(apiKeyExists && binding)}
        onOpenSettings={onOpenSettings}
        onAnalyze={analyze}
      />
    );
  }

  if (status === "capturing" || status === "analyzing") {
    return <AnalysisLoader stage={status} />;
  }

  if (!analysis || !snapshot) {
    return <RetryDashboard error={error} onOpenSettings={onOpenSettings} onAnalyze={analyze} />;
  }

  return (
    <ResultsDashboard
      analysis={analysis}
      snapshot={snapshot}
      status={status}
      error={error}
      activeTab={activeTab}
      selected={selected}
      selectedCount={selectedSuggestions.length}
      fillResults={session?.fillResults ?? []}
      toast={toast}
      onOpenSettings={onOpenSettings}
      onAnalyze={analyze}
      onTab={setActiveTab}
      onToggle={toggleSelected}
      onChange={updateSuggestion}
      onSelectSafe={() => saveReview(analysis, defaultSelection(analysis.suggestions))}
      onFill={fillSelected}
    />
  );
}
