import type { JobAnalysis, PageSnapshot } from "../../types";

const questions = [
  "Describe a project where you improved reliability.",
  "How did you balance delivery speed with quality?",
  "Tell us about a difficult collaboration.",
  "Describe how you used customer feedback.",
  "How did you measure a project's success?",
  "Tell us about a technical decision and its tradeoffs.",
  "Describe a time you reduced operational risk.",
  "How did you explain a complex change to stakeholders?",
  "Tell us about a mistake and what you changed.",
  "Describe how you supported a colleague's development.",
];

export const hundredFieldSnapshot: PageSnapshot = {
  title: "Senior product engineer", url: "https://example.test/careers/product-engineer",
  hostname: "example.test", ats: "Generic", headings: ["Senior product engineer"],
  pageText: "Build accessible customer workflows. Lead cross-functional delivery, improve reliability, and mentor colleagues. Experience with TypeScript and product discovery is required.",
  capturedAt: "2026-11-14T00:00:00Z",
  fields: Array.from({ length: 100 }, (_, index) => ({
    id: `answer-${index + 1}`, kind: "textarea", type: "textarea", name: `answer-${index + 1}`,
    label: `Project ${Math.floor(index / questions.length) + 1}: ${questions[index % questions.length]}`,
    placeholder: "", ariaLabel: "", section: "Project evidence", required: true,
    sensitive: false, currentValue: "", maxLength: 2_000, options: [],
  })),
};

export const hundredFieldOutput: Omit<JobAnalysis, "generatedAt" | "research"> = {
  job: {
    company: "Example", role: "Senior product engineer", location: "Remote",
    employmentType: "Full-time", seniority: "Senior", summary: "Build accessible customer workflows with a cross-functional team.",
    requirements: ["TypeScript", "Product discovery"], responsibilities: ["Deliver customer workflows", "Mentor colleagues"],
    keywords: ["TypeScript", "Accessibility", "Reliability"], compensation: "Unknown", remotePolicy: "Remote",
  },
  fit: {
    score: 82, verdict: "strong", strongestMatches: ["Resume: TypeScript workflow delivery"],
    gaps: ["Confirm mentoring scope"], hardBlockers: [], recommendation: "Review the role's mentoring expectations before applying.",
  },
  company: {
    summary: "Unknown", product: "Unknown", stage: "Unknown", size: "Unknown", funding: "Unknown",
    engineeringSignals: [], risks: [], sources: [],
  },
  suggestions: hundredFieldSnapshot.fields.map((field, index) => ({
    fieldId: field.id, label: field.label, action: "fill", confidence: "high",
    value: `On project ${Math.floor(index / questions.length) + 1}, I worked with the product manager, designer, and support team to understand why customers abandoned a critical workflow. I mapped the existing steps, reviewed support reports, and proposed a smaller change that we could validate before replacing the entire experience. I implemented the TypeScript interface, added regression coverage for the failure cases, and asked a colleague to challenge the accessibility assumptions. We released the change behind a feature flag and compared completion rates with the previous version. When monitoring exposed an unexpected error, I paused the rollout, documented the cause, and added a targeted test before continuing. The experience taught me to separate evidence from assumptions, communicate uncertainty early, and make rollback decisions before a release. I used those lessons in later planning discussions and shared the checklist with colleagues who owned similar customer workflows.`,
    evidence: "Resume: cross-functional workflow delivery, TypeScript implementation, accessibility review, staged rollout, and operational follow-up.",
    warning: "Verify that this project is the best example for this specific question.",
  })),
  missingFacts: ["Confirm mentoring scope and project-specific details before filling."],
};
