import { beforeEach, describe, expect, it, vi } from "vitest";

it("does not turn an unknown checkbox answer into a negative attestation", async () => {
  document.body.innerHTML = '<label>Authorization confirmation<input type="checkbox" checked></label>';
  const field = collectFields(document)[0];
  const results = await fillPageFields([{ fieldId: field.id, label: field.label, action: "review", value: "I do not know", confidence: "high", evidence: "Explicit review", warning: "Confirm" }], document, undefined, new Set([field.id]));
  expect(results[0].status).toBe("failed");
  expect((document.querySelector("input") as HTMLInputElement).checked).toBe(true);
});
import { collectFields, collectPageSnapshot, detectAts, extractRelevantPageText, fillPageFields } from "./page";
import { Confidence, SuggestionAction } from "./enums";
import type { FieldSuggestion, PageField } from "../types";

const description = "Build dependable payment infrastructure for growing businesses. Responsibilities include designing APIs, maintaining reliable distributed systems, and collaborating with product partners. Requirements include experience operating production services and communicating technical tradeoffs clearly.";

function suggestion(field: PageField, value: string, action: FieldSuggestion["action"] = SuggestionAction.Fill): FieldSuggestion {
  return { fieldId: field.id, label: field.label, value, action, confidence: Confidence.High, evidence: "Profile", warning: "" };
}

