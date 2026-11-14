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
  return field.kind === PageFieldKind.Checkbox || field.sensitive || /\b(?:authori[sz](?:ed|ation)|sponsor(?:ship|ed)?|visas?|work permit|relocat\w*|citizenship|citizen|clearance|consent|agree|agreement|acknowledg\w*|certif\w*|attest\w*|legal(?:ly)?|terms(?: and conditions)?|privacy notice)\b/iu.test(`${field.label} ${field.name} ${field.ariaLabel}`);
}

/** True when value matches a select/radio option label or value (case-insensitive). */
export function optionMatches(field: PageField, value: string): boolean {
  const normalized = normalizeChoice(value);
  if (!normalized) return false;
  return field.options.some((option, index) => {
    if (field.kind === PageFieldKind.Select && isPlaceholderOption(option, index)) return false;
    const labels = [option.label, option.value]
      .map(normalizeChoice)
      .filter(Boolean);
    return labels.includes(normalized);
  });
}

export function isChoiceField(field: PageField): boolean {
  return (
    field.kind === PageFieldKind.Select ||
    field.kind === PageFieldKind.Radio ||
    field.kind === PageFieldKind.Checkbox
  );
}
