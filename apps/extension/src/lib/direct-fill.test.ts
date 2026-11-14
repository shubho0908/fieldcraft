import { beforeEach, describe, expect, it } from "vitest";
import type { CandidateProfile, PageField, PageSnapshot } from "../types";
import { buildDirectSuggestions } from "./direct-fill";
import { PageFieldKind, SuggestionAction } from "./enums";
import { collectPageSnapshot } from "./page";
import { directLabelCorpus, directProfile, directValues } from "./__fixtures__/direct-fill-corpus";

function field(label: string, overrides: Partial<PageField> = {}): PageField {
  return {
    id: "test-field", kind: PageFieldKind.Text, type: "text", name: "", label,
    placeholder: "", ariaLabel: "", section: "", required: false, sensitive: false,
    currentValue: "", maxLength: null, options: [], ...overrides,
  };
}

function snapshot(fields: PageField[]): PageSnapshot {
  return {
    title: "Apply to Acme", url: "https://example.com/apply", hostname: "example.com",
    ats: "Generic", headings: [], pageText: "", fields, capturedAt: "2026-11-14T00:00:00.000Z",
  };
}

function suggest(label: string, profile = directProfile, overrides: Partial<PageField> = {}) {
  return buildDirectSuggestions(snapshot([field(label, overrides)]), profile);
}

function canonical(question: string, answer = "No"): CandidateProfile {
  return { ...directProfile, canonicalAnswers: [{ id: "saved-answer", question, answer }] };
}

describe("deterministic Direct-fill label corpus", () => {
  it("reports precision and permits no wrong high-impact values", () => {
    expect(directLabelCorpus.length).toBeGreaterThanOrEqual(100);
    expect(new Set(directLabelCorpus.map((item) => `${item.label}:${JSON.stringify(item.field)}`)).size)
      .toBe(directLabelCorpus.length);
    const results = directLabelCorpus.map((item) => {
      const suggestion = suggest(item.label, directProfile, item.field)[0];
      const expected = item.mapping ? directValues[item.mapping] : undefined;
      return { ...item, actual: suggestion?.value, expected };
    });
    const proposed = results.filter((item) => item.actual !== undefined);
    const wrong = proposed.filter((item) => item.actual !== item.expected);
    const missing = results.filter((item) => item.expected !== undefined && item.actual === undefined);
    const wrongHighImpact = wrong.filter((item) => item.impact !== "other");
    console.info(JSON.stringify({
      corpus: results.length, proposed: proposed.length, correct: proposed.length - wrong.length,
      wrong: wrong.length, missing: missing.length, wrongHighImpact: wrongHighImpact.length,
      precision: proposed.length ? (proposed.length - wrong.length) / proposed.length : 0,
    }));
    expect(wrongHighImpact).toEqual([]);
    expect(wrong).toEqual([]);
    expect(missing).toEqual([]);
  });
});

