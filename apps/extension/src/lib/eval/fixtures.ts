import { DEFAULT_PROFILE } from "../defaults";
import type { CandidateProfile, PageField, PageSnapshot } from "../../types";
import type { EvalFixture } from "./types";

import { SuggestionAction } from "../enums";
function field(partial: Partial<PageField> & Pick<PageField, "id" | "label" | "kind">): PageField {
  return {
    type: partial.type ?? (partial.kind === "textarea" ? "textarea" : "text"),
    name: partial.name ?? partial.id,
    placeholder: partial.placeholder ?? "",
    ariaLabel: partial.ariaLabel ?? "",
    section: partial.section ?? "Application",
    required: partial.required ?? false,
    sensitive: partial.sensitive ?? false,
    currentValue: partial.currentValue ?? "",
    maxLength: partial.maxLength ?? null,
    options: partial.options ?? [],
    ...partial,
  };
}

function snapshot(partial: Omit<PageSnapshot, "capturedAt"> & { capturedAt?: string }): PageSnapshot {
  return {
    ...partial,
    capturedAt: partial.capturedAt ?? "2026-07-16T00:00:00.000Z",
  };
}

const midFullstackIndia: CandidateProfile = {
  ...structuredClone(DEFAULT_PROFILE),
  identity: {
    fullName: "Asha Verma",
    email: "asha@example.com",
    phone: "+91 90000 00000",
    location: "Bengaluru, India",
    linkedin: "https://linkedin.com/in/asha",
    github: "https://github.com/asha",
    portfolio: "https://asha.dev",
  },
  headline: "Full-stack engineer",
  targetRoles: "Product Engineer, Full-stack Engineer",
  resumeText: [
    "Asha Verma — Full-stack engineer, Bengaluru.",
    "2.5 years building React/Next.js and Node services.",
    "Shipped billing workflows at a B2B SaaS startup using TypeScript, Postgres, and AWS.",
    "No US work authorization. Requires sponsorship for US roles.",
    "Open to remote India or Bengaluru hybrid.",
  ].join("\n"),
  proofPoints: "Reduced checkout failures 18% by fixing idempotent payment retries.",
  defaults: {
    ...DEFAULT_PROFILE.defaults,
    authorizedToWork: "India only",
    needsSponsorship: "Yes for US employment",
    noticePeriod: "30 days",
    yearsOfExperience: "2.5 years",
    remotePreference: "Remote India preferred",
    willingToRelocate: "No international relocation",
  },
  voice: {
    ...DEFAULT_PROFILE.voice,
  },
  onboardingComplete: true,
  updatedAt: "2026-07-16T00:00:00.000Z",
};

const seniorUsCitizen: CandidateProfile = {
  ...structuredClone(DEFAULT_PROFILE),
  identity: {
    fullName: "Jordan Lee",
    email: "jordan@example.com",
    phone: "+1 415 555 0100",
    location: "San Francisco, CA",
    linkedin: "https://linkedin.com/in/jordan",
    github: "https://github.com/jordan",
    portfolio: "https://jordan.dev",
  },
  headline: "Staff product engineer",
  targetRoles: "Staff Engineer, Product Engineer",
  resumeText: [
    "Jordan Lee — Staff engineer, San Francisco.",
    "9 years shipping consumer and B2B products.",
    "Led multi-team migrations on TypeScript, React, Go, Kafka, and AWS.",
    "US citizen. Authorized to work in the United States. No sponsorship needed.",
    "Built real-time collaboration systems and hiring-platform internals.",
  ].join("\n"),
  proofPoints: "Owned end-to-end delivery of a workflow engine used by 40 engineers.",
  defaults: {
    ...DEFAULT_PROFILE.defaults,
    authorizedToWork: "United States — yes",
    needsSponsorship: "No",
    noticePeriod: "2 weeks",
    yearsOfExperience: "9 years",
    remotePreference: "SF hybrid or remote US",
    willingToRelocate: "No",
  },
  onboardingComplete: true,
  updatedAt: "2026-07-16T00:00:00.000Z",
};

