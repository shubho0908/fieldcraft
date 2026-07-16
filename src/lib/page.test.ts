import { beforeEach, describe, expect, it } from "vitest";
import { collectFields, collectPageSnapshot, fillPageFields } from "./page";
import type { FieldSuggestion } from "../types";

import { Confidence, SuggestionAction } from "./enums";
describe("job application page engine", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.title = "Product Engineer — Acme";
  });

  it("extracts labelled fields, radio groups, options, and sensitive markers", () => {
    document.body.innerHTML = `
      <main>
        <h1>Product Engineer</h1>
        <p>Build reliable AI workflows for production customers.</p>
        <form>
          <label for="name">Full name *</label>
          <input id="name" name="name" required />

          <label for="location">Location</label>
          <select id="location" name="location">
            <option value="">Choose</option>
            <option value="blr">Bengaluru</option>
          </select>

          <fieldset>
            <legend>Will you now or in the future need sponsorship?</legend>
            <input type="radio" id="visa-yes" name="visa" value="yes" />
            <label for="visa-yes">Yes</label>
            <input type="radio" id="visa-no" name="visa" value="no" />
            <label for="visa-no">No</label>
          </fieldset>

          <label for="gender">Gender</label>
          <select id="gender" name="gender"><option>Decline to self-identify</option></select>
        </form>
      </main>
    `;

    const fields = collectFields(document);
    expect(fields).toHaveLength(4);
    expect(fields[0]).toMatchObject({ label: "Full name", required: true, kind: "text" });
    expect(fields[1].options).toContainEqual({ value: "blr", label: "Bengaluru" });
    expect(fields[2]).toMatchObject({
      kind: "radio",
      label: "Will you now or in the future need sponsorship?",
    });
    expect(fields[2].options).toEqual([
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ]);
    expect(fields[3].sensitive).toBe(true);

    const snapshot = collectPageSnapshot(document);
    expect(snapshot.title).toBe("Product Engineer — Acme");
    expect(snapshot.pageText).toContain("Build reliable AI workflows");
  });

  it("fills text, native select, radio, and checkbox controls with browser events", async () => {
    document.body.innerHTML = `
      <form>
        <label for="name">Full name</label><input id="name" />
        <label for="city">City</label>
        <select id="city"><option value="">Choose</option><option value="blr">Bengaluru</option></select>
        <fieldset><legend>Sponsorship</legend>
          <input type="radio" id="yes" name="sponsor" value="yes"><label for="yes">Yes</label>
          <input type="radio" id="no" name="sponsor" value="no"><label for="no">No</label>
        </fieldset>
        <label for="agree">I agree</label><input type="checkbox" id="agree" />
      </form>
    `;
    const fields = collectFields(document);
    const changes: string[] = [];
    document.querySelectorAll("input,select").forEach((field) =>
      field.addEventListener("change", () => changes.push((field as HTMLElement).id)),
    );
    const values = ["Shubhojeet Bera", "Bengaluru", "No", "true"];
    const suggestions: FieldSuggestion[] = fields.map((field, index) => ({
      fieldId: field.id,
      label: field.label,
      action: SuggestionAction.Fill,
      value: values[index],
      confidence: Confidence.High,
      evidence: "Saved profile",
      warning: "",
    }));

    const results = await fillPageFields(suggestions, document);
    expect(results.every((result) => result.status === "filled")).toBe(true);
    expect((document.querySelector("#name") as HTMLInputElement).value).toBe("Shubhojeet Bera");
    expect((document.querySelector("#city") as HTMLSelectElement).value).toBe("blr");
    expect((document.querySelector("#no") as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector("#agree") as HTMLInputElement).checked).toBe(true);
    expect(changes).toEqual(expect.arrayContaining(["name", "city", "no", "agree"]));
  });

  it("does not overwrite suggestions explicitly marked to skip", async () => {
    document.body.innerHTML = `<label for="email">Email</label><input id="email" value="existing@example.com" />`;
    const [field] = collectFields(document);
    const [result] = await fillPageFields(
      [
        {
          fieldId: field.id,
          label: field.label,
          action: SuggestionAction.Skip,
          value: "new@example.com",
          confidence: Confidence.High,
          evidence: "",
          warning: "",
        },
      ],
      document,
    );
    expect(result.status).toBe("skipped");
    expect((document.querySelector("#email") as HTMLInputElement).value).toBe("existing@example.com");
  });
});
