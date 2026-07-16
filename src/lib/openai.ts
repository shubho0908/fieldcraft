import { generateText, Output } from "ai";
import { JOB_ANALYSIS_SCHEMA } from "./analysis-schema";
import { createAiModel } from "./ai-provider";
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
  Provider,
  resolveAnalysisConfig,
  resolveModel,
} from "./models";
import { ANALYSIS_INSTRUCTIONS, buildAnalysisInput } from "./prompt";
import { getApiKey, getExaApiKey, getInstallId } from "./storage";
import { researchCompany } from "./exa";
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
  exaApiKey?: string;
}

/** Legacy endpoint constant — kept for connection-test request parity. */
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
    exaApiKey: await getExaApiKey(),
  });
}

/**
 * Core analysis path with injectable auth.
 * Uses the Vercel AI SDK so the same code can drive OpenAI, Anthropic,
 * and any other supported provider.
 */
export async function runJobAnalysis(
  snapshot: PageSnapshot,
  profile: CandidateProfile,
  settings: ExtensionSettings,
  auth: OpenAiAuth,
): Promise<JobAnalysis> {
  const model = resolveModel(settings.model);
  const aiModel = createAiModel(model, auth.apiKey);
  const config = resolveAnalysisConfig(settings);
  let input = buildAnalysisInput(snapshot, profile, settings);
  let researchSources: Array<{ title: string; url: string }> = [];

  if (settings.researchCompany) {
    const exaKey = auth.exaApiKey || (await getExaApiKey());
    if (!exaKey) {
      throw new Error(
        "Add an Exa API key in Settings or disable 'Research the company'.",
      );
    }
    try {
      const research = await researchCompany(exaKey, snapshot.title, snapshot.hostname);
      input += research.context;
      researchSources = research.sources;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Exa research failed";
      throw new Error(`Company research failed. ${message}`);
    }
  }

  const result = await generateText({
    model: aiModel,
    prompt: input,
    instructions: ANALYSIS_INSTRUCTIONS,
    maxOutputTokens: 14_000,
    output: Output.object({
      schema: JOB_ANALYSIS_SCHEMA as never,
      name: "fieldcraft_job_analysis",
    }),
    providerOptions:
      model.provider === Provider.OpenAI
        ? {
            openai: {
              store: false,
              user: auth.installId,
              reasoningEffort: config.reasoning.effort,
            },
          }
        : undefined,
  });

  const parsed = result.output as Omit<JobAnalysis, "generatedAt" | "research">;
  if (!parsed) {
    throw new Error("The model returned no analysis.");
  }

  return sanitizeAnalysis(parsed, snapshot, researchSources, settings.researchCompany);
}

/**
 * Live connection probe — hits the selected provider with a tiny prompt.
 * Requires a non-empty text response (HTTP 200 alone is not enough).
 */
export async function testOpenAiConnection(
  modelId: string,
): Promise<ConnectionTestResult> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("Enter and save an API key first.");

  const model = resolveModel(modelId);
  const aiModel = createAiModel(model, apiKey);

  const result = await generateText({
    model: aiModel,
    prompt: CONNECTION_TEST_PROMPT,
    maxOutputTokens: 24,
    providerOptions:
      model.provider === Provider.OpenAI
        ? {
            openai: {
              store: false,
              user: await getInstallId(),
              reasoningEffort: CONNECTION_TEST_REASONING_EFFORT,
            },
          }
        : undefined,
  });

  const text = result.text.trim();
  if (!text) {
    throw new Error(
      "The provider accepted the key but the selected model returned no text. Check that this model is enabled on your account.",
    );
  }

  return {
    model: model.id,
    responseId: result.response?.id,
  };
}

/** Pure request builder for the live connection probe — retained for tests. */
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

  if (
    action === SuggestionAction.Fill &&
    field.currentValue.trim() &&
    field.currentValue !== field.placeholder
  ) {
    const isCheckboxUnchecked =
      field.kind === PageFieldKind.Checkbox && field.currentValue === "false";
    if (!isCheckboxUnchecked) {
      action = SuggestionAction.Skip;
    }
  }

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
