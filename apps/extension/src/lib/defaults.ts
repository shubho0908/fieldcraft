import type { CandidateProfile, ExtensionSettings } from "../types";
import { AutofillMode } from "./enums";
import {
  DEFAULT_EVAL_MODEL_ID,
  DEFAULT_EVAL_REASONING_EFFORT,
  DEFAULT_MODEL_ID,
  DEFAULT_REASONING_EFFORT,
  Provider,
} from "./models";

export const DEFAULT_PROFILE: CandidateProfile = {
  identity: {
    fullName: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
    portfolio: "",
  },
  headline: "",
  targetRoles: "",
  resumeText: "",
  proofPoints: "",
  defaults: {
    authorizedToWork: "",
    needsSponsorship: "",
    noticePeriod: "",
    currentCompensation: "",
    expectedCompensation: "",
    remotePreference: "",
    willingToRelocate: "",
    yearsOfExperience: "",
    referralSource: "",
  },
  canonicalAnswers: [],
  voice: {
    customInstruction:
      "Write like a strong product-minded engineer: direct, specific, understated, and human.",
    bannedPhrases:
      "delve, leverage, cutting-edge, game-changer, passionate about, thrilled to apply, dynamic team, fast-paced environment, aligns perfectly, transformative",
    maxShortWords: 55,
    maxLongWords: 140,
  },
  onboardingComplete: false,
  updatedAt: "",
};

export const DEFAULT_SETTINGS: ExtensionSettings = {
  provider: Provider.OpenAI,
  model: DEFAULT_MODEL_ID,
  reasoningEffort: DEFAULT_REASONING_EFFORT,
  evalModel: DEFAULT_EVAL_MODEL_ID,
  evalReasoningEffort: DEFAULT_EVAL_REASONING_EFFORT,
  // Protocol for a custom endpoint.
  customProtocol: "openai",
  // Base URL for a custom provider.
  customBaseUrl: "",
  // Optional extra headers for custom endpoints.
  customHeaders: {},
  // Research is opt-in because it requires a separate Exa API key.
  researchCompany: false,
  rememberApiKey: false,
  autofillMode: AutofillMode.AI,
};
