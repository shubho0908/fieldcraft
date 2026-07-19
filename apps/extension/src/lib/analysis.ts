import { Confidence, SuggestionAction, isConfidence, isSuggestionAction } from "./enums";
import { cleanStringList, sanitizeFit } from "./fit";
import type { FieldSuggestion, JobAnalysis, PageSnapshot } from "../types";

function sanitizeJob(
  job: Partial<JobAnalysis["job"]> | undefined,
  snapshot?: PageSnapshot,
): JobAnalysis["job"] {
  return {
    company: (job?.company ?? snapshot?.hostname ?? "").trim(),
    role: (job?.role ?? snapshot?.title ?? "").trim(),
    location: (job?.location ?? "").trim(),
    employmentType: (job?.employmentType ?? "").trim(),
    seniority: (job?.seniority ?? "").trim(),
    summary: (job?.summary ?? "").trim(),
    requirements: cleanStringList(job?.requirements),
    responsibilities: cleanStringList(job?.responsibilities),
    keywords: cleanStringList(job?.keywords),
    compensation: (job?.compensation ?? "").trim(),
    remotePolicy: (job?.remotePolicy ?? "").trim(),
  };
}

function sanitizeCompany(
  company: Partial<JobAnalysis["company"]> | undefined,
): JobAnalysis["company"] {
  return {
    summary: (company?.summary ?? "").trim(),
    product: (company?.product ?? "").trim(),
    stage: (company?.stage ?? "").trim(),
    size: (company?.size ?? "").trim(),
    funding: (company?.funding ?? "").trim(),
    engineeringSignals: cleanStringList(company?.engineeringSignals),
    risks: cleanStringList(company?.risks),
    sources: (company?.sources ?? []).filter(
      (source): source is { title: string; url: string } =>
        typeof source?.title === "string" && typeof source?.url === "string",
    ),
  };
}

function sanitizeSuggestions(suggestions: unknown): FieldSuggestion[] {
  const list = Array.isArray(suggestions) ? suggestions : [];
  return list.map((item) => ({
    fieldId: String(item?.fieldId ?? ""),
    label: String(item?.label ?? item?.fieldId ?? ""),
    action: isSuggestionAction(String(item?.action))
      ? (item.action as FieldSuggestion["action"])
      : SuggestionAction.Review,
    value: String(item?.value ?? ""),
    confidence: isConfidence(String(item?.confidence))
      ? (item.confidence as FieldSuggestion["confidence"])
      : Confidence.Low,
    evidence: String(item?.evidence ?? ""),
    warning: String(item?.warning ?? ""),
  }));
}

/**
 * Coerce a partially-populated or malformed analysis into a fully-typed,
 * crash-safe JobAnalysis. Used both after model generation and when loading
 * persisted tab sessions that may have been written by older/faulty code.
 */
export function toSafeAnalysis(
  raw: Partial<JobAnalysis> | undefined,
  snapshot?: PageSnapshot,
): JobAnalysis {
  const fit = sanitizeFit(raw?.fit);
  const job = sanitizeJob(raw?.job, snapshot);
  const company = sanitizeCompany(raw?.company);
  const suggestions = sanitizeSuggestions(raw?.suggestions);
  const missingFacts = cleanStringList(raw?.missingFacts);
  const research = {
    attempted: raw?.research?.attempted ?? false,
    thin: raw?.research?.thin ?? false,
    issue: raw?.research?.issue,
  };
  return {
    ...(raw ?? {}),
    job,
    fit,
    company,
    suggestions,
    missingFacts,
    research,
    generatedAt: raw?.generatedAt ?? new Date().toISOString(),
  } as JobAnalysis;
}
