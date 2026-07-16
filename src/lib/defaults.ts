import type { CandidateProfile, ExtensionSettings } from "../types";

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
  model: "gpt-5.6-terra",
  researchCompany: true,
  rememberApiKey: false,
};