describe("Direct-fill canonical answer boundaries", () => {
  it.each(["Expected salary", "Email", "Why us?"])("honors the exact short saved question %s", (question) => {
    expect(suggest(question, canonical(question, "Exact saved answer"))[0])
      .toMatchObject({ value: "Exact saved answer", action: SuggestionAction.Fill });
  });

  it("keeps identity and third-party vetoes for exact short saved questions", () => {
    expect(suggest("Email", canonical("Email", "WRONG"), { name: "reference_email" })).toEqual([]);
    expect(suggest("Name", canonical("Name", "WRONG"), { name: "first_name" })).toEqual([]);
  });

  it.each([
    "Do you have the right to work in Canada?",
    "Are you a permanent resident?",
    "I confirm this information is accurate",
  ])("reviews saved legal answers when the question is in a placeholder: %s", (question) => {
    expect(suggest("Answer", canonical("Answer", "Yes"), { placeholder: question })[0])
      .toMatchObject({ value: "Yes", action: SuggestionAction.Review, warning: expect.stringMatching(/verify/i) });
    expect(suggest("", canonical(question, "Yes"), { placeholder: question })[0])
      .toMatchObject({ value: "Yes", action: SuggestionAction.Review });
  });

  it("matches a normalized whole phrase without matching parts of words", () => {
    const profile = canonical("Describe your motivation", "I enjoy careful product work.");
    expect(suggest("Please describe your motivation for this role", profile)[0]?.value)
      .toBe("I enjoy careful product work.");
    expect(suggest("Describe your motivational goals", profile)).toEqual([]);
    expect(suggest("Describe your motivationless week", profile)).toEqual([]);
  });

  it.each(["a", "us", "name", "email", "why us", "visa", "work"])(
    "rejects the short canonical key %s", (question) => {
      expect(suggest("Tell us about a time your work created business value", canonical(question, "WRONG")))
        .toEqual([]);
    },
  );

  it("does not assemble a canonical question across metadata or section text", () => {
    const profile = canonical("Tell us about yourself", "Saved introduction");
    expect(suggest("Tell us", profile, { name: "about yourself" })).toEqual([]);
    expect(suggest("Anything else?", profile, { section: "Tell us about yourself" })).toEqual([]);
  });

  it("does not reuse a canonical answer for an opposite or extended question", () => {
    const question = "Are you able to work without visa sponsorship?";
    const profile = canonical(question);
    const exact = suggest("ARE YOU ABLE TO WORK WITHOUT VISA SPONSORSHIP?", profile)[0];
    expect(exact).toMatchObject({ value: "No", action: SuggestionAction.Review });
    expect(exact?.warning).toMatch(/verify|confirm|review/i);
    expect(suggest("Are you able to work without visa sponsorship in Canada?", profile)).toEqual([]);
    expect(suggest("Are you not able to work without visa sponsorship?", profile)).toEqual([]);
    expect(suggest(`Please confirm: ${question}`, profile)).toEqual([]);
    expect(suggest("Do you currently hold a valid work visa?", profile)).toEqual([]);
  });

  it.each([
    "Are you authorized to work in India?", "Will you require sponsorship?",
    "Do you hold a valid visa?", "Are you willing to relocate?", "Are you a US citizen?",
    "Do you have security clearance?", "I certify the information is accurate",
    "I acknowledge the privacy notice", "Do you consent to data processing?",
    "Do you agree to the terms?", "Are you legally eligible for employment?",
    "Do you have the right to work in Canada?", "Do you hold a work permit?",
    "Are you a permanent resident?", "Are you open to moving to London?",
    "I confirm this information is accurate", "I accept the application conditions",
    "Are you permitted to work in the UK?",
  ])("requires explicit review for an exact saved attestation: %s", (question) => {
    expect(suggest(question)).toEqual([]);
    const result = suggest(question, canonical(question, "Yes"))[0];
    expect(result).toMatchObject({ value: "Yes", action: SuggestionAction.Review });
    expect(result?.warning).toMatch(/verify|confirm|review/i);
    expect(suggest(`${question} Additional terms apply.`, canonical(question, "Yes"))).toEqual([]);
  });

  it("never maps a candidate's canonical email into a third-party question", () => {
    expect(suggest("Referrer's email address", canonical("email address", "WRONG"))).toEqual([]);
    expect(suggest("What is your manager email address?", canonical("What is your manager email address?", "WRONG")))
      .toEqual([]);
  });
});

