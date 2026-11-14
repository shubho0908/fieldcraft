import { Confidence, PageFieldKind, SuggestionAction } from "./enums";
import { isChoiceField, optionMatches } from "./fields";
import type { CandidateProfile, FieldSuggestion, PageField, PageSnapshot } from "../types";

interface SourceRule {
  confidence: Confidence;
  match: RegExp;
  value: (profile: CandidateProfile) => string | undefined;
}

const THIRD_PARTY =
  /\b(?:referrers?|references?|emergency|managers?|recruiters?|schools?|universit(?:y|ies)|colleges?|institutions?|compan(?:y|ies)|employers?|spouses?|parents?|mothers?|fathers?|supervisors?|partners?|employees?)\b/;
const ATTESTATION =
  /\b(?:authori[sz](?:ed|ation)|sponsor(?:ship|ed|ing)?|visas?|relocat(?:e|ion|ing)|mov(?:e|ing)|citizen(?:ship)?|residen(?:t|cy)|immigration|clearance|eligib(?:le|ility)|legally|right to work|work permit|permitted to work|permission to work|entitled to work|attest(?:ation)?|certif(?:y|ied|ication)|acknowledg(?:e|ed|ements?|ments?)|consent|agree(?:ment)?|accept|confirm|terms|privacy|declar(?:e|ation))\b/;

export function buildDirectSuggestions(
  snapshot: PageSnapshot,
  profile: CandidateProfile,
): FieldSuggestion[] {
  const suggestions: FieldSuggestion[] = [];

  for (const field of snapshot.fields) {
    if (field.sensitive || hasExistingValue(field)) continue;
    if (["hidden", "password", "submit", "button", "reset", "image"].includes(field.type)) continue;

    const sources = [field.label, field.ariaLabel, field.placeholder, field.name].map(cleanText);
    const question = sources.find(Boolean) ?? "";
    if (!question || sources.some((source) => THIRD_PARTY.test(source))) continue;
    if (sources.some((source) => /\b(?:first|last|middle|given|family|preferred|previous|maiden) name\b/.test(source))) {
      continue;
    }
    const section = cleanText(field.section);
    const thirdPartySection = THIRD_PARTY.test(section) ||
      /\b(?:education|employment history|work history|work experience)\b/.test(section);
    if (thirdPartySection && !/^(?:(?:please )?(?:enter|provide|type) )?(?:your|candidate|applicant)\b/.test(question)) {
      continue;
    }
    const attestation =
      field.kind === PageFieldKind.Checkbox || sources.some((source) => ATTESTATION.test(source));
    let suggestion: FieldSuggestion | undefined;

    for (const item of profile.canonicalAnswers) {
      const savedQuestion = cleanText(item.question);
      if (savedQuestion.length < 12 || savedQuestion.split(" ").length < 3) continue;
      const exactOnly = attestation ||
        /\b(?:name|email|mail|phone|salary|compensation|experience|years)\b/.test(question);
      const matches = exactOnly
        ? question === savedQuestion
        : ` ${question} `.includes(` ${savedQuestion} `);
      if (!matches) continue;
      const value = resolveValue(field, item.answer);
      if (!value) continue;
      suggestion = makeSuggestion(field, value, Confidence.High, attestation);
      break;
    }

    if (!suggestion && !attestation) {
      const label = question
        .replace(/^(?:please )?(?:enter|provide|type) /, "")
        .replace(/^(?:your|candidate|applicant) /, "");
      for (const rule of sourceRules) {
        if (!rule.match.test(label)) continue;
        if (field.kind === PageFieldKind.File && !/^(?:resume|cv|curriculum vitae)$/.test(label)) continue;
        if (field.kind !== PageFieldKind.File && /^(?:resume|cv|curriculum vitae)$/.test(label)) continue;
        const value = resolveValue(field, rule.value(profile) ?? "");
        if (!value) continue;
        suggestion = makeSuggestion(field, value, rule.confidence, false);
        break;
      }
    }

    if (suggestion) suggestions.push(suggestion);
  }

  return suggestions;
}

