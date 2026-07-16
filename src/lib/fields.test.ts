import { describe, expect, it } from "vitest";
import { PageFieldKind } from "./enums";
import { isChoiceField, optionMatches } from "./fields";
import type { PageField } from "../types";

const selectField: PageField = {
  id: "work-auth",
  kind: PageFieldKind.Select,
  type: "select",
  name: "work-auth",
  label: "Work auth",
  placeholder: "",
  ariaLabel: "",
  section: "",
  required: true,
  sensitive: false,
  currentValue: "",
  maxLength: null,
  options: [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
  ],
};

describe("field helpers", () => {
  it("matches select options by label or value", () => {
    expect(optionMatches(selectField, "Yes")).toBe(true);
    expect(optionMatches(selectField, "no")).toBe(true);
    expect(optionMatches(selectField, "Maybe")).toBe(false);
  });

  it("identifies choice fields", () => {
    expect(isChoiceField(selectField)).toBe(true);
    expect(
      isChoiceField({ ...selectField, kind: PageFieldKind.Text, options: [] }),
    ).toBe(false);
  });
});