describe("capture accuracy regressions", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("captures one specific description without ancestors, descendants, chrome, or recommendations", () => {
    document.body.innerHTML = `<main><h1>Engineer</h1><article><div class="job-description"><p>${description}</p><nav>Navigation secret</nav><aside>Other open roles: Data Analyst</aside><div class="recommended-jobs">Recommended role secret</div></div></article><form><label>Email<input name="email"></label></form></main>`;
    const snapshot = collectPageSnapshot(document);
    expect(snapshot.pageText.split(description)).toHaveLength(2);
    expect(snapshot.pageText).not.toMatch(/secret|Data Analyst/);
    expect(snapshot).toMatchObject({ jobDescriptionDetected: true, jobDescriptionSource: "selector:[class*='job-description']", jobDescriptionText: description });
    expect(extractRelevantPageText(document)).toBe(snapshot.pageText);
  });

  it("reserves form context on long job descriptions and marks truncation", () => {
    document.body.innerHTML = `<main><div id="job-description">${description.repeat(300)}</div><form><p>Application instructions: supply a professional email.</p><label>Final question<input name="last" required></label></form></main>`;
    const snapshot = collectPageSnapshot(document);
    expect(snapshot.pageText.length).toBeLessThanOrEqual(60_000);
    expect(snapshot.pageText).toContain("Final question");
    expect(snapshot.pageText).toContain("Application instructions");
    expect(snapshot.pageText).toMatch(/truncated/i);
    expect(snapshot.captureWarnings).toContain("Job description was truncated to fit the capture budget.");
  });

  it("does not repeat a description inside a surrounding form", () => {
    document.body.innerHTML = `<form><div class="job-description">${description}</div><label>Email<input name="email"></label></form>`;
    expect(collectPageSnapshot(document).pageText.split(description)).toHaveLength(2);
  });

  it("keeps all 100 field labels even when early choices exhaust the text budget", () => {
    const fields = Array.from({ length: 100 }, (_, index) => `<label>Application question ${index}<select name="field-${index}"><option value="0">Choose</option>${Array.from({ length: 200 }, (_, option) => `<option value="v${option}">A very long valid choice number ${option}</option>`).join("")}</select></label>`).join("");
    document.body.innerHTML = `<div class="job-description">${description.repeat(300)}</div><form>${fields}</form>`;
    const snapshot = collectPageSnapshot(document);
    expect(snapshot.pageText).toContain("Application question 99");
    expect(snapshot.pageText.length).toBeLessThanOrEqual(60_000);
    expect(snapshot.pageText).toMatch(/truncated/i);
  });

  it("reports omitted fields when a form exceeds the 100-field safety limit", () => {
    document.body.innerHTML = `<form>${Array.from({ length: 101 }, (_, index) => `<label>Question ${index}<input name="field-${index}"></label>`).join("")}</form>`;
    const snapshot = collectPageSnapshot(document);
    expect(snapshot.fields).toHaveLength(100);
    expect(snapshot.captureWarnings).toContain("Only the first 100 usable fields were captured; additional fields were omitted.");
    expect(collectPageSnapshot(document).captureWarnings).toEqual(snapshot.captureWarnings);
  });

  it("does not mistake an application form for a job description", () => {
    document.body.innerHTML = `<main><h1>Apply to Engineer</h1><form><p>${"Tell us about your experience. ".repeat(20)}</p><label>Full name<input></label></form></main>`;
    const snapshot = collectPageSnapshot(document);
    expect(snapshot).toMatchObject({ jobDescriptionDetected: false, jobDescriptionText: "" });
    expect(snapshot.jobDescriptionSource).toBeUndefined();
    expect(snapshot.pageText).toContain("Full name");
  });

  it("uses an explicit structured JobPosting description when the page has only the application", () => {
    document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", description: `<p>${description}</p>` })}</script>`;
    document.body.innerHTML = `<form><label>Email<input></label></form>`;
    expect(collectPageSnapshot(document)).toMatchObject({ jobDescriptionDetected: true, jobDescriptionText: description, jobDescriptionSource: "structured:JobPosting.description" });
  });

  it.each([
    ["display:none", ""], ["visibility:hidden", ""], ["opacity:0", ""],
    ["position:absolute;left:-9999px", ""], ["width:0;height:0;overflow:hidden", ""],
    ["clip:rect(0px,0px,0px,0px);position:absolute", ""], ["clip-path:inset(50%)", ""],
    ["", "hidden"], ["", "inert"], ["", 'aria-hidden="true"'],
  ])("excludes fields and text under hidden ancestor %s %s", (style, attribute) => {
    document.body.innerHTML = `<main><div class="job-description">${description}<section style="${style}" ${attribute}><label>Secret honeypot<input name="trap"></label><p>Invisible text secret</p></section></div><label>Visible email<input name="email"></label></main>`;
    expect(collectFields(document).map((field) => field.name)).toEqual(["email"]);
    expect(collectPageSnapshot(document).pageText).not.toContain("secret");
  });

  it("uses available geometry but not jsdom's missing layout", () => {
    document.body.innerHTML = `<label>Visible<input name="visible"></label><label>Offscreen<input name="offscreen"></label><label>Zero<input name="zero"></label>`;
    const rect = (x: number, y: number, width: number, height: number) => ({ x, y, left: x, top: y, width, height, right: x + width, bottom: y + height, toJSON() {} });
    vi.spyOn(document.documentElement, "getBoundingClientRect").mockReturnValue(rect(0, 0, 1000, 1000));
    vi.spyOn(document.querySelector('[name="visible"]')!, "getBoundingClientRect").mockReturnValue(rect(10, 1000, 100, 30));
    vi.spyOn(document.querySelector('[name="offscreen"]')!, "getBoundingClientRect").mockReturnValue(rect(-9999, 0, 100, 30));
    vi.spyOn(document.querySelector('[name="zero"]')!, "getBoundingClientRect").mockReturnValue(rect(0, 0, 0, 0));
    expect(collectFields(document).map((field) => field.name)).toEqual(["visible"]);
  });

  it("cleans wrapped labels without swallowing option text and retains required signals", () => {
    document.body.innerHTML = `<form><label>Country *<select name="country"><option value="0">-- choose --</option><option value="in">India</option><option value="us">United States</option></select></label><label for="first">First name *</label><input id="first"><div class="required"><label for="last">Last name</label><input id="last"></div><label>${"Long label ".repeat(100)}<input name="long"></label><label>Opt in<input type="radio" value="yes"></label></form>`;
    const fields = collectFields(document);
    expect(fields[0]).toMatchObject({ label: "Country", required: true, currentValue: "", options: [{ value: "in", label: "India" }, { value: "us", label: "United States" }] });
    expect(fields[1]).toMatchObject({ label: "First name", required: true });
    expect(fields[2].required).toBe(true);
    expect(fields[3].label).toHaveLength(240);
    expect(fields[4].kind).toBe("radio");
  });

  it("keeps same-name radio groups scoped to their form and shadow root", () => {
    document.body.innerHTML = `<form><fieldset><legend>First group *</legend><label>Yes<input type="radio" name="answer" value="yes"></label></fieldset></form><form><fieldset><legend>Second group</legend><label>No<input type="radio" name="answer" value="no"></label></fieldset></form>`;
    expect(collectFields(document).map(({ label, options, required }) => ({ label, options, required }))).toEqual([
      { label: "First group", options: [{ value: "yes", label: "Yes" }], required: true },
      { label: "Second group", options: [{ value: "no", label: "No" }], required: false },
    ]);
  });

  it("preserves meaningful zero-valued select options through capture and fill", async () => {
    document.body.innerHTML = `<label>Answer<select><option value="1">Yes</option><option value="0">No</option><option value="-1">Not applicable</option></select></label>`;
    const [field] = collectFields(document);
    expect(field.options).toHaveLength(3);
    const [result] = await fillPageFields([suggestion(field, "No")], document, undefined, new Set([field.id]));
    expect(result.status).toBe("filled");
    expect(collectPageSnapshot(document).fields[0].currentValue).toBe("0");
  });

  it("assigns unique capture IDs even when captures happen in the same millisecond", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    document.body.innerHTML = `<label>Email<input></label>`;
    expect(collectFields(document)[0].id).not.toBe(collectFields(document)[0].id);
  });

  it.each([
    ["Languages spoken", false], ["Personal homepage", false], ["Message to the hiring manager", false], ["Desired wage", false],
    ["Gender identity", true], ["Sex", true], ["Race or ethnicity", true], ["Are you Hispanic or Latino?", true],
    ["Latina / Latinx identity", true], ["Disability status", true], ["Veteran status", true], ["Religion", true],
    ["Sexual orientation", true], ["LGBTQ+", true], ["Transgender", true], ["Pronouns", true],
    ["Date of birth", true], ["Age", true], ["How old are you?", true], ["Are you 18 years or older?", true],
    ["Marital status", true], ["Nationality", true],
  ])("classifies sensitive field %s as %s", (label, sensitive) => {
    document.body.innerHTML = `<label>${label}<input></label>`;
    expect(collectFields(document)[0].sensitive).toBe(sensitive);
    expect(collectPageSnapshot(document).fields[0].sensitive).toBe(sensitive);
  });

  it("does not infer ATS from a footer link or a lookalike hostname", () => {
    document.body.innerHTML = `<main><h1>Careers</h1></main><footer><a href="https://linkedin.com/company/acme">LinkedIn</a></footer>`;
    expect(detectAts("careers.acme.example", document)).toBe("Generic");
    expect(detectAts("linkedin.evil.example", document)).toBe("Generic");
    document.body.innerHTML += `<iframe src="https://boards.greenhouse.io/embed/job_app?for=acme&token=123"></iframe>`;
    expect(detectAts("careers.acme.example", document)).toBe("Greenhouse");
  });

  it("traverses open shadow roots for fields, local labels, description, and filling", async () => {
    document.body.innerHTML = `<label id="local">Wrong document label</label><career-form></career-form>`;
    const root = document.querySelector("career-form")!.attachShadow({ mode: "open" });
    root.innerHTML = `<article class="job-description">${description}</article><label id="local">Your email *</label><input aria-labelledby="local" name="email"><hidden-fields hidden></hidden-fields>`;
    root.querySelector("hidden-fields")!.attachShadow({ mode: "open" }).innerHTML = `<label>Secret<input name="secret"></label>`;
    const snapshot = collectPageSnapshot(document);
    expect(snapshot.fields).toHaveLength(1);
    expect(snapshot.fields[0]).toMatchObject({ label: "Your email", required: true });
    expect(snapshot.jobDescriptionText).toBe(description);
    const result = await fillPageFields([suggestion(snapshot.fields[0], "ada@example.test")], document, undefined, new Set([snapshot.fields[0].id]));
    expect(result[0].status).toBe("filled");
    expect(root.querySelector("input")!.value).toBe("ada@example.test");
  });
});

