import { generateText, jsonSchema, Output } from "ai";
import type { JSONSchema7 } from "@ai-sdk/provider";
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
import { isThinCompanyResearch } from "./fit";
import { toSafeAnalysis } from "./analysis";
import {
  CONNECTION_TEST_REASONING_EFFORT,
  Provider,
  resolveAnalysisConfig,
  resolveModel,
} from "./models";
import { ANALYSIS_INSTRUCTIONS, buildAnalysisInput } from "./prompt";
import { getApiKey, getExaApiKey, getInstallId, getSettings } from "./storage";
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
/** Enough room for a provider's response envelope without making the probe expensive. */
export const CONNECTION_TEST_MAX_OUTPUT_TOKENS = 96;

/**
 * Models generate from supplied job/profile context only. Never add provider
 * web-search, crawl, browser, or scraping tools here: company research is
 * deliberately performed through Exa in `researchCompany`.
 */
const NO_MODEL_TOOLS = {} as const;

/**
 * AI SDK v7 requires a Schema wrapper here. Passing the JSON Schema object
 * directly makes it try to invoke that object as a validator at runtime.
 */
const JOB_ANALYSIS_OUTPUT = Output.object({
  // The shared schema is intentionally deeply readonly; the SDK's JSONSchema7
  // type models arrays as mutable even though it never mutates the input.
  schema: jsonSchema(JOB_ANALYSIS_SCHEMA as unknown as JSONSchema7),
  name: "fieldcraft_job_analysis",
});

/**
 * Many OpenAI-compatible providers do not support structured outputs or
 * response_format, so they return the JSON as markdown or inline text.
 * This extractor looks for a fenced JSON block, then falls back to the
 * first balanced `{...}` object in the response.
 */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();

  // 1. Fenced JSON block, e.g. ```json\n{...}\n```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    return JSON.parse(fenceMatch[1].trim());
  }

  // 2. First balanced JSON object, respecting string boundaries.
  const start = trimmed.indexOf("{");
  if (start === -1) {
    throw new Error("No JSON object found in the model response.");
  }

  let inString = false;
  let escaped = false;
  let depth = 0;
  for (let i = start; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (c === "\\") {
        escaped = true;
      } else if (c === '"') {
        inString = false;
      }
    } else {
      if (c === '"') {
        inString = true;
      } else if (c === "{") {
        depth++;
      } else if (c === "}") {
        depth--;
        if (depth === 0) {
          return JSON.parse(trimmed.slice(start, i + 1));
        }
      }
    }
  }

  throw new Error("No complete JSON object found in the model response.");
}

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
  const model = resolveModel(settings.model);
  const apiKey = await getApiKey(model.provider);
  if (!apiKey) {
    throw new Error(`Add a ${providerLabel(model.provider)} API key in Settings before analyzing a job.`);
  }
  return runJobAnalysis(snapshot, profile, settings, {
    apiKey,
    installId: await getInstallId(),
    exaApiKey: await getExaApiKey(),
  });
}

/**
 * Core analysis path with injectable auth.
 * Uses the Vercel AI SDK so the same code can drive OpenAI and Gemini.
 */
export async function runJobAnalysis(
  snapshot: PageSnapshot,
  profile: CandidateProfile,
  settings: ExtensionSettings,
  auth: OpenAiAuth,
): Promise<JobAnalysis> {
  const model = resolveModel(settings.model);
  const aiModel = createAiModel({
    model,
    apiKey: auth.apiKey,
    baseURL:
      model.provider === Provider.Custom ? settings.customBaseUrl : undefined,
  });
  const config = resolveAnalysisConfig(settings);
  let input = buildAnalysisInput(snapshot, profile, settings);
  let researchSources: Array<{ title: string; url: string }> = [];
  let researchIssue: string | undefined;

  if (settings.researchCompany) {
    const exaKey = auth.exaApiKey || (await getExaApiKey());
    if (!exaKey) {
      throw new Error(
        "Add an Exa API key in Settings or disable 'Research the company'.",
      );
    }
    try {
      const research = await researchCompany(exaKey, snapshot);
      if (research.context) input += `\n\n${research.context}`;
      researchSources = research.sources;
      researchIssue = research.issue;
    } catch (error) {
      // Company research is optional. A transient search or crawl failure must
      // not prevent a user from reviewing their job application; the model gets
      // no research context and the dashboard makes that limitation explicit.
      researchIssue = "Live company research was unavailable for this run. The company brief uses the job page only.";
    }
  }

  const providerOptions =
    model.provider === Provider.OpenAI
      ? {
          openai: {
            store: false,
            user: auth.installId,
            reasoningEffort: config.reasoning.effort,
          },
        }
      : undefined;

  let parsed: Omit<JobAnalysis, "generatedAt" | "research">;

  if (model.provider === Provider.Custom) {
    // OpenAI-compatible providers often do not support response_format or
    // structured outputs, so we ask for plain text and parse the JSON ourselves.
    const customInstructions = `${ANALYSIS_INSTRUCTIONS}\n\nReturn your entire response as a single JSON object matching the following JSON Schema. Do not wrap it in markdown code fences and do not add any commentary before or after the JSON object.\n\n${JSON.stringify(JOB_ANALYSIS_SCHEMA, null, 2)}`;
    const result = await generateText({
      model: aiModel,
      prompt: input,
      instructions: customInstructions,
      tools: NO_MODEL_TOOLS,
      maxOutputTokens: 14_000,
      providerOptions,
    });

    parsed = extractJsonObject(result.text) as Omit<JobAnalysis, "generatedAt" | "research">;
  } else {
    const result = await generateText({
      model: aiModel,
      prompt: input,
      instructions: ANALYSIS_INSTRUCTIONS,
      tools: NO_MODEL_TOOLS,
      maxOutputTokens: 14_000,
      output: JOB_ANALYSIS_OUTPUT,
      providerOptions,
    });

    parsed = result.output as Omit<JobAnalysis, "generatedAt" | "research">;
  }

  if (!parsed) {
    throw new Error("The model returned no analysis.");
  }

  return sanitizeAnalysis(
    parsed,
    snapshot,
    researchSources,
    settings.researchCompany,
    researchIssue,
  );
}