function hasExistingValue(field: PageField): boolean {
  if (field.kind === PageFieldKind.Checkbox) return field.currentValue === "true";
  return field.currentValue.trim().length > 0;
}

function resolveValue(field: PageField, raw: string): string | undefined {
  const value = raw.trim();
  if (!value || (field.maxLength !== null && field.maxLength >= 0 && value.length > field.maxLength)) {
    return undefined;
  }
  if (isChoiceField(field) && !optionMatches(field, value)) return undefined;
  return value;
}

function makeSuggestion(
  field: PageField,
  value: string,
  confidence: Confidence,
  attestation: boolean,
): FieldSuggestion {
  return {
    fieldId: field.id,
    label: field.label,
    action: attestation ? SuggestionAction.Review : SuggestionAction.Fill,
    value,
    confidence,
    evidence: attestation ? "Exact saved question and answer" : "Filled directly from profile",
    warning: attestation
      ? "Verify this saved answer against the exact question, including its polarity and jurisdiction, before selecting it."
      : "",
  };
}

function cleanText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\((?:required|optional)\)/gi, " ")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const sourceRules: SourceRule[] = [
  {
    confidence: Confidence.Medium,
    match: /^(?:resume|cv|curriculum vitae)$/,
    value: (profile) => profile.resumeAttachment?.name,
  },
  {
    confidence: Confidence.High,
    match: /^e ?mail(?: address)?$/,
    value: (profile) => profile.identity.email,
  },
  {
    confidence: Confidence.High,
    match: /^(?:(?:phone|mobile|cell|telephone)(?: number)?|cell phone(?: number)?)$/,
    value: (profile) => profile.identity.phone,
  },
  {
    confidence: Confidence.High,
    match: /^(?:name|full name|legal name|full legal name)$/,
    value: (profile) => profile.identity.fullName,
  },
  {
    confidence: Confidence.High,
    match: /^(?:location|current location|where are you based)$/,
    value: (profile) => profile.identity.location,
  },
  {
    confidence: Confidence.High,
    match: /^linked ?in(?: profile)?(?: url)?$/,
    value: (profile) => profile.identity.linkedin,
  },
  {
    confidence: Confidence.High,
    match: /^git ?hub(?: profile)?(?: url)?$/,
    value: (profile) => profile.identity.github,
  },
  {
    confidence: Confidence.Medium,
    match: /^(?:portfolio(?: url| website)?|(?:personal )?website(?: url)?)$/,
    value: (profile) => profile.identity.portfolio,
  },
  {
    confidence: Confidence.Medium,
    match: /^(?:professional )?headline$/,
    value: (profile) => profile.headline,
  },
  {
    confidence: Confidence.Medium,
    match: /^(?:(?:target|desired) role|desired job title)$/,
    value: (profile) => profile.targetRoles,
  },
  {
    confidence: Confidence.Medium,
    match: /^(?:(?:(?:total|overall) years of (?:professional |work )?experience|years of (?:professional|work) experience)|how many (?:total|overall) years of (?:professional |work )?experience do you have)$/,
    value: (profile) => profile.defaults.yearsOfExperience,
  },
  {
    confidence: Confidence.Medium,
    match: /^(?:notice period|what is your notice period)$/,
    value: (profile) => profile.defaults.noticePeriod,
  },
  {
    confidence: Confidence.Medium,
    match: /^current (?:compensation|salary)$/,
    value: (profile) => profile.defaults.currentCompensation,
  },
  {
    confidence: Confidence.Medium,
    match: /^(?:expected (?:compensation|salary)|desired salary)$/,
    value: (profile) => profile.defaults.expectedCompensation,
  },
  {
    confidence: Confidence.Medium,
    match: /^(?:remote preference|work preference|(?:preferred )?work arrangement|work mode)$/,
    value: (profile) => profile.defaults.remotePreference,
  },
  {
    confidence: Confidence.Medium,
    match: /^(?:how did you hear about us|how did you find this (?:job|role)|referral source)$/,
    value: (profile) => profile.defaults.referralSource,
  },
];
