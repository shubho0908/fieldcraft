import { Confidence, PageFieldKind, SuggestionAction } from "./enums";
import { isChoiceField, optionMatches } from "./fields";
import type { CandidateProfile, FieldSuggestion, PageField, PageSnapshot } from "../types";

interface SourceRule {
  confidence: Confidence;
  match: (haystack: string, field: PageField) => boolean;
  value: (profile: CandidateProfile, field: PageField) => string | undefined;
}

export function buildDirectSuggestions(
  snapshot: PageSnapshot,
  profile: CandidateProfile,
): FieldSuggestion[] {
  const suggestions: FieldSuggestion[] = [];

  for (const field of snapshot.fields) {
    if (field.sensitive) continue;
    if (hasExistingValue(field)) continue;

    const haystack = makeHaystack(field);
    let suggestion: FieldSuggestion | undefined;

    // Canonical answers get first priority because they are explicit question/answer pairs.
    for (const item of profile.canonicalAnswers) {
      if (!item.question.trim() || !item.answer.trim()) continue;
      const question = cleanText(item.question);
      if (!question || !haystack.includes(question)) continue;
      const resolved = resolveValue(field, item.answer);
      if (!resolved) continue;
      suggestion = makeSuggestion(field, resolved.value, resolved.warning, Confidence.High);
      break;
    }

    if (!suggestion) {
      for (const rule of sourceRules) {
        if (!rule.match(haystack, field)) continue;
        const raw = rule.value(profile, field);
        if (!raw || !raw.trim()) continue;
        const resolved = resolveValue(field, raw);
        if (!resolved) continue;
        suggestion = makeSuggestion(field, resolved.value, resolved.warning, rule.confidence);
        break;
      }
    }

    if (suggestion) {
      suggestions.push(suggestion);
    }
  }

  return suggestions;
}

function makeHaystack(field: PageField): string {
  return cleanText(`${field.label} ${field.name} ${field.placeholder} ${field.ariaLabel} ${field.section}`);
}

function hasExistingValue(field: PageField): boolean {
  if (field.kind === PageFieldKind.Checkbox) {
    return field.currentValue === "true";
  }
  if (field.kind === PageFieldKind.File) {
    return field.currentValue.trim().length > 0;
  }
  return field.currentValue.trim().length > 0;
}

function resolveValue(
  field: PageField,
  raw: string,
): { value: string; warning: string } | undefined {
  const value = raw.trim();
  if (!value) return undefined;

  let warning = "";

  if (field.maxLength && value.length > field.maxLength) {
    warning = `Truncated to ${field.maxLength} characters`;
    return { value: value.slice(0, field.maxLength), warning };
  }

  if (field.kind === PageFieldKind.File) {
    return { value, warning };
  }

  if (isChoiceField(field) && !optionMatches(field, value)) {
    return undefined;
  }

  return { value, warning };
}

function makeSuggestion(
  field: PageField,
  value: string,
  warning: string,
  confidence: Confidence,
): FieldSuggestion {
  return {
    fieldId: field.id,
    label: field.label,
    action: warning ? SuggestionAction.Review : SuggestionAction.Fill,
    value,
    confidence,
    evidence: "Filled directly from profile",
    warning,
  };
}

