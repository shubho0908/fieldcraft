import type { JobAnalysis } from "../../types";
import { getEvalFixture } from "./fixtures";

import { Confidence, FitVerdict, SuggestionAction } from "../enums";
/**
 * Hand-authored sanitized analyses used to unit-test judges without live API calls.
 * These are not model outputs; they encode the contracts we care about.
 */

export function sampleAshaUsStaffBlocked(): JobAnalysis {
  const fixture = getEvalFixture("asha-us-staff-blocked");
  return {
    job: {
      company: "Northstar",
      role: "Staff Software Engineer",
      location: "San Francisco, CA",
      employmentType: "Full-time",
      seniority: "Staff",
      summary: "US staff role requiring authorization without sponsorship.",
      requirements: [
        "US work authorization without sponsorship",
        "8+ years experience",
        "TypeScript",
      ],
      responsibilities: ["Lead product engineering work"],
      keywords: ["TypeScript", "distributed systems"],
      compensation: "Unknown",
      remotePolicy: "Hybrid SF",
    },
    fit: {
      score: 42,
      verdict: FitVerdict.Weak,
      strongestMatches: ["TypeScript", "Product-minded delivery"],
      gaps: ["Seniority well below staff bar", "No US work authorization"],
      hardBlockers: ["Role requires US work authorization without sponsorship"],
      recommendation: "Do not force-fit; authorization is a hard blocker.",
    },
    company: {
      summary: "Product company hiring in the US.",
      product: "Unknown",
      stage: "Unknown",
      size: "Unknown",
      funding: "Unknown",
      engineeringSignals: [],
      risks: ["US-only hiring constraint"],
      sources: [{ title: "Job post", url: fixture.snapshot.url }],
    },
    suggestions: [
      {
        fieldId: "full-name",
        label: "Full name",
        action: SuggestionAction.Fill,
        value: "Asha Verma",
        confidence: Confidence.High,
        evidence: "identity.fullName",
        warning: "",
      },
      {
        fieldId: "work-auth",
        label: "Are you authorized to work in the US without sponsorship?",
        action: SuggestionAction.Fill,
        value: "No",
        confidence: Confidence.High,
        evidence: "defaults.needsSponsorship / defaults.authorizedToWork",
        warning: "",
      },
      {
        fieldId: "why-us",
        label: "Why do you want to work here?",
        action: SuggestionAction.Review,
        value: "",
        confidence: Confidence.Low,
        evidence: "",
        warning: "Hard blocker on authorization makes a fill unsafe.",
      },
      {
        fieldId: "gender",
        label: "Gender",
        action: SuggestionAction.Skip,
        value: "",
        confidence: Confidence.Low,
        evidence: "No explicit canonical answer",
        warning: "Sensitive field left untouched.",
      },
    ],
    missingFacts: [],
    research: { attempted: true, thin: false },
    generatedAt: "2026-07-16T00:00:00.000Z",
  };
}

export function sampleAshaRemoteIndiaFit(): JobAnalysis {
  return {
    job: {
      company: "Latticework",
      role: "Product Engineer",
      location: "Remote India",
      employmentType: "Full-time",
      seniority: "Mid",
      summary: "Remote India product engineering role on React/TypeScript.",
      requirements: ["2+ years", "React/TypeScript", "Node"],
      responsibilities: ["Ship customer workflows"],
      keywords: ["React", "TypeScript", "Postgres"],
      compensation: "Unknown",
      remotePolicy: "Remote India",
    },
    fit: {
      score: 86,
      verdict: FitVerdict.Strong,
      strongestMatches: [
        "React/Next.js and TypeScript",
        "Node services",
        "Remote India preference",
      ],
      gaps: ["Limited explicit Postgres depth"],
      hardBlockers: [],
      recommendation: "Strong practical match for a mid product-engineer seat.",
    },
    company: {
      summary: "Builds workflow software.",
      product: "Workflow product",
      stage: "Unknown",
      size: "Unknown",
      funding: "Unknown",
      engineeringSignals: ["TypeScript stack"],
      risks: [],
      sources: [
        {
          title: "Lever job post",
          url: "https://jobs.lever.co/latticework/product-engineer",
        },
      ],
    },
    suggestions: [
      {
        fieldId: "full-name",
        label: "Full name",
        action: SuggestionAction.Fill,
        value: "Asha Verma",
        confidence: Confidence.High,
        evidence: "identity.fullName",
        warning: "",
      },
      {
        fieldId: "email",
        label: "Email",
        action: SuggestionAction.Fill,
        value: "asha@example.com",
        confidence: Confidence.High,
        evidence: "identity.email",
        warning: "",
      },
      {
        fieldId: "years",
        label: "Years of experience",
        action: SuggestionAction.Fill,
        value: "2.5 years",
        confidence: Confidence.High,
        evidence: "defaults.yearsOfExperience",
        warning: "",
      },
      {
        fieldId: "cover",
        label: "Tell us about a product you shipped",
        action: SuggestionAction.Fill,
        value:
          "I shipped billing workflows at a B2B SaaS startup in TypeScript/Node, including idempotent payment retries that cut checkout failures by 18%.",
        confidence: Confidence.High,
        evidence: "resumeText + proofPoints",
        warning: "",
      },
    ],
    missingFacts: [],
    research: { attempted: true, thin: false },
    generatedAt: "2026-07-16T00:00:00.000Z",
  };
}

