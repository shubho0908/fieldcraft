import { JOB_ANALYSIS_SCHEMA } from "./analysis-schema";
import { ANALYSIS_INSTRUCTIONS, buildAnalysisInput } from "./prompt";
import { getApiKey, getInstallId } from "./storage";
import type {
  CandidateProfile,
  ExtensionSettings,
  JobAnalysis,
  PageSnapshot,
} from "../types";

interface ResponsesApiResult {
  id?: string;
  status?: string;
  error?: { message?: string } | null;
  incomplete_details?: { reason?: string } | null;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
      annotations?: Array<{
        type?: string;
        url?: string;
        title?: string;
      }>;
    }>;
  }>;
}

export async function analyzeJob(
  snapshot: PageSnapshot,
  profile: CandidateProfile,
  settings: ExtensionSettings,
): Promise<JobAnalysis> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("Add an OpenAI API key in Settings before analyzing a job.");
  }

  const installId = await getInstallId();
  const body: Record<string, unknown> = {
    model: settings.model,
    store: false,
    safety_identifier: installId,
    reasoning: { effort: "medium" },
    instructions: ANALYSIS_INSTRUCTIONS,
    input: buildAnalysisInput(snapshot, profile, settings),
    text: {
      format: {
        type: "json_schema",
        name: "fieldcraft_job_analysis",
        strict: true,
        schema: JOB_ANALYSIS_SCHEMA,
      },
    },
    max_output_tokens: 14_000,
  };

  if (settings.researchCompany) {
    body.tools = [{ type: "web_search" }];
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as ResponsesApiResult;
  if (!response.ok) {
    const message = payload.error?.message || `OpenAI request failed (${response.status})`;
    throw new Error(message);
  }

  if (payload.status === "incomplete") {
    throw new Error(
      `Analysis stopped before completion${payload.incomplete_details?.reason ? `: ${payload.incomplete_details.reason}` : ""}. Try again.`,
    );
  }

  const refusal = payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "refusal")?.refusal;
  if (refusal) throw new Error(refusal);

  const outputText = extractOutputText(payload);
  if (!outputText) throw new Error("The model returned no analysis.");

  let parsed: Omit<JobAnalysis, "generatedAt">;
  try {
    parsed = JSON.parse(outputText) as Omit<JobAnalysis, "generatedAt">;
  } catch {
    throw new Error("The model returned an unreadable analysis. Try again.");
  }

  return sanitizeAnalysis(parsed, snapshot, extractCitations(payload));
}

export async function testOpenAiConnection(model: string): Promise<void> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("Enter and save an API key first.");
  const installId = await getInstallId();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      store: false,
      safety_identifier: installId,
      reasoning: { effort: "none" },
      input: "Reply with exactly: connected",
      max_output_tokens: 24,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as ResponsesApiResult;
  if (!response.ok) {
    throw new Error(payload.error?.message || `Connection failed (${response.status})`);
  }
}

export function extractOutputText(payload: ResponsesApiResult): string {
  if (payload.output_text) return payload.output_text;
  return (
    payload.output
      ?.filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .filter((content) => content.type === "output_text")
      .map((content) => content.text ?? "")
      .join("") ?? ""
  );
}

function sanitizeAnalysis(
  parsed: Omit<JobAnalysis, "generatedAt">,
  snapshot: PageSnapshot,
  citedSources: Array<{ title: string; url: string }>,
): JobAnalysis {
  const knownFieldIds = new Set(snapshot.fields.map((field) => field.id));
  const knownFields = new Map(snapshot.fields.map((field) => [field.id, field]));
  const seenSuggestions = new Set<string>();
  const generatedSuggestions = (parsed.suggestions ?? [])
    .filter((suggestion) => knownFieldIds.has(suggestion.fieldId))
    .filter((suggestion) => {
      if (seenSuggestions.has(suggestion.fieldId)) return false;
      seenSuggestions.add(suggestion.fieldId);
      return true;
    })
    .map((suggestion) => {
      const field = knownFields.get(suggestion.fieldId);
      if (!field) return suggestion;
      if (field.sensitive && suggestion.action === "fill") {
        return {
          ...suggestion,
          action: "review" as const,
          warning:
            suggestion.warning || "Sensitive answer: verify before filling.",
        };
      }
      const value = field.maxLength
        ? suggestion.value.slice(0, field.maxLength)
        : suggestion.value;
      return { ...suggestion, value };
    });

  const suggestions = [
    ...generatedSuggestions,
    ...snapshot.fields
      .filter((field) => !seenSuggestions.has(field.id))
      .map((field) => ({
        fieldId: field.id,
        label: field.label,
        action: "review" as const,
        value: "",
        confidence: "low" as const,
        evidence: "No grounded answer was returned",
        warning: "Review this field manually before filling.",
      })),
  ];

  const sources = dedupeSources([
    ...(parsed.company.sources ?? []),
    ...citedSources,
  ]).filter((source) => /^https?:\/\//i.test(source.url));

  return {
    ...parsed,
    fit: {
      ...parsed.fit,
      score: Math.max(0, Math.min(100, Math.round(parsed.fit.score))),
    },
    company: {
      ...parsed.company,
      sources,
    },
    suggestions,
    missingFacts: parsed.missingFacts ?? [],
    generatedAt: new Date().toISOString(),
  };
}

function extractCitations(
  payload: ResponsesApiResult,
): Array<{ title: string; url: string }> {
  return (
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .flatMap((content) => content.annotations ?? [])
      .filter(
        (annotation): annotation is { type?: string; url: string; title?: string } =>
          annotation.type === "url_citation" && Boolean(annotation.url),
      )
      .map((annotation) => ({
        title: annotation.title || new URL(annotation.url).hostname,
        url: annotation.url,
      })) ?? []
  );
}

function dedupeSources(
  sources: Array<{ title: string; url: string }>,
): Array<{ title: string; url: string }> {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.url.replace(/\/$/, "").toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
