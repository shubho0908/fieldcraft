import type {
  AutofillMode,
  Confidence,
  FitVerdict,
  PageFieldKind,
  ReasoningEffortSetting,
  SuggestionAction,
} from "./lib/enums";
import type { Provider } from "./lib/models";

export type {
  AutofillMode,
  Confidence,
  FitVerdict,
  PageFieldKind,
  ReasoningEffortSetting,
  SuggestionAction,
};

export interface ResumeAttachment {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

/**
 * Durable (remembered) API keys as carried by a backup file. Session-scoped
 * keys are ephemeral by design and never appear here.
 */
export interface BackupApiKeys {
  openai?: string;
  gemini?: string;
  custom?: string;
  exa?: string;
}

export interface CandidateProfile {
  identity: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    linkedin: string;
    github: string;
    portfolio: string;
  };
  headline: string;
  targetRoles: string;
  resumeText: string;
  proofPoints: string;
  defaults: {
    authorizedToWork: string;
    needsSponsorship: string;
    noticePeriod: string;
    currentCompensation: string;
    expectedCompensation: string;
    remotePreference: string;
    willingToRelocate: string;
    yearsOfExperience: string;
    referralSource: string;
  };
  canonicalAnswers: Array<{ id: string; question: string; answer: string }>;
  voice: {
    customInstruction: string;
    bannedPhrases: string;
    maxShortWords: number;
    maxLongWords: number;
  };
  resumeAttachment?: ResumeAttachment;
  onboardingComplete: boolean;
  updatedAt: string;
}

export interface ExtensionSettings {
  /** The provider whose API key and models are currently active. */
  provider: Provider;
  model: string;
  /** auto = model default; otherwise an OpenAI reasoning.effort value. */
  reasoningEffort: ReasoningEffortSetting;
  /** Model used for live fixture evals (`npm run eval:live` / eval harness). */
  evalModel: string;
  /** Reasoning effort for live evals. Defaults to high. */
  evalReasoningEffort: ReasoningEffortSetting;
  /** Which protocol a custom endpoint speaks. */
  customProtocol: "openai" | "anthropic";
  /** Base URL for a custom provider (e.g. Fireworks, Together, Groq, OpenRouter, Anthropic, MiniMax). */
  customBaseUrl: string;
  /** Optional extra headers to send to a custom endpoint. Ignored for built-in providers. */
  customHeaders?: Record<string, string>;
  /** Optional per-model override for the maximum output tokens. Falls back to the model catalog default. */
  maxOutputTokens?: number;
  researchCompany: boolean;
  rememberApiKey: boolean;
  /** Whether to analyze with AI or fill fields directly from the profile. */
  autofillMode: AutofillMode;
}

export interface FieldOption {
  value: string;
  label: string;
}

export interface PageField {
  id: string;
  kind: PageFieldKind;
  type: string;
  name: string;
  label: string;
  placeholder: string;
  ariaLabel: string;
  section: string;
  required: boolean;
  sensitive: boolean;
  currentValue: string;
  maxLength: number | null;
  options: FieldOption[];
}

/**
 * Company identity facts read directly from the job page's structured data or
 * metadata. These are hints, never inferred company facts.
 */
export interface CompanyResearchHints {
  /** Names declared by a JobPosting hiringOrganization object. */
  structuredNames: string[];
  /** Names declared in page metadata such as og:site_name. */
  metadataNames: string[];
  /** Public company domains declared by the hiring organization's own URL. */
  officialDomains: string[];
}

export interface PageSnapshot {
  title: string;
  url: string;
  hostname: string;
  ats: string;
  headings: string[];
  pageText: string;
  fields: PageField[];
  capturedAt: string;
  /** Optional because saved sessions and eval fixtures predate this signal. */
  companyHints?: CompanyResearchHints;
}

export interface FieldSuggestion {
  fieldId: string;
  label: string;
  action: SuggestionAction;
  value: string;
  confidence: Confidence;
  evidence: string;
  warning: string;
}

export interface JobAnalysis {
  job: {
    company: string;
    role: string;
    location: string;
    employmentType: string;
    seniority: string;
    summary: string;
    requirements: string[];
    responsibilities: string[];
    keywords: string[];
    compensation: string;
    remotePolicy: string;
  };
  fit: {
    score: number;
    verdict: FitVerdict;
    strongestMatches: string[];
    gaps: string[];
    hardBlockers: string[];
    recommendation: string;
  };
  company: {
    summary: string;
    product: string;
    stage: string;
    size: string;
    funding: string;
    engineeringSignals: string[];
    risks: string[];
    sources: Array<{ title: string; url: string }>;
  };
  suggestions: FieldSuggestion[];
  missingFacts: string[];
  /** Client-side research quality signal. Not model output. */
  research: {
    attempted: boolean;
    thin: boolean;
    /** Why external research was safely skipped or could not complete. */
    issue?: string;
  };
  generatedAt: string;
}

export interface FillResult {
  fieldId: string;
  status: "filled" | "skipped" | "failed";
  message: string;
}

/**
 * The durable, tab-scoped unit of work shown in the side panel.  It lives in
 * chrome.storage.session and is only mutated by the service worker.
 */
export interface TabAnalysisSession {
  tabId: number;
  /** Exact document URL captured for this run; never use a result on another page. */
  url: string;
  /** Invalidates completions from a previous analysis or fill operation. */
  runId: string;
  status: "capturing" | "analyzing" | "done" | "filling" | "error";
  snapshot?: PageSnapshot;
  analysis?: JobAnalysis;
  selectedFieldIds: string[];
  fillResults: FillResult[];
  error: string;
  createdAt: string;
  updatedAt: string;
}

export type RuntimeRequest =
  | { type: "FIELDCRAFT_CAPTURE" }
  | { type: "FIELDCRAFT_FILL"; suggestions: FieldSuggestion[] }
  | { type: "FIELDCRAFT_START_ANALYSIS"; tabId: number }
  | { type: "FIELDCRAFT_GET_TAB_SESSION"; tabId: number }
  | {
      type: "FIELDCRAFT_UPDATE_TAB_REVIEW";
      tabId: number;
      url: string;
      runId: string;
      analysis: JobAnalysis;
      selectedFieldIds: string[];
    }
  | {
      type: "FIELDCRAFT_FILL_TAB";
      tabId: number;
      url: string;
      runId: string;
      suggestions: FieldSuggestion[];
    }
  | { type: "FIELDCRAFT_DIRECT_FILL"; tabId: number; url: string }
  | { type: "FIELDCRAFT_TEST_API"; model: string }
  | { type: "FIELDCRAFT_RESOLVE_ACTIVE_TAB" }
  | { type: "FIELDCRAFT_OVERLAY_CLOSE" };

export type ResolvedActiveTab = {
  id: number;
  url: string;
  title?: string;
};
