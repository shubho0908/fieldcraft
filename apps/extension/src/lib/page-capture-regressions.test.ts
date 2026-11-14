import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectFields, collectPageSnapshot, fillPageFields } from "./page";
import { buildDirectSuggestions } from "./direct-fill";
import type { CandidateProfile, FieldSuggestion, PageField } from "../types";

const description = "Responsibilities include designing reliable APIs, operating production services, and working with product partners. Requirements include professional engineering experience and clear communication across teams.";
const suggestion = (field: PageField, value: string): FieldSuggestion => ({
  fieldId: field.id, label: field.label, action: "fill", value,
  confidence: "high", evidence: "Saved profile", warning: "",
});

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("complete composed posting capture", () => {
  it("retains short sibling qualifications and parent-only text without duplication", () => {
    document.body.innerHTML = `<form><div class="job-description"><p>Parent-only eligibility: Canadian citizenship is mandatory.</p><div class="job-description-body">${description}</div></div><section class="job-description">Mandatory qualification: an active medical license.</section><label>Email<input name="email"></label></form>`;
    const snapshot = collectPageSnapshot(document);
    for (const text of [description, "Canadian citizenship is mandatory.", "an active medical license."]) {
      expect(snapshot.jobDescriptionText).toContain(text);
      expect(snapshot.pageText.split(text)).toHaveLength(2);
    }
  });

  it.each(["", 'class="job-description"'])("keeps semantic job headers but excludes site chrome (%s)", (attribute) => {
    document.body.innerHTML = `<header>Site navigation secret</header><main><article><header><h1>Engineer</h1><p>Canadian citizens only; Toronto onsite.</p></header><div ${attribute}>${description}</div></article></main>`;
    const snapshot = collectPageSnapshot(document);
    expect(snapshot.jobDescriptionText).toContain("Canadian citizens only; Toronto onsite.");
    expect(snapshot.headings).toContain("Engineer");
    expect(snapshot.pageText).not.toContain("Site navigation secret");
  });

  it("retains boundaries between table rows and cells", () => {
    document.body.innerHTML = `<div class="job-description"><table><tr><th>Requirements</th><td>Five years of professional engineering experience</td></tr><tr><th>Location</th><td>Canada only; no sponsorship available</td></tr><tr><th>Certification</th><td>An active professional license is mandatory for all applicants.</td></tr></table></div>`;
    const snapshot = collectPageSnapshot(document);
    expect(snapshot.jobDescriptionDetected).toBe(true);
    expect(snapshot.jobDescriptionText).toMatch(/Requirements\s+Five years/);
    expect(snapshot.jobDescriptionText).toMatch(/experience\s+Location\s+Canada/);
  });

  it("accepts explicit non-English descriptions without weakening listing detection", () => {
    document.body.innerHTML = `<main><div class="job-description"><h2>Descripción del puesto</h2><p>Buscamos una persona para diseñar sistemas de pagos confiables y trabajar con el equipo de producto. Debe contar con cinco años de experiencia profesional y disponibilidad para trabajar en nuestra oficina de Madrid.</p></div></main>`;
    expect(collectPageSnapshot(document).jobDescriptionDetected).toBe(true);
    document.body.innerHTML = `<main><h1>Open roles</h1><article><h2>Engineer</h2><p>${description}</p></article><article><h2>Designer</h2><p>${description}</p></article></main>`;
    expect(collectPageSnapshot(document).jobDescriptionDetected).toBe(false);
  });

  it("walks display-contents descendants even when the container has no box", () => {
    document.body.innerHTML = `<main class="job-description" style="display:contents"><p>${description}</p></main>`;
    Object.defineProperty(document.querySelector("main"), "checkVisibility", { configurable: true, value: () => false });
    expect(collectPageSnapshot(document).jobDescriptionText).toBe(description);
  });

  it("keeps separate postings apart instead of merging their descriptions", () => {
    const backend = "Responsibilities include designing reliable payment services and operating production infrastructure. Requirements include five years of professional engineering experience and clear communication across teams.";
    const nursing = "Responsibilities include delivering dependable bedside care and maintaining clinical records. Requirements include an active registered nurse license and three years of acute nursing experience.";
    document.body.innerHTML = `<main><article><h2>Backend Engineer</h2><div class="job-description"><p>${backend}</p></div></article><article><h2>Registered Nurse</h2><div class="job-description"><p>${nursing}</p></div></article></main>`;
    const snapshot = collectPageSnapshot(document);
    expect(snapshot.jobDescriptionDetected).toBe(false);
    expect(snapshot.jobDescriptionText).not.toContain(backend);
    expect(snapshot.jobDescriptionText).not.toContain(nursing);
  });

  it("keeps separate postings apart when the posting itself carries the description class", () => {
    const backend = "Responsibilities include designing reliable payment services and operating production infrastructure. Requirements include five years of professional engineering experience and clear communication across teams.";
    const nursing = "Responsibilities include delivering dependable bedside care and maintaining clinical records. Requirements include an active registered nurse license and three years of acute nursing experience.";
    document.body.innerHTML = `<main><article class="job-description"><h2>Backend Engineer</h2><p>${backend}</p></article><article class="job-description"><h2>Registered Nurse</h2><p>${nursing}</p></article></main>`;
    const snapshot = collectPageSnapshot(document);
    expect(snapshot.jobDescriptionDetected).toBe(false);
    expect(snapshot.jobDescriptionText).not.toContain(backend);
    expect(snapshot.jobDescriptionText).not.toContain(nursing);
  });

  it("keeps separate postings apart without article markup", () => {
    const backend = "Responsibilities include designing reliable payment services and operating production infrastructure. Requirements include five years of professional engineering experience and clear communication across teams.";
    const nursing = "Responsibilities include delivering dependable bedside care and maintaining clinical records. Requirements include an active registered nurse license and three years of acute nursing experience.";
    document.body.innerHTML = `<main><section class="job-card"><h2>Backend Engineer</h2><div class="job-description"><p>${backend}</p></div><a href="/jobs/backend">View job</a></section><section class="job-card"><h2>Registered Nurse</h2><div class="job-description"><p>${nursing}</p></div><a href="/jobs/nurse">View job</a></section></main>`;
    const snapshot = collectPageSnapshot(document);
    expect(snapshot.jobDescriptionDetected).toBe(false);
    expect(snapshot.jobDescriptionText).not.toContain(backend);
    expect(snapshot.jobDescriptionText).not.toContain(nursing);
  });

  it("keeps one posting's sections together when they sit in different wrappers", () => {
    const overview = "Responsibilities include designing reliable payment services and operating production infrastructure. Requirements include professional engineering experience across teams.";
    const qualifications = "Qualifications include five years of experience with distributed systems and clear written communication with product partners.";
    document.body.innerHTML = `<main><section><h2>Overview</h2><div class="job-description"><p>${overview}</p></div></section><section><h2>Qualifications</h2><div class="job-description"><p>${qualifications}</p></div></section></main>`;
    const snapshot = collectPageSnapshot(document);
    expect(snapshot.jobDescriptionDetected).toBe(true);
    expect(snapshot.jobDescriptionText).toContain(overview);
    expect(snapshot.jobDescriptionText).toContain(qualifications);
  });

  it("keeps a split posting together when only one section has an apply link", () => {
    const overview = "Responsibilities include designing reliable payment services and operating production infrastructure. Requirements include professional engineering experience across teams.";
    const qualifications = "Qualifications include five years of experience with distributed systems and clear written communication with product partners.";
    document.body.innerHTML = `<main><section><div class="job-description"><p>${overview}</p></div></section><section><div class="job-description"><p>${qualifications}</p></div><a href="/apply">Apply now</a></section></main>`;
    const snapshot = collectPageSnapshot(document);
    expect(snapshot.jobDescriptionDetected).toBe(true);
    expect(snapshot.jobDescriptionText).toContain(overview);
    expect(snapshot.jobDescriptionText).toContain(qualifications);
  });

  it("keeps a non-English posting split across wrappers without an article", () => {
    const overview = "Buscamos una persona para diseñar sistemas de pagos confiables y trabajar con el equipo de producto durante los próximos años en esta oficina.";
    const qualifications = "La persona debe contar con cinco años de experiencia profesional y disponibilidad para trabajar de forma presencial en nuestra oficina de Madrid.";
    document.body.innerHTML = `<main><section><div class="job-description"><p>${overview}</p></div></section><section><div class="job-description"><p>${qualifications}</p></div></section></main>`;
    const snapshot = collectPageSnapshot(document);
    expect(snapshot.jobDescriptionDetected).toBe(true);
    expect(snapshot.jobDescriptionText).toContain(overview);
    expect(snapshot.jobDescriptionText).toContain(qualifications);
  });

  it("keeps sibling description blocks of a single posting together", () => {
    const overview = "Responsibilities include designing reliable payment services and operating production infrastructure. Requirements include professional engineering experience across teams.";
    const qualifications = "Qualifications include five years of experience with distributed systems and clear written communication with product partners.";
    document.body.innerHTML = `<article><div class="job-description"><p>${overview}</p></div><div class="job-description"><p>${qualifications}</p></div></article>`;
    const snapshot = collectPageSnapshot(document);
    expect(snapshot.jobDescriptionDetected).toBe(true);
    expect(snapshot.jobDescriptionText).toContain(overview);
    expect(snapshot.jobDescriptionText).toContain(qualifications);
  });

  it("reads assigned text once and never reads unused slot fallback or light children", () => {
    document.body.innerHTML = `<career-post class="job-description"><p slot="description">${description}</p><span>Unassigned secret</span></career-post>`;
    document.querySelector("career-post")!.attachShadow({ mode: "open" }).innerHTML = '<slot name="description">Unused fallback secret</slot>';
    const snapshot = collectPageSnapshot(document);
    expect(snapshot.jobDescriptionText).toBe(description);
    expect(snapshot.pageText.split(description)).toHaveLength(2);
    expect(snapshot.pageText).not.toContain("secret");
  });

  it.each(["inert", 'aria-hidden="true"'])("excludes controls beneath an assigned %s slot ancestor", (attribute) => {
    document.body.innerHTML = '<career-form><label>Email<input name="email"></label></career-form>';
    document.querySelector("career-form")!.attachShadow({ mode: "open" }).innerHTML = `<div ${attribute}><slot></slot></div>`;
    expect(collectFields(document)).toEqual([]);
  });

  it("preserves reference ownership across shadow hosts", () => {
    document.body.innerHTML = "<main><h2>References</h2><reference-contact></reference-contact></main>";
    document.querySelector("reference-contact")!.attachShadow({ mode: "open" }).innerHTML = '<form><label>Full name<input name="name"></label><label>Email<input name="email"></label></form>';
    const snapshot = collectPageSnapshot(document);
    expect(snapshot.fields.map((field) => field.section)).toEqual(["References", "References"]);
    expect(buildDirectSuggestions(snapshot, {
      identity: { fullName: "Ada Applicant", email: "ada@applicant.test" },
      canonicalAnswers: [],
    } as unknown as CandidateProfile)).toEqual([]);
  });
});

