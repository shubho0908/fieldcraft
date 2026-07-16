import { JOB_ANALYSIS_SCHEMA } from "./analysis-schema";
import {
  Confidence,
  PageFieldKind,
  SuggestionAction,
  isConfidence,
  isSuggestionAction,
} from "./enums";
import { isChoiceField, optionMatches } from "./fields";
import { isThinCompanyResearch, sanitizeFit } from "./fit";
import {
  CONNECTION_TEST_REASONING_EFFORT,
  resolveAnalysisConfig,
  resolveModel,
} from "./models";
import { ANALYSIS_INSTRUCTIONS, buildAnalysisInput } from "./prompt";
import { getApiKey, getInstallId } from "./storage";
import type {
  CandidateProfile,
  ExtensionSettings,
  FieldSuggestion,
  JobAnalysis,
  PageField,
  PageSnapshot,
} from "../types";

export interface OpenAiAuth {
  apiKey: string;
  installId: string;
}

/** Live OpenAI Responses endpoint. Connection tests and analysis both use this. */
export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

/** Minimal prompt used only by the live connection probe. */
export const CONNECTION_TEST_PROMPT = "Reply with exactly: connected";

export interface ConnectionTestResult {
  model: string;
  responseId?: string;
}

export interface ResponsesApiResult {
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
  return runJobAnalysis(snapshot, profile, settings, {
    apiKey,
    installId: await getInstallId(),
  });
}

/**
 * Core analysis path with injectable auth.
 * Used by the extension (chrome storage key) and by live eval (env key).
 */
