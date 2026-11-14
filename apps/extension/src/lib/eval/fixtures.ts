import type { PageField } from "../../types";
import { PageFieldKind, SuggestionAction } from "../enums";
import { FIXTURE_DATE, PROFILES } from "../__fixtures__/live-eval/profiles";
import { POSTINGS, postingText } from "../__fixtures__/live-eval/postings";
import type { EvalFixture } from "./types";

export function evalField(id: string, label: string, kind: PageField["kind"] = PageFieldKind.Text): PageField {
  return { id, name: id, label, kind, type: kind, placeholder: "", ariaLabel: "", section: "Application", required: true, sensitive: false, currentValue: "", maxLength: null, options: [] };
}

export const EVAL_FIXTURES: EvalFixture[] = POSTINGS.map((spec) => {
  const profile = structuredClone(PROFILES[spec.profile]);
  const pageText = postingText(spec);
  const fields = [evalField("full-name", "Full name"), evalField("email", "Email address"), evalField("relevant-work", "Describe work from your resume relevant to this role, including what you personally owned.", PageFieldKind.Textarea)];
  if (spec.coverage.includes("per-skill-years")) fields.push(evalField("kubernetes-years", "How many years of professional experience do you have with Kubernetes?"));
  if (spec.coverage.includes("100-field-output")) {
    const prompts = ["Describe a React component you implemented", "Explain your role in a testing project", "Describe how you handle accessibility", "Explain a bug you investigated", "Describe a collaboration with a senior engineer", "What experience do you have with cloud administration?", "What distributed-systems architecture have you owned?", "Describe your experience with production Kubernetes", "What professional certifications do you hold?", "What experience do you have with people management?"];
    for (let i = fields.length; i < 100; i++) fields.push(evalField(`question-${i + 1}`, `${prompts[(i - 3) % prompts.length]} (application section ${Math.floor((i - 3) / 10) + 1}). Use only the supplied resume and say when evidence is absent.`, PageFieldKind.Textarea));
  }
  const band = spec.verdict === "excellent" ? { min: 90, max: 98 }
    : spec.verdict === "strong" ? { min: 77, max: 89 }
    : spec.verdict === "mixed" ? { min: 52, max: 70 }
    : spec.verdict === "weak" ? { min: 5, max: 45 } : null;
  return {
    id: spec.id, description: `${spec.profile} × ${spec.company}: ${spec.role}`,
    provenance: "authored-realistic", coverage: spec.coverage,
    company: { name: spec.company, officialDomain: spec.domain, researchAllowed: spec.researchAllowed !== false },
    profile,
    snapshot: {
      title: `${spec.role} — ${spec.company}`, url: `https://careers.${spec.domain}/eval-scenarios/${spec.id}${spec.applicationOnly ? "/apply" : ""}`,
      hostname: `careers.${spec.domain}`, ats: "Authored evaluation fixture", headings: spec.applicationOnly ? ["Application"] : [spec.role, "Required qualifications"],
      pageText, fields, capturedAt: FIXTURE_DATE,
      jobDescriptionDetected: !spec.applicationOnly,
      jobDescriptionSource: spec.applicationOnly ? "none" : "authored-posting",
      jobDescriptionText: spec.applicationOnly ? "" : pageText,
      companyHints: { structuredNames: [spec.company], metadataNames: [spec.company], officialDomains: [spec.domain] },
    },
    expectations: {
      score: band, verdict: spec.verdict,
      requiredBlockerSubstrings: spec.blockers,
      mustNotClaim: spec.forbidden,
      fields: [
        { fieldId: "full-name", action: SuggestionAction.Fill, valueEquals: profile.identity.fullName },
        { fieldId: "email", action: SuggestionAction.Fill, valueEquals: profile.identity.email },
        ...(spec.coverage.includes("per-skill-years") ? [{ fieldId: "kubernetes-years", valueExcludes: "4" }] : []),
      ],
    },
  };
});

export function getEvalFixture(id: string): EvalFixture {
  const fixture = EVAL_FIXTURES.find((item) => item.id === id);
  if (!fixture) throw new Error(`Unknown eval fixture: ${id}`);
  return fixture;
}