function cleanText(value: string): string {
  return value
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

const sourceRules: SourceRule[] = [
  // Resume file
  {
    confidence: Confidence.Medium,
    match(haystack, field) {
      return field.kind === PageFieldKind.File && /\bresume\b|\bcv\b|\bcurriculum\b/.test(haystack);
    },
    value(profile, _field) {
      return profile.resumeAttachment?.name;
    },
  },
  // Identity
  {
    confidence: Confidence.High,
    match(haystack, _field) {
      return /\bemail\b/.test(haystack) && !/\bcompany\b/.test(haystack);
    },
    value(profile, _field) {
      return profile.identity.email;
    },
  },
  {
    confidence: Confidence.High,
    match(haystack, _field) {
      return /\bphone\b|\bmobile\b|\bcell\b|\btelephone\b/.test(haystack);
    },
    value(profile, _field) {
      return profile.identity.phone;
    },
  },
  {
    confidence: Confidence.High,
    match(haystack, _field) {
      return /\bname\b/.test(haystack) && !/\bcompany\b|\bfirst name\b|\blast name\b/.test(haystack);
    },
    value(profile, _field) {
      return profile.identity.fullName;
    },
  },
  {
    confidence: Confidence.High,
    match(haystack, _field) {
      return /\blocation\b|\bcity\b|\baddress\b|\bbased in\b/.test(haystack);
    },
    value(profile, _field) {
      return profile.identity.location;
    },
  },
  {
    confidence: Confidence.High,
    match(haystack, _field) {
      return /\blinkedin\b/.test(haystack);
    },
    value(profile, _field) {
      return profile.identity.linkedin;
    },
  },
  {
    confidence: Confidence.High,
    match(haystack, _field) {
      return /\bgithub\b/.test(haystack);
    },
    value(profile, _field) {
      return profile.identity.github;
    },
  },
  {
    confidence: Confidence.Medium,
    match(haystack, _field) {
      return /\bportfolio\b|\bwebsite\b|\burl\b/.test(haystack);
    },
    value(profile, _field) {
      return profile.identity.portfolio;
    },
  },
  // Profile top-level
  {
    confidence: Confidence.Medium,
    match(haystack, _field) {
      return /\bheadline\b/.test(haystack);
    },
    value(profile, _field) {
      return profile.headline;
    },
  },
  {
    confidence: Confidence.Medium,
    match(haystack, _field) {
      return /\btarget role\b|\bdesired role\b|\bjob title\b/.test(haystack);
    },
    value(profile, _field) {
      return profile.targetRoles;
    },
  },
  // Defaults
  {
    confidence: Confidence.Medium,
    match(haystack, _field) {
      return /\byears of experience\b|\byoe\b/.test(haystack);
    },
    value(profile, _field) {
      return profile.defaults.yearsOfExperience;
    },
  },
  {
    confidence: Confidence.Medium,
    match(haystack, _field) {
      return /\bnotice period\b|\bnotice\b/.test(haystack);
    },
    value(profile, _field) {
      return profile.defaults.noticePeriod;
    },
  },
  {
    confidence: Confidence.Medium,
    match(haystack, _field) {
      return (
        /\bauthorized to work\b/.test(haystack) ||
        /\bwork authorization\b/.test(haystack) ||
        /\bwork authorisation\b/.test(haystack) ||
        /\beligibility\b/.test(haystack)
      );
    },
    value(profile, _field) {
      return profile.defaults.authorizedToWork;
    },
  },
  {
    confidence: Confidence.Medium,
    match(haystack, _field) {
      return /\bsponsorship\b|\bvisa\b/.test(haystack);
    },
    value(profile, _field) {
      return profile.defaults.needsSponsorship;
    },
  },
  {
    confidence: Confidence.Medium,
    match(haystack, _field) {
      return /\bcurrent compensation\b|\bcurrent salary\b/.test(haystack);
    },
    value(profile, _field) {
      return profile.defaults.currentCompensation;
    },
  },
  {
    confidence: Confidence.Medium,
    match(haystack, _field) {
      return (
        /\bexpected compensation\b/.test(haystack) ||
        /\bexpected salary\b/.test(haystack) ||
        /\bdesired salary\b/.test(haystack)
      );
    },
    value(profile, _field) {
      return profile.defaults.expectedCompensation;
    },
  },
  {
    confidence: Confidence.Medium,
    match(haystack, _field) {
      return (
        /\bremote preference\b/.test(haystack) ||
        /\bwork preference\b/.test(haystack) ||
        /\bwork arrangement\b/.test(haystack) ||
        /\bwork mode\b/.test(haystack)
      );
    },
    value(profile, _field) {
      return profile.defaults.remotePreference;
    },
  },
  {
    confidence: Confidence.Medium,
    match(haystack, _field) {
      return /\brelocate\b|\brelocation\b/.test(haystack);
    },
    value(profile, _field) {
      return profile.defaults.willingToRelocate;
    },
  },
  {
    confidence: Confidence.Medium,
    match(haystack, _field) {
      return (
        /\bhow did you hear\b/.test(haystack) ||
        /\bhow did you find\b/.test(haystack) ||
        /\breferral source\b/.test(haystack) ||
        /\breferred\b/.test(haystack)
      );
    },
    value(profile, _field) {
      return profile.defaults.referralSource;
    },
  },
];
