import { PageFieldKind } from "./enums";
import type { PageField } from "../types";

/** True when value matches a select/radio option label or value (case-insensitive). */
export function optionMatches(field: PageField, value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase();
  if (!normalized) return false;
  return field.options.some((option) => {
    const labels = [option.label, option.value]
      .map((part) => part.trim().toLocaleLowerCase())
      .filter(Boolean);
    return labels.includes(normalized);
  });
}

export function isChoiceField(field: PageField): boolean {
  return (
    field.kind === PageFieldKind.Select || field.kind === PageFieldKind.Radio
  );
}
