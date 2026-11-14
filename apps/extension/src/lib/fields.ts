import { PageFieldKind } from "./enums";
import type { FieldOption, PageField } from "../types";

export function normalizeChoice(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export function isPlaceholderOption(
  option: FieldOption & { disabled?: boolean; hidden?: boolean },
  index: number,
): boolean {
  const value = normalizeChoice(option.value);
  const label = normalizeChoice(option.label);
  return (
    !value ||
    (index === 0 && Boolean(option.disabled || option.hidden)) ||
    /^(?:[-–—]+|[-–—\s]*(?:please\s+)?(?:select|choose|pick)(?:\b[\s.…”:\-–—].*)?)$/iu.test(label)
  );
}

export function getMeaningfulCurrentValue(field: PageField): string {
  if (field.kind !== PageFieldKind.Select) return field.currentValue;
  const value = normalizeChoice(field.currentValue);
  if (!value) return "";
  const index = field.options.findIndex((option) => normalizeChoice(option.value) === value);
  return index >= 0 && isPlaceholderOption(field.options[index], index) ? "" : field.currentValue;
}

export function requiresExplicitReview(field: PageField): boolean {
  const text = [field.label, field.name, field.ariaLabel, field.placeholder]
    .join(" ")
    .normalize("NFKC")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ");
  return field.kind === PageFieldKind.Checkbox || field.sensitive || /\b(?:authori[sz](?:ed|ation)|sponsor(?:ship|ed|ing)?|visas?|relocat\w*|mov(?:e|ing)|citizen(?:ship)?|residen(?:t|cy)|immigration|clearance|eligib(?:le|ility)|legal(?:ly)?|right to work|work permit|permitted to work|permission to work|entitled to work|attest\w*|certif\w*|acknowledg\w*|consent|agree(?:ment)?|accept|confirm|terms|privacy|declar(?:e|ation))\b/iu.test(text);
}

/** Labels and values share an input namespace; conflicting matches fail closed. */
export function findUniqueChoice<T>(
  options: readonly T[],
  value: string,
  labels: (option: T) => readonly string[],
): T | undefined {
  const normalized = normalizeChoice(value);
  if (!normalized) return undefined;
  let match: T | undefined;
  for (const option of new Set(options)) {
    if (!labels(option).some((label) => normalizeChoice(label) === normalized)) continue;
    if (match !== undefined) return undefined;
    match = option;
  }
  return match;
}

/** True only when a choice identifies one actual option, never a placeholder. */
export function optionMatches(field: PageField, value: string): boolean {
  const options = field.options.filter((option, index) => field.kind !== PageFieldKind.Select || !isPlaceholderOption(option, index));
  if (field.kind === PageFieldKind.Checkbox) {
    // Checkbox entries are aliases for the same boolean control, not competing
    // options ("Checked", "true", and "1" all identify the same state).
    const normalized = normalizeChoice(value);
    return Boolean(normalized) && options.some((option) => [option.label, option.value].some((label) => normalizeChoice(label) === normalized));
  }
  return findUniqueChoice(options, value, (option) => [option.label, option.value]) !== undefined;
}

export function isChoiceField(field: PageField): boolean {
  return (
    field.kind === PageFieldKind.Select ||
    field.kind === PageFieldKind.Radio ||
    field.kind === PageFieldKind.Checkbox
  );
}