export async function runJobAnalysis(
  snapshot: PageSnapshot,
  profile: CandidateProfile,
  settings: ExtensionSettings,
  auth: OpenAiAuth,
): Promise<JobAnalysis> {
  const config = resolveAnalysisConfig(settings);
  const body: Record<string, unknown> = {
    model: config.modelId,
    store: false,
    safety_identifier: auth.installId,
    // OpenAI Responses API: reasoning.effort
    reasoning: config.reasoning,
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
    body.tools = [
      {
        type: "web_search",
        search_context_size: config.searchContextSize,
      },
    ];
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.apiKey}`,
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

  const refusal = findRefusal(payload);
  if (refusal) throw new Error(refusal);

  const outputText = extractOutputText(payload);
  if (!outputText) throw new Error("The model returned no analysis.");

  let parsed: Omit<JobAnalysis, "generatedAt" | "research">;
  try {
    parsed = JSON.parse(outputText) as Omit<JobAnalysis, "generatedAt" | "research">;
  } catch {
    throw new Error("The model returned an unreadable analysis. Try again.");
  }

  return sanitizeAnalysis(
    parsed,
    snapshot,
    extractCitations(payload),
    settings.researchCompany,
  );
}

/**
 * Live OpenAI probe — not mocked in production.
 * Hits the real Responses API with the saved key and selected model, then
 * requires a non-empty model text response (HTTP 200 alone is not enough).
 */
export async function testOpenAiConnection(
  modelId: string,
): Promise<ConnectionTestResult> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("Enter and save an API key first.");

  const request = buildConnectionTestRequest(modelId, await getInstallId());
  const response = await fetch(request.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(request.body),
  });

  const payload = (await response.json().catch(() => ({}))) as ResponsesApiResult;
  assertLiveConnectionResult(
    { ok: response.ok, status: response.status },
    payload,
  );

  return {
    model: request.body.model,
    responseId: payload.id,
  };
}

/** Pure request builder for the live connection probe. */
export function buildConnectionTestRequest(
  modelId: string,
  installId: string,
): {
  url: typeof OPENAI_RESPONSES_URL;
  body: {
    model: string;
    store: false;
    safety_identifier: string;
    reasoning: { effort: typeof CONNECTION_TEST_REASONING_EFFORT };
    input: typeof CONNECTION_TEST_PROMPT;
    max_output_tokens: number;
  };
} {
  const model = resolveModel(modelId);
  return {
    url: OPENAI_RESPONSES_URL,
    body: {
      model: model.id,
      store: false,
      safety_identifier: installId,
      reasoning: { effort: CONNECTION_TEST_REASONING_EFFORT },
      input: CONNECTION_TEST_PROMPT,
      max_output_tokens: 24,
    },
  };
}

/**
 * Strict success criteria for a live connection probe.
 * A 200 with no model text still fails — that would be a false positive.
 */
export function assertLiveConnectionResult(
  response: { ok: boolean; status: number },
  payload: ResponsesApiResult,
): void {
  if (!response.ok) {
    throw new Error(
      payload.error?.message || `Connection failed (${response.status})`,
    );
  }
  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }
  if (payload.status === "failed") {
    throw new Error(
      payload.error?.message ||
        "OpenAI marked the connection test as failed.",
    );
  }
  if (payload.status === "incomplete") {
    throw new Error(
      `Connection test stopped before completion${payload.incomplete_details?.reason ? `: ${payload.incomplete_details.reason}` : ""}.`,
    );
  }

  const refusal = findRefusal(payload);
  if (refusal) throw new Error(refusal);

  const outputText = extractOutputText(payload).trim();
  if (!outputText) {
    throw new Error(
      "OpenAI accepted the key but the selected model returned no text. Check that this model is enabled on your account.",
    );
  }
}

export function extractOutputText(payload: ResponsesApiResult): string {
  if (payload.output_text) return payload.output_text;
  const parts: string[] = [];
  for (const item of payload.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text") parts.push(content.text ?? "");
    }
  }
  return parts.join("");
}

export function sanitizeAnalysis(
  parsed: Omit<JobAnalysis, "generatedAt" | "research">,
  snapshot: PageSnapshot,
  citedSources: Array<{ title: string; url: string }>,
  researchAttempted: boolean,
): JobAnalysis {
  const knownFields = new Map(snapshot.fields.map((field) => [field.id, field]));
  const seenSuggestions = new Set<string>();
  const generatedSuggestions: JobAnalysis["suggestions"] = [];
  for (const suggestion of parsed.suggestions ?? []) {
    if (!knownFields.has(suggestion.fieldId) || seenSuggestions.has(suggestion.fieldId)) {
      continue;
    }
    seenSuggestions.add(suggestion.fieldId);
    const field = knownFields.get(suggestion.fieldId);
    if (!field) {
      generatedSuggestions.push(
        normalizeSuggestion(suggestion, {
          id: suggestion.fieldId,
          kind: PageFieldKind.Text,
          type: "text",
          name: "",
          label: suggestion.label || suggestion.fieldId,
          placeholder: "",
          ariaLabel: "",
          section: "",
          required: false,
          sensitive: false,
          currentValue: "",
          maxLength: null,
          options: [],
        }),
      );
      continue;
    }
    generatedSuggestions.push(normalizeSuggestion(suggestion, field));
  }

  const suggestions = [...generatedSuggestions];
  for (const field of snapshot.fields) {
    if (seenSuggestions.has(field.id)) continue;
    suggestions.push(
      normalizeSuggestion(
        {
          fieldId: field.id,
          label: field.label,
          action: SuggestionAction.Review,
          value: "",
          confidence: Confidence.Low,
          evidence: "No grounded answer was returned",
          warning: "Review this field manually before filling.",
        },
        field,
      ),
    );
  }

  const sources = dedupeSources([
    ...(parsed.company?.sources ?? []),
    ...citedSources,
  ]).filter((source) => /^https?:\/\//i.test(source.url));

  const company = {
    summary: parsed.company?.summary ?? "",
    product: parsed.company?.product ?? "",
    stage: parsed.company?.stage ?? "",
    size: parsed.company?.size ?? "",
    funding: parsed.company?.funding ?? "",
    engineeringSignals: parsed.company?.engineeringSignals ?? [],
    risks: parsed.company?.risks ?? [],
    sources,
  };

  return {
    ...parsed,
    fit: sanitizeFit(parsed.fit),
    company,
    suggestions,
    missingFacts: parsed.missingFacts ?? [],
    research: {
      attempted: researchAttempted,
      thin: isThinCompanyResearch(company, researchAttempted),
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Coerce model suggestion enums and demote unsafe fills to review.
 * Model output is untrusted even under structured outputs.
 */
export function normalizeSuggestion(
  raw: Partial<FieldSuggestion> & { fieldId: string },
  field: PageField,
): FieldSuggestion {
  let action = isSuggestionAction(String(raw.action ?? ""))
    ? (raw.action as FieldSuggestion["action"])
    : SuggestionAction.Review;
  let confidence = isConfidence(String(raw.confidence ?? ""))
    ? (raw.confidence as FieldSuggestion["confidence"])
    : Confidence.Low;
  let value = typeof raw.value === "string" ? raw.value : "";
  let evidence = typeof raw.evidence === "string" ? raw.evidence : "";
  let warning = typeof raw.warning === "string" ? raw.warning : "";

  if (field.maxLength != null && field.maxLength > 0) {
    value = value.slice(0, field.maxLength);
  }

  if (field.sensitive && action === SuggestionAction.Fill) {
    action = SuggestionAction.Review;
    warning = warning || "Sensitive answer: verify before filling.";
  }

  if (
    action === SuggestionAction.Fill &&
    isChoiceField(field) &&
    field.options.length > 0 &&
    !optionMatches(field, value)
  ) {
    action = SuggestionAction.Review;
    warning = warning || "Value was not a valid option for this field.";
  }

  if (action === SuggestionAction.Fill && !value.trim()) {
    action = SuggestionAction.Review;
    warning = warning || "Empty fill demoted to review.";
  }

  if (action === SuggestionAction.Fill && !evidence.trim()) {
    action = SuggestionAction.Review;
    warning = warning || "Fill without evidence demoted to review.";
  }

  return {
    fieldId: field.id,
    label: field.label || raw.label || field.id,
    action,
    value,
    confidence,
    evidence,
    warning,
  };
}

function findRefusal(payload: ResponsesApiResult): string | undefined {
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "refusal") return content.refusal;
    }
  }
  return undefined;
}

function extractCitations(
  payload: ResponsesApiResult,
): Array<{ title: string; url: string }> {
  const citations: Array<{ title: string; url: string }> = [];
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      for (const annotation of content.annotations ?? []) {
        if (annotation.type !== "url_citation" || !annotation.url) continue;
        citations.push({
          title: annotation.title || safeHostname(annotation.url),
          url: annotation.url,
        });
      }
    }
  }
  return citations;
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

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