describe("unambiguous and current choice writes", () => {
  it("rejects overlapping option values and labels for selects and radios", async () => {
    document.body.innerHTML = '<label>Years<select><option value="">Choose</option><option value="1">2</option><option value="2">3</option></select></label><fieldset><legend>Rating</legend><label>2<input type="radio" name="rating" value="1"></label><label>3<input type="radio" name="rating" value="2"></label></fieldset>';
    const fields = collectFields(document);
    expect((await fillPageFields(fields.map((field) => suggestion(field, "2")), document, undefined, new Set(fields.map((field) => field.id)))).map((result) => result.status)).toEqual(["failed", "failed"]);
    expect(document.querySelector("select")!.value).toBe("");
    expect(document.querySelectorAll("input:checked")).toHaveLength(0);
  });

  it("rejects ambiguous controlled combobox options", async () => {
    document.body.innerHTML = '<label>City<input role="combobox" aria-controls="cities"></label><div id="cities" role="listbox"><div role="option" data-value="1">2</div><div role="option" data-value="2">3</div></div>';
    const click = vi.fn();
    document.querySelectorAll("[role=option]").forEach((option) => option.addEventListener("click", click));
    const [field] = collectFields(document);
    expect((await fillPageFields([suggestion(field, "2")], document, undefined, new Set([field.id])))[0].status).toBe("failed");
    expect(click).not.toHaveBeenCalled();
  });

  it.each([false, true])("does not overwrite edits or click options after an intervening edit (match: %s)", async (matching) => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = `<label>City<input role="combobox" aria-controls="cities" value="Previous city"></label><div id="cities" role="listbox">${matching ? '<div role="option">Bengaluru</div>' : ""}</div>`;
      const click = vi.fn();
      document.querySelector("[role=option]")?.addEventListener("click", click);
      const [field] = collectFields(document);
      const pending = fillPageFields([suggestion(field, "Bengaluru")], document, undefined, new Set([field.id]));
      const input = document.querySelector("input")!;
      input.value = "New user input";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(120);
      expect((await pending)[0].status).toBe("failed");
      expect(input.value).toBe("New user input");
      expect(click).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["replace", "hide", "recapture", "change-list"])("does not click a stale combobox option after %s", async (change) => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '<label>City<input role="combobox" aria-controls="cities"></label><div id="cities" role="listbox"><div role="option">Bengaluru</div></div>';
      const click = vi.fn();
      document.querySelector("[role=option]")!.addEventListener("click", click);
      const [field] = collectFields(document);
      const pending = fillPageFields([suggestion(field, "Bengaluru")], document, undefined, new Set([field.id]));
      const input = document.querySelector("input")!;
      if (change === "replace") input.replaceWith(input.cloneNode());
      if (change === "hide") input.hidden = true;
      if (change === "recapture") collectFields(document);
      if (change === "change-list") input.setAttribute("aria-controls", "another-list");
      await vi.advanceTimersByTimeAsync(120);
      expect((await pending)[0].status).toBe("failed");
      expect(click).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not click an option detached by its mousedown handler", async () => {
    document.body.innerHTML = '<label>City<input role="combobox" aria-controls="cities"></label><div id="cities" role="listbox"><div role="option">Bengaluru</div></div>';
    const option = document.querySelector<HTMLElement>("[role=option]")!;
    const click = vi.fn();
    option.addEventListener("click", click);
    option.addEventListener("mousedown", () => option.remove());
    const [field] = collectFields(document);
    expect((await fillPageFields([suggestion(field, "Bengaluru")], document, undefined, new Set([field.id])))[0].status).toBe("failed");
    expect(click).not.toHaveBeenCalled();
  });

  it("clicks an option that commits the value while the pointer goes down", async () => {
    document.body.innerHTML = '<label>City<input role="combobox" aria-controls="cities"></label><div id="cities" role="listbox"><div role="option">Bengaluru</div></div>';
    const input = document.querySelector("input")!;
    const option = document.querySelector<HTMLElement>("[role=option]")!;
    const click = vi.fn();
    option.addEventListener("click", click);
    option.addEventListener("mousedown", () => {
      input.value = "Bengaluru";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const [field] = collectFields(document);
    expect((await fillPageFields([suggestion(field, "Bengaluru")], document, undefined, new Set([field.id])))[0].status).toBe("filled");
    expect(click).toHaveBeenCalledOnce();
  });
});