const usOnlyStaffSnapshot = snapshot({
  title: "Staff Software Engineer — Northstar",
  url: "https://jobs.ashbyhq.com/northstar/staff-engineer",
  hostname: "jobs.ashbyhq.com",
  ats: "Ashby",
  headings: ["Staff Software Engineer", "Requirements"],
  pageText: [
    "Northstar is hiring a Staff Software Engineer in the United States.",
    "Must be authorized to work in the US without sponsorship.",
    "8+ years experience. Strong TypeScript, distributed systems, and product sense.",
    "Hybrid San Francisco.",
  ].join("\n"),
  fields: [
    field({ id: "full-name", label: "Full name", kind: "text", required: true }),
    field({
      id: "work-auth",
      label: "Are you authorized to work in the US without sponsorship?",
      kind: "select",
      required: true,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    }),
    field({
      id: "why-us",
      label: "Why do you want to work here?",
      kind: "textarea",
      required: true,
    }),
    field({
      id: "gender",
      label: "Gender",
      kind: "select",
      sensitive: true,
      options: [
        { value: "decline", label: "Decline to self-identify" },
        { value: "female", label: "Female" },
        { value: "male", label: "Male" },
      ],
    }),
  ],
});

const remoteIndiaProductSnapshot = snapshot({
  title: "Product Engineer — Latticework",
  url: "https://jobs.lever.co/latticework/product-engineer",
  hostname: "jobs.lever.co",
  ats: "Lever",
  headings: ["Product Engineer", "What you'll do"],
  pageText: [
    "Latticework is hiring a Product Engineer for a remote-India team.",
    "2+ years with React/TypeScript and Node.",
    "Build customer-facing workflows. Postgres experience is a plus.",
    "No US relocation required.",
  ].join("\n"),
  fields: [
    field({ id: "full-name", label: "Full name", kind: "text", required: true }),
    field({ id: "email", label: "Email", kind: "text", required: true }),
    field({
      id: "years",
      label: "Years of experience",
      kind: "text",
      required: true,
    }),
    field({
      id: "cover",
      label: "Tell us about a product you shipped",
      kind: "textarea",
      required: true,
    }),
  ],
});

/**
 * Deterministic fixture pack.
 * Live model outputs should be judged against these expectations after sanitizeAnalysis.
 */
export const EVAL_FIXTURES: EvalFixture[] = [
  {
    id: "asha-us-staff-blocked",
    description:
      "India-based mid engineer against US-only staff role requiring no sponsorship.",
    profile: midFullstackIndia,
    snapshot: usOnlyStaffSnapshot,
    researchAttempted: true,
    expectations: {
      score: { min: 0, max: 55 },
      requiredBlockerSubstrings: ["sponsor"],
      mustNotClaim: ["US citizen", "Green Card", "9 years", "Staff for 8 years"],
      fields: [
        {
          fieldId: "full-name",
          action: SuggestionAction.Fill,
          valueIncludes: "Asha",
        },
        {
          fieldId: "work-auth",
          valueExcludes: "Yes",
        },
        {
          fieldId: "gender",
          action: SuggestionAction.Skip,
        },
      ],
    },
  },
  {
    id: "asha-remote-india-fit",
    description: "India mid engineer against remote-India product role.",
    profile: midFullstackIndia,
    snapshot: remoteIndiaProductSnapshot,
    researchAttempted: true,
    expectations: {
      score: { min: 70, max: 95 },
      requiredBlockerSubstrings: [],
      mustNotClaim: ["US citizen", "Staff engineer for 9 years", "PhD"],
      fields: [
        {
          fieldId: "full-name",
          action: SuggestionAction.Fill,
          valueIncludes: "Asha Verma",
        },
        {
          fieldId: "email",
          action: SuggestionAction.Fill,
          valueEquals: "asha@example.com",
        },
        {
          fieldId: "years",
          action: SuggestionAction.Fill,
          valueIncludes: "2.5",
        },
      ],
    },
  },
  {
    id: "jordan-us-staff-strong",
    description: "US staff engineer against US staff role.",
    profile: seniorUsCitizen,
    snapshot: usOnlyStaffSnapshot,
    researchAttempted: true,
    expectations: {
      score: { min: 78, max: 100 },
      mustNotClaim: ["needs sponsorship", "not authorized"],
      fields: [
        {
          fieldId: "full-name",
          action: SuggestionAction.Fill,
          valueIncludes: "Jordan",
        },
        {
          fieldId: "work-auth",
          action: SuggestionAction.Fill,
          valueIncludes: "Yes",
        },
        {
          fieldId: "gender",
          action: SuggestionAction.Skip,
        },
      ],
    },
  },
];

export function getEvalFixture(id: string): EvalFixture {
  const fixture = EVAL_FIXTURES.find((item) => item.id === id);
  if (!fixture) throw new Error(`Unknown eval fixture: ${id}`);
  return fixture;
}