describe("Direct-fill conservative field handling", () => {
  it("preserves saved legal-name mappings while requiring review", () => {
    expect(suggest("Legal name")[0]).toMatchObject({ value: directValues.fullName, action: SuggestionAction.Review });
    expect(suggest("Full legal name")[0]).toMatchObject({ value: directValues.fullName, action: SuggestionAction.Review });
  });

  it("uses metadata only as a fallback and never lets a section trigger a rule", () => {
    expect(suggest("", directProfile, { name: "fullName" })[0]?.value).toBe(directValues.fullName);
    expect(suggest("", directProfile, { ariaLabel: "Email address" })[0]?.value).toBe(directValues.email);
    expect(suggest("", directProfile, { placeholder: "Your phone number" })[0]?.value).toBe(directValues.phone);
    expect(suggest("Department", directProfile, { section: "Email and full name" })).toEqual([]);
    expect(suggest("School", directProfile, { placeholder: "Your full name" })).toEqual([]);
  });

  it("does not split culturally ambiguous names or assume a preferred name", () => {
    const profile = { ...directProfile, identity: { ...directProfile.identity, fullName: "María del Carmen García López" } };
    for (const label of ["First name", "Last name", "Preferred name"]) {
      expect(suggest(label, profile)).toEqual([]);
    }
  });

  it("does not treat a component-name control as a full-name control", () => {
    expect(suggest("Name", directProfile, { name: "first_name" })).toEqual([]);
    expect(suggest("Full name", directProfile, { ariaLabel: "Last name" })).toEqual([]);
    expect(suggest("Name", directProfile, { placeholder: "Preferred name" })).toEqual([]);
  });

  it("uses third-party section context only to veto ambiguous mappings", () => {
    expect(suggest("Name", directProfile, { section: "Emergency contact" })).toEqual([]);
    expect(suggest("Email", directProfile, { section: "Professional references" })).toEqual([]);
    expect(suggest("Name", directProfile, { section: "Education" })).toEqual([]);
    expect(suggest("Name", directProfile, { section: "Employment history" })).toEqual([]);
    expect(suggest("Your full name", directProfile, { section: "Employer information" })[0]?.value)
      .toBe(directValues.fullName);
  });

  it("does not emit truncated values or guess unavailable choices", () => {
    expect(suggest("Full name", directProfile, { maxLength: 3 })).toEqual([]);
    expect(suggest("Expected salary", directProfile, { maxLength: 4 })).toEqual([]);
    expect(suggest("Remote preference", directProfile, {
      kind: PageFieldKind.Select, options: [{ value: "hybrid", label: "Hybrid" }],
    })).toEqual([]);
    expect(suggest("Remote preference", directProfile, {
      kind: PageFieldKind.Select, options: [{ value: "remote", label: "Remote" }],
    })[0]?.value).toBe("Remote");
  });

  it("keeps existing values, sensitive fields, and absent profile facts untouched", () => {
    expect(suggest("Email", directProfile, { currentValue: "other@example.com" })).toEqual([]);
    expect(suggest("Full name", directProfile, { sensitive: true })).toEqual([]);
    expect(suggest("Email", { ...directProfile, identity: { ...directProfile.identity, email: "" } })).toEqual([]);
  });
});

describe("Direct-fill through captured application forms", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
  });

  it("keeps candidate mappings separate from institutions and third parties under a shared heading", () => {
    document.body.innerHTML = `<main><h1>Apply</h1><section><h2>Your name and contact</h2><form>
      <label for="own-name">Full name</label><input id="own-name">
      <label for="school">School name</label><input id="school">
      <label for="employer">Current employer</label><input id="employer">
      <label for="title">Current job title</label><input id="title">
      <label for="emergency">Emergency contact name</label><input id="emergency">
      <label for="referrer">Referrer's email</label><input id="referrer" type="email">
      <label for="own-email">Email address</label><input id="own-email" type="email">
      <label for="skill">How many years of experience do you have with Kubernetes?</label><input id="skill">
      <label for="source">How did you hear about us? (e.g. company website)</label><input id="source">
      <label for="visa">Do you currently hold a valid work visa?</label><input id="visa">
      <label for="inverted">Are you able to work without visa sponsorship?</label><input id="inverted">
      <label for="website">Website</label><input id="website" hidden>
    </form></section></main>`;
    const captured = collectPageSnapshot(document);
    expect(captured.fields).toHaveLength(11);
    const suggestions = buildDirectSuggestions(captured, directProfile);
    expect(suggestions.map(({ label, value }) => ({ label, value }))).toEqual([
      { label: "Full name", value: directValues.fullName },
      { label: "Email address", value: directValues.email },
    ]);
    expect(Array.from(document.querySelectorAll("input")).every((input) => input.value === "")).toBe(true);
  });

  it("requires exact saved answers and a review warning for captured legal choices", () => {
    const question = "Are you able to work without visa sponsorship?";
    document.body.innerHTML = `<form><fieldset><legend>${question}</legend>
      <input type="radio" name="sponsorship" id="yes" value="yes"><label for="yes">Yes</label>
      <input type="radio" name="sponsorship" id="no" value="no"><label for="no">No</label>
    </fieldset></form>`;
    const captured = collectPageSnapshot(document);
    expect(buildDirectSuggestions(captured, directProfile)).toEqual([]);
    const suggestions = buildDirectSuggestions(captured, canonical(question));
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ action: SuggestionAction.Review, value: "No" });
    expect(suggestions[0].warning).toMatch(/verify|confirm|review/i);
    expect(document.querySelector<HTMLInputElement>("input:checked")).toBeNull();
  });
});
