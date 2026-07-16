import type {
  Confidence,
  FitVerdict,
  PageFieldKind,
  ReasoningEffortSetting,
  SuggestionAction,
} from "./lib/enums";

export type {
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
  canonicalAnswers: Array<{ question: string; answer: string }>;
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
  model: string;
  /** auto = model default; otherwise an OpenAI reasoning.effort value. */
  reasoningEffort: ReasoningEffortSetting;
  researchCompany: boolean;
  rememberApiKey: boolean;
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

export interface PageSnapshot {
  title: string;
  url: string;
  hostname: string;
  ats: string;
  headings: string[];
  pageText: string;
  fields: PageField[];
  capturedAt: string;
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
  };
  generatedAt: string;
}

export interface FillResult {
  fieldId: string;
  status: "filled" | "skipped" | "failed";
  message: string;
}

export type RuntimeRequest =
  | { type: "FIELDCRAFT_CAPTURE" }
  | { type: "FIELDCRAFT_FILL"; suggestions: FieldSuggestion[] }
  | {
      type: "FIELDCRAFT_ANALYZE";
      snapshot: PageSnapshot;
      profile: CandidateProfile;
      settings: ExtensionSettings;
    }
  | { type: "FIELDCRAFT_TEST_API"; model: string };

export interface CachedAnalysis {
  url: string;
  snapshot: PageSnapshot;
  analysis: JobAnalysis;
}