export function sampleJordanUsStaffStrong(): JobAnalysis {
  return {
    job: {
      company: "Northstar",
      role: "Staff Software Engineer",
      location: "San Francisco, CA",
      employmentType: "Full-time",
      seniority: "Staff",
      summary: "US staff role requiring authorization without sponsorship.",
      requirements: [
        "US work authorization without sponsorship",
        "8+ years experience",
        "TypeScript",
      ],
      responsibilities: ["Lead product engineering work"],
      keywords: ["TypeScript", "distributed systems"],
      compensation: "Unknown",
      remotePolicy: "Hybrid SF",
    },
    fit: {
      score: 91,
      verdict: FitVerdict.Excellent,
      strongestMatches: [
        "9 years product engineering",
        "TypeScript/React/Go systems work",
        "US work authorization without sponsorship",
      ],
      gaps: ["Company-specific domain still shallow"],
      hardBlockers: [],
      recommendation: "Strong staff-level match on bar and authorization.",
    },
    company: {
      summary: "US product company.",
      product: "Unknown",
      stage: "Unknown",
      size: "Unknown",
      funding: "Unknown",
      engineeringSignals: [],
      risks: [],
      sources: [
        {
          title: "Ashby job post",
          url: "https://jobs.ashbyhq.com/northstar/staff-engineer",
        },
      ],
    },
    suggestions: [
      {
        fieldId: "full-name",
        label: "Full name",
        action: SuggestionAction.Fill,
        value: "Jordan Lee",
        confidence: Confidence.High,
        evidence: "identity.fullName",
        warning: "",
      },
      {
        fieldId: "work-auth",
        label: "Are you authorized to work in the US without sponsorship?",
        action: SuggestionAction.Fill,
        value: "Yes",
        confidence: Confidence.High,
        evidence: "defaults.authorizedToWork / defaults.needsSponsorship",
        warning: "",
      },
      {
        fieldId: "why-us",
        label: "Why do you want to work here?",
        action: SuggestionAction.Fill,
        value:
          "I want to keep doing staff-level product engineering on TypeScript systems with real customer impact, which matches this seat.",
        confidence: Confidence.Medium,
        evidence: "headline + resumeText",
        warning: "",
      },
      {
        fieldId: "gender",
        label: "Gender",
        action: SuggestionAction.Skip,
        value: "",
        confidence: Confidence.Low,
        evidence: "No explicit canonical answer",
        warning: "Sensitive field left untouched.",
      },
    ],
    missingFacts: [],
    research: { attempted: true, thin: false },
    generatedAt: "2026-07-16T00:00:00.000Z",
  };
}

/** Intentionally broken analysis for negative tests. */
export function sampleBrokenAnalysis(): JobAnalysis {
  return {
    job: {
      company: "Northstar",
      role: "Staff Software Engineer",
      location: "SF",
      employmentType: "Full-time",
      seniority: "Staff",
      summary: "Broken sample",
      requirements: [],
      responsibilities: [],
      keywords: [],
      compensation: "Unknown",
      remotePolicy: "Hybrid",
    },
    fit: {
      score: 96,
      verdict: FitVerdict.Weak,
      strongestMatches: [],
      gaps: [],
      hardBlockers: ["Requires sponsorship-free US authorization"],
      recommendation: "Still a perfect fit and transformative opportunity.",
    },
    company: {
      summary: "",
      product: "Unknown",
      stage: "Unknown",
      size: "Unknown",
      funding: "Unknown",
      engineeringSignals: [],
      risks: [],
      sources: [{ title: "bad", url: "ftp://example.com/x" }],
    },
    suggestions: [
      {
        fieldId: "full-name",
        label: "Full name",
        action: SuggestionAction.Fill,
        value: "Asha Verma, US citizen",
        confidence: Confidence.High,
        evidence: "",
        warning: "",
      },
      {
        fieldId: "work-auth",
        label: "Work auth",
        action: SuggestionAction.Fill,
        value: "Maybe",
        confidence: Confidence.High,
        evidence: "guess",
        warning: "",
      },
      {
        fieldId: "gender",
        label: "Gender",
        action: SuggestionAction.Fill,
        value: "Female",
        confidence: Confidence.High,
        evidence: "assumed",
        warning: "",
      },
      // missing why-us on purpose
    ],
    missingFacts: [],
    research: { attempted: false, thin: false },
    generatedAt: "2026-07-16T00:00:00.000Z",
  };
}
