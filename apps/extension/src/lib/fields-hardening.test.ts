import { describe, expect, it } from "vitest";
import { getMeaningfulCurrentValue, isPlaceholderOption, optionMatches, requiresExplicitReview } from "./fields";
import { PageFieldKind } from "./enums";
import type { PageField } from "../types";

const field: PageField = { id: "country", label: "Country", name: "country", kind: PageFieldKind.Select, type: "select", placeholder: "", ariaLabel: "", section: "Application", required: true, sensitive: false, maxLength: null, currentValue: "0", options: [{ value: "0", label: "-- choose --" }, { value: "in", label: "India" }] };

describe("placeholder and exact choice helpers", () => {
  it.each([
    [{ value: "0", label: "-- choose --" }, true], [{ value: "-1", label: "Pick one" }, true],
    [{ value: "", label: "Select" }, true], [{ value: "pick", label: "Please select a country" }, true],
    [{ value: "choose", label: "Country", disabled: true }, true], [{ value: "choose", label: "Country", hidden: true }, true],
    [{ value: "in", label: "India" }, false], [{ value: "no", label: "No" }, false],
    [{ value: "0", label: "No" }, false], [{ value: "0", label: "0 years" }, false], [{ value: "-1", label: "Not applicable" }, false],
  ])("detects placeholder %j as %s", (option, expected) => { expect(isPlaceholderOption(option, 0)).toBe(expected); });

  it("normalizes legacy select placeholders but preserves text and selected real options", () => {
    expect(getMeaningfulCurrentValue(field)).toBe("");
    expect(getMeaningfulCurrentValue({ ...field, currentValue: "in" })).toBe("in");
    expect(getMeaningfulCurrentValue({ ...field, currentValue: "0", kind: PageFieldKind.Text })).toBe("0");
  });

  it("does not accept placeholders, empty labels, or fuzzy substrings as valid choices", () => {
    expect(optionMatches(field, "0")).toBe(false);
    expect(optionMatches(field, "I don't know")).toBe(false);
    expect(optionMatches(field, "Ind")).toBe(false);
    expect(optionMatches(field, " india ")).toBe(true);
  });

  it.each([PageFieldKind.Select, PageFieldKind.Radio])("rejects ambiguous exact labels and values for %s", (kind) => {
    const options = [{ value: "1", label: "2" }, { value: "2", label: "3" }];
    expect(optionMatches({ ...field, kind, options }, "2")).toBe(false);
    expect(optionMatches({ ...field, kind, options }, "3")).toBe(true);
    expect(optionMatches({ ...field, kind, options: [{ value: "yes", label: "YES" }] }, "yes")).toBe(true);
  });

  it.each([
    ["Are you authorized to work?", true], ["Will you require sponsorship?", true], ["Valid work visa", true],
    ["Willing to relocate", true], ["Citizenship", true], ["Security clearance", true], ["I consent to processing", true],
    ["I acknowledge the terms", true], ["I certify this is accurate", true], ["Country", false], ["Email address", false],
  ])("requires explicit review for %s: %s", (label, expected) => {
    expect(requiresExplicitReview({ ...field, label, name: "" })).toBe(expected);
  });

  it("always requires review for checkboxes and demographic fields", () => {
    expect(requiresExplicitReview({ ...field, kind: PageFieldKind.Checkbox })).toBe(true);
    expect(requiresExplicitReview({ ...field, sensitive: true })).toBe(true);
  });

  it("preserves meaningful zero and negative-one select values", () => {
    const options = [{ value: "0", label: "No" }, { value: "-1", label: "Not applicable" }];
    expect(getMeaningfulCurrentValue({ ...field, options })).toBe("0");
    expect(optionMatches({ ...field, options }, "No")).toBe(true);
    expect(optionMatches({ ...field, options }, "-1")).toBe(true);
  });
});