describe("explicit and exact filling", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("requires explicit selected IDs and allows selected review items only", async () => {
    document.body.innerHTML = `<label>Full name<input id="name"></label><label>Email<input id="email"></label>`;
    const fields = collectFields(document);
    const suggestions = [suggestion(fields[0], "Ada"), suggestion(fields[1], "ada@example.test", SuggestionAction.Review)];
    expect((await fillPageFields(suggestions, document)).map((result) => result.status)).toEqual(["skipped", "skipped"]);
    expect(document.querySelector<HTMLInputElement>("#name")!.value).toBe("");
    const results = await fillPageFields(suggestions, document, undefined, new Set([fields[1].id]));
    expect(results.map((result) => result.status)).toEqual(["skipped", "filled"]);
    expect(document.querySelector<HTMLInputElement>("#email")!.value).toBe("ada@example.test");
  });

  it.each(["I don't know", "", "United", "No thanks"])("does not guess select/radio choice for %s", async (value) => {
    document.body.innerHTML = `<label>Answer<select><option value="0">-- choose --</option><option value="no">No</option><option value="us">United States</option><option value="empty"></option></select></label><fieldset><legend>Another answer</legend><label>No<input type="radio" name="answer" value="no"></label></fieldset>`;
    const fields = collectFields(document);
    const results = await fillPageFields(fields.map((field) => suggestion(field, value)), document, undefined, new Set(fields.map((field) => field.id)));
    expect(results.map((result) => result.status)).toEqual(["failed", "failed"]);
    expect(document.querySelector("select")!.value).toBe("0");
    expect(document.querySelector("input")!.checked).toBe(false);
  });

  it.each(["aria-controls", "aria-owns"])("scopes combobox options using %s and requires exact matches", async (attribute) => {
    document.body.innerHTML = `<label>Location<input role="combobox" ${attribute}="cities"></label><div role="listbox" id="other"><div role="option">India</div></div><div role="listbox" id="cities"><div role="option">Indiana</div><div role="option">India</div></div>`;
    const options = Array.from(document.querySelectorAll<HTMLElement>("[role=option]"));
    const clicks = options.map(() => vi.fn());
    options.forEach((option, index) => option.addEventListener("click", clicks[index]));
    const [field] = collectFields(document);
    const [result] = await fillPageFields([suggestion(field, "India")], document, undefined, new Set([field.id]));
    expect(result.status).toBe("filled");
    expect(clicks.map((click) => click.mock.calls.length)).toEqual([0, 0, 1]);
  });

  it("reports failure instead of claiming an unrecognized combobox choice was filled", async () => {
    document.body.innerHTML = `<label>City<input role="combobox" aria-controls="cities"></label><div role="listbox" id="cities"><div role="option">Indiana</div></div>`;
    const [field] = collectFields(document);
    const [result] = await fillPageFields([suggestion(field, "India")], document, undefined, new Set([field.id]));
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/exact|matching/i);
    expect(document.querySelector("input")!.value).toBe("");
  });

  it("refuses a captured field that becomes hidden or disabled before filling", async () => {
    document.body.innerHTML = `<label>Email<input></label>`;
    const [field] = collectFields(document);
    document.querySelector("label")!.hidden = true;
    const [result] = await fillPageFields([suggestion(field, "ada@example.test")], document, undefined, new Set([field.id]));
    expect(result.status).toBe("failed");
    expect(document.querySelector("input")!.value).toBe("");
  });
});