/**
 * Live connection probe — hits the selected provider with a tiny prompt.
 * A completed SDK call is the connection signal. Some reasoning-capable models
 * complete valid, low-token probes without exposing a text part.
 */
export async function testAiConnection(
  modelId: string,
): Promise<ConnectionTestResult> {
  const model = resolveModel(modelId);
  const apiKey = await getApiKey(model.provider);
  if (!apiKey) throw new Error(`Enter and save a ${providerLabel(model.provider)} API key first.`);

  const settings = await getSettings();
  const aiModel = createAiModel({
    model,
    apiKey,
    baseURL:
      model.provider === Provider.Custom ? settings.customBaseUrl : undefined,
  });

  const result = await generateText({
    model: aiModel,
    prompt: CONNECTION_TEST_PROMPT,
    tools: NO_MODEL_TOOLS,
    maxOutputTokens: CONNECTION_TEST_MAX_OUTPUT_TOKENS,
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

  if (result.finishReason === "error") {
    throw new Error(
      "The provider ended the connection test with an error.",
    );
  }

  return {
    model: model.id,
    responseId: result.response?.id,
  };
}

function providerLabel(provider: Provider): string {
  if (provider === Provider.Gemini) return "Gemini";
  if (provider === Provider.Custom) return "Custom";
  return "OpenAI";
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
    max_output_tokens: typeof CONNECTION_TEST_MAX_OUTPUT_TOKENS;
  };
} {
  const model = resolveModel(modelId);
  if (model.provider !== Provider.OpenAI) {
    throw new Error("The raw connection request builder supports OpenAI Responses models only.");
  }
  return {
    url: OPENAI_RESPONSES_URL,
    body: {
      model: model.id,
      store: false,
      safety_identifier: installId,
      reasoning: { effort: CONNECTION_TEST_REASONING_EFFORT },
      input: CONNECTION_TEST_PROMPT,
      max_output_tokens: CONNECTION_TEST_MAX_OUTPUT_TOKENS,
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
  researchIssue?: string,
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

  // The model may only cite a URL that was actually retrieved in this run.
  // Never append every fetched URL: the model's source list represents the
  // subset it directly used for the company brief.
  const sources = selectRetrievedSources(parsed.company?.sources ?? [], citedSources);

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

  const research = {
    attempted: researchAttempted,
    thin: isThinCompanyResearch(company, researchAttempted),
    ...(researchIssue ? { issue: researchIssue } : {}),
  };
  return toSafeAnalysis(
    {
      ...parsed,
      company,
      suggestions,
      missingFacts: parsed.missingFacts ?? [],
      research,
      generatedAt: new Date().toISOString(),
    },
    snapshot,
  );
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

function selectRetrievedSources(
  requestedSources: Array<{ title: string; url: string }>,
  retrievedSources: Array<{ title: string; url: string }>,
): Array<{ title: string; url: string }> {
  const retrievedByUrl = new Map<string, { title: string; url: string }>();
  for (const source of retrievedSources) {
    const key = canonicalSourceUrl(source.url);
    if (key && !retrievedByUrl.has(key)) {
      retrievedByUrl.set(key, { title: source.title, url: source.url });
    }
  }

  const selected: Array<{ title: string; url: string }> = [];
  for (const source of requestedSources) {
    const retrieved = retrievedByUrl.get(canonicalSourceUrl(source.url));
    if (retrieved) selected.push(retrieved);
  }
  return dedupeSources(selected);
}

function canonicalSourceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/i.test(parsed.protocol)) return "";
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(?:utm_[^=]*|fbclid|gclid|ref)$/i.test(key)) {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.href.replace(/\/$/, "").toLocaleLowerCase();
  } catch {
    return "";
  }
}
