import { PageFieldKind, SuggestionAction } from "./enums";
import type {
  CompanyResearchHints,
  FieldOption,
  FieldSuggestion,
  FillResult,
  PageField,
  PageSnapshot,
  ResumeAttachment,
} from "../types";

const FIELD_ATTRIBUTE = "data-fieldcraft-id";
const SENSITIVE_PATTERN =
  /gender|sex|race|ethnic|disab|veteran|religion|sexual orientation|date of birth|age|marital|pronoun|nationality/i;

const JOB_TEXT_SELECTORS = [
  "[data-automation-id='jobPostingDescription']",
  "[data-testid*='job-description']",
  "[class*='job-description']",
  "[class*='jobDescription']",
  "#job-description",
  "#jobDescriptionText",
  ".posting-page",
  ".job-post",
  "article",
  "main",
];

export function collectPageSnapshot(doc: Document = document): PageSnapshot {
  const fields = collectFields(doc);
  const headings: string[] = [];
  const seenHeadings = new Set<string>();
  for (const node of Array.from(doc.querySelectorAll("h1, h2, h3"))) {
    const text = cleanText(node.textContent ?? "");
    if (!text || seenHeadings.has(text)) continue;
    seenHeadings.add(text);
    headings.push(text);
    if (headings.length >= 24) break;
  }

  return {
    title: cleanText(doc.title),
    url: doc.location?.href ?? "",
    hostname: doc.location?.hostname ?? "",
    ats: detectAts(doc.location?.hostname ?? "", doc),
    headings,
    pageText: extractRelevantPageText(doc),
    fields,
    capturedAt: new Date().toISOString(),
    companyHints: extractCompanyResearchHints(doc),
  };
}

/**
 * Read only explicit organization metadata from the current document. This
 * gives research a reliable identity anchor without sending the whole DOM or
 * guessing from an ATS hostname. Malformed or oversized JSON-LD is ignored.
 */
export function extractCompanyResearchHints(
  doc: Document = document,
): CompanyResearchHints {
  const structuredNames = new Set<string>();
  const metadataNames = new Set<string>();
  const officialDomains = new Set<string>();

  for (const script of Array.from(
    doc.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
  ).slice(0, 20)) {
    const raw = script.textContent?.trim() ?? "";
    if (!raw || raw.length > 100_000) continue;

    try {
      for (const item of findJsonLdObjects(JSON.parse(raw))) {
        if (!isJobPosting(item)) continue;
        const organization = item.hiringOrganization;
        if (!isRecord(organization)) continue;

        const name = cleanCompanyHint(organization.name);
        if (name) structuredNames.add(name);

        // `sameAs` often points to LinkedIn or other third parties. Only the
        // declared organization URL can safely scope an official-site query.
        for (const rawUrl of asStringList(organization.url)) {
          const domain = publicHttpHostname(rawUrl);
          if (domain) officialDomains.add(domain);
        }
      }
    } catch {
      // Third-party job pages often ship malformed JSON-LD. It is optional.
    }
  }

  for (const selector of [
    'meta[property="og:site_name"]',
    'meta[name="application-name"]',
  ]) {
    const name = cleanCompanyHint(
      doc.querySelector<HTMLMetaElement>(selector)?.content ?? "",
    );
    if (name) metadataNames.add(name);
  }

  return {
    structuredNames: [...structuredNames],
    metadataNames: [...metadataNames],
    officialDomains: [...officialDomains],
  };
}

export function collectFields(doc: Document = document): PageField[] {
  const elements = Array.from(
    doc.querySelectorAll<HTMLElement>(
      "input:not([type='hidden']):not([type='submit']):not([type='button']), textarea, select, [contenteditable='true']",
    ),
  ).filter(isUsableField);

  const fields: PageField[] = [];
  const handledRadioNames = new Set<string>();
  const captureId = Date.now().toString(36);

  for (const element of elements) {
    const input = element instanceof HTMLInputElement ? element : null;
    if (input?.type === "radio" && input.name) {
      if (handledRadioNames.has(input.name)) continue;
      handledRadioNames.add(input.name);
      const radios = elements.filter(
        (candidate): candidate is HTMLInputElement =>
          candidate instanceof HTMLInputElement &&
          candidate.type === "radio" &&
          candidate.name === input.name,
      );
      const id = `fc-${captureId}-${fields.length}`;
      radios.forEach((radio) => radio.setAttribute(FIELD_ATTRIBUTE, id));
      const label =
        cleanText(input.closest("fieldset")?.querySelector("legend")?.textContent ?? "") ||
        resolveFieldLabel(input, doc);
      fields.push({
        id,
        kind: "radio",
        type: "radio",
        name: input.name,
        label,
        placeholder: "",
        ariaLabel: input.getAttribute("aria-label") ?? "",
        section: resolveSection(input),
        required: radios.some((radio) => radio.required),
        sensitive: SENSITIVE_PATTERN.test(`${label} ${input.name}`),
        currentValue: radios.find((radio) => radio.checked)?.value ?? "",
        maxLength: null,
        options: radios.map((radio) => ({
          value: radio.value,
          label: resolveOptionLabel(radio, doc),
        })),
      });
      continue;
    }

    const id = `fc-${captureId}-${fields.length}`;
    element.setAttribute(FIELD_ATTRIBUTE, id);
    const label = resolveFieldLabel(element, doc);
    const name = element.getAttribute("name") ?? "";
    const kind = resolveKind(element);
    const type = input?.type ?? kind;
    fields.push({
      id,
      kind,
      type,
      name,
      label,
      placeholder: element.getAttribute("placeholder") ?? "",
      ariaLabel: element.getAttribute("aria-label") ?? "",
      section: resolveSection(element),
      required:
        element.hasAttribute("required") ||
        element.getAttribute("aria-required") === "true",
      sensitive: SENSITIVE_PATTERN.test(
        `${label} ${name} ${element.getAttribute("autocomplete") ?? ""}`,
      ),
      currentValue: getCurrentValue(element),
      maxLength:
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
          ? element.maxLength > 0
            ? element.maxLength
            : null
          : null,
      options: getOptions(element),
    });
  }

  return fields.slice(0, 100);
}

export async function fillPageFields(
  suggestions: FieldSuggestion[],
  doc: Document = document,
  resumeAttachment?: ResumeAttachment,
): Promise<FillResult[]> {
  const results: FillResult[] = [];

  for (const suggestion of suggestions) {
    if (suggestion.action === SuggestionAction.Skip) {
      results.push({
        fieldId: suggestion.fieldId,
        status: "skipped",
        message: "Marked to skip",
      });
      continue;
    }

    const elements = Array.from(
      doc.querySelectorAll<HTMLElement>(
        `[${FIELD_ATTRIBUTE}="${escapeAttribute(suggestion.fieldId)}"]`,
      ),
    );
    if (!elements.length) {
      results.push({
        fieldId: suggestion.fieldId,
        status: "failed",
        message: "Field changed or is no longer on the page",
      });
      continue;
    }

    try {
      const first = elements[0];
      let successMessage = "Filled";
      if (first instanceof HTMLInputElement && first.type === "file") {
        if (!resumeAttachment) {
          throw new Error("No resume file saved in the profile");
        }
        setFileInput(first, resumeAttachment);
      } else if (
        first instanceof HTMLInputElement &&
        first.type === "radio"
      ) {
        const match = findMatchingRadio(
          elements.filter(
            (item): item is HTMLInputElement => item instanceof HTMLInputElement,
          ),
          suggestion.value,
          doc,
        );
        if (!match) throw new Error("No matching radio option found");
        setChecked(match, true);
      } else if (
        first instanceof HTMLInputElement &&
        first.type === "checkbox"
      ) {
        setChecked(first, parseBoolean(suggestion.value));
      } else if (first instanceof HTMLSelectElement) {
        setSelectValue(first, suggestion.value);
      } else if (
        first instanceof HTMLInputElement ||
        first instanceof HTMLTextAreaElement
      ) {
        if (
          first instanceof HTMLInputElement &&
          (first.getAttribute("role") === "combobox" ||
            first.hasAttribute("aria-autocomplete"))
        ) {
          const optionChosen = await setComboboxValue(first, suggestion.value);
          if (!optionChosen) successMessage = "Entered text; confirm the dropdown option";
        } else {
          setTextValue(first, suggestion.value);
        }
      } else if (first.isContentEditable) {
        first.focus();
        first.textContent = suggestion.value;
        emitEvents(first);
      } else {
        throw new Error("Unsupported field control");
      }

      markFilled(first);
      results.push({
        fieldId: suggestion.fieldId,
        status: "filled",
        message: successMessage,
      });
    } catch (error) {
      results.push({
        fieldId: suggestion.fieldId,
        status: "failed",
        message: error instanceof Error ? error.message : "Could not fill field",
      });
    }
  }

  return results;
}

export function extractRelevantPageText(doc: Document = document): string {
  const chunks: string[] = [];

  for (const selector of JOB_TEXT_SELECTORS) {
    for (const node of Array.from(doc.querySelectorAll<HTMLElement>(selector))) {
      if (!isVisible(node)) continue;
      const text = cleanMultiline(node.innerText || node.textContent || "");
      if (text.length > 120) chunks.push(text);
    }
  }

  const formParts: string[] = [];
  for (const form of Array.from(doc.querySelectorAll("form"))) {
    const text = cleanMultiline((form as HTMLElement).innerText || "");
    if (text.length > 40) formParts.push(text);
  }
  if (formParts.length) chunks.push(formParts.join("\n\n"));

  if (!chunks.length && doc.body) {
    chunks.push(cleanMultiline(doc.body.innerText || doc.body.textContent || ""));
  }

  const combined = chunks
    .filter(unique)
    .join("\n\n--- PAGE SECTION ---\n\n");
  return combined.slice(0, 60_000);
}

function findJsonLdObjects(value: unknown): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  const pending: unknown[] = [value];
  const seen = new Set<object>();

  while (pending.length > 0 && found.length < 200) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      pending.push(...current.slice(0, 200));
      continue;
    }
    if (!isRecord(current) || seen.has(current)) continue;
    seen.add(current);
    found.push(current);

    const graph = current["@graph"];
    if (Array.isArray(graph)) pending.push(...graph.slice(0, 200));
  }

  return found;
}

function isJobPosting(value: Record<string, unknown>): boolean {
  return asStringList(value["@type"]).some(
    (type) => type.toLocaleLowerCase() === "jobposting",
  );
}

function asStringList(...values: unknown[]): string[] {
  const strings: string[] = [];
  const pending = [...values];
  while (pending.length > 0) {
    const value = pending.pop();
    if (Array.isArray(value)) {
      pending.push(...value);
    } else if (typeof value === "string") {
      strings.push(value);
    }
  }
  return strings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanCompanyHint(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = cleanText(value).replace(/\s+(?:careers|jobs)$/iu, "");
  if (
    cleaned.length < 2 ||
    cleaned.length > 100 ||
    /^(?:careers|jobs|job application|apply|the company)$/iu.test(cleaned)
  ) {
    return null;
  }
  return cleaned;
}

function publicHttpHostname(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLocaleLowerCase().replace(/^www\./u, "");
    if (
      !/^https?:$/iu.test(url.protocol) ||
      !hostname ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      /^127\./u.test(hostname) ||
      /^10\./u.test(hostname) ||
      /^192\.168\./u.test(hostname)
    ) {
      return null;
    }
    return hostname;
  } catch {
    return null;
  }
}

export const ATS_HOSTNAME_PATTERNS: Array<[RegExp, string]> = [
  [/greenhouse\.io|boards\.greenhouse/i, "Greenhouse"],
  [/lever\.co/i, "Lever"],
  [/ashbyhq/i, "Ashby"],
  [/myworkdayjobs/i, "Workday"],
  [/smartrecruiters/i, "SmartRecruiters"],
  [/jobvite/i, "Jobvite"],
  [/icims/i, "iCIMS"],
  [/bamboohr/i, "BambooHR"],
  [/wellfound|angel\.co/i, "Wellfound"],
  [/linkedin/i, "LinkedIn"],
];

/**
 * Only hard gate for Analyze: can we read this tab as a normal web page?
 * No denylist, no job-URL heuristics — the user chooses when to spend credits.
 */
export function isAnalyzableTabUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** @deprecated Use isAnalyzableTabUrl — kept for older call sites/tests. */
export function isJobRelevantUrl(url: string): boolean {
  return isAnalyzableTabUrl(url);
}

/**
 * Lightweight page sniff for helpers/tests. Not used to block Analyze.
 */
function hasJobRelevantContent(snapshot: PageSnapshot): boolean {
  if (snapshot.ats !== "Generic") return true;
  if (snapshot.fields.length >= 2) return true;
  const text = snapshot.pageText.toLowerCase();
  const hasJobKeywords =
    /\b(job|apply|resume|application|position|hiring|career|candidate|qualification|requirement|responsibilit)\b/.test(
      text,
    );
  return hasJobKeywords && text.length > 300;
}

/** Exposed for unit tests without expanding dead-export surface. */
export const pageHelpers = { hasJobRelevantContent } as const;

export function detectAts(hostname: string, doc: Document = document): string {
  const haystack = `${hostname} ${doc.documentElement.innerHTML.slice(0, 10_000)}`;
  return ATS_HOSTNAME_PATTERNS.find(([pattern]) => pattern.test(haystack))?.[1] ?? "Generic";
}

function resolveKind(element: HTMLElement): PageField["kind"] {
  if (element instanceof HTMLTextAreaElement) return PageFieldKind.Textarea;
  if (element instanceof HTMLSelectElement) return PageFieldKind.Select;
  if (element.isContentEditable) return PageFieldKind.Contenteditable;
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox") return PageFieldKind.Checkbox;
    if (element.type === "file") return PageFieldKind.File;
    return PageFieldKind.Text;
  }
  return PageFieldKind.Text;
}

function getOptions(element: HTMLElement): FieldOption[] {
  if (element instanceof HTMLSelectElement) {
    const options: FieldOption[] = [];
    for (const option of Array.from(element.options)) {
      if (option.disabled) continue;
      options.push({
        value: option.value,
        label: cleanText(option.textContent ?? option.label),
      });
    }
    return options;
  }
  if (element instanceof HTMLInputElement && element.type === "checkbox") {
    return [
      { value: "true", label: "Checked" },
      { value: "false", label: "Unchecked" },
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "y", label: "Y" },
      { value: "n", label: "N" },
      { value: "1", label: "1" },
      { value: "0", label: "0" },
      { value: "checked", label: "checked" },
      { value: "unchecked", label: "unchecked" },
    ];
  }
  return [];
}

function getCurrentValue(element: HTMLElement): string {
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox") return String(element.checked);
    if (element.type === "file") return element.files?.[0]?.name ?? "";
    return element.value;
  }
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)
    return element.value;
  return element.textContent ?? "";
}

function resolveFieldLabel(element: HTMLElement, doc: Document): string {
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) return cleanText(ariaLabel);

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id)?.textContent ?? "")
      .join(" ");
    if (cleanText(text)) return cleanText(text);
  }

  if (element.id) {
    const direct = doc.querySelector<HTMLLabelElement>(
      `label[for="${escapeAttribute(element.id)}"]`,
    );
    if (direct?.textContent) return cleanText(direct.textContent);
  }

  const enclosing = element.closest("label");
  if (enclosing?.textContent) return cleanText(enclosing.textContent);

  const fieldset = element.closest("fieldset");
  const legend = fieldset?.querySelector("legend");
  if (legend?.textContent) return cleanText(legend.textContent);

  const container = element.closest(
    "[data-automation-id*='formField'], .field, .form-field, .application-question, [class*='question']",
  );
  if (container) {
    const candidate = container.querySelector<HTMLElement>(
      "label, legend, [class*='label'], [class*='question'], p",
    );
    const candidateText = cleanText(candidate?.textContent ?? "");
    if (candidateText) return candidateText.slice(0, 240);
  }

  const previous = element.previousElementSibling?.textContent;
  if (previous && cleanText(previous).length < 240) return cleanText(previous);

  return cleanText(
    element.getAttribute("placeholder") ||
      element.getAttribute("name") ||
      element.id ||
      "Unlabelled field",
  );
}

function resolveOptionLabel(input: HTMLInputElement, doc: Document): string {
  if (input.id) {
    const label = doc.querySelector<HTMLLabelElement>(
      `label[for="${escapeAttribute(input.id)}"]`,
    );
    if (label?.textContent) return cleanText(label.textContent);
  }
  return cleanText(input.closest("label")?.textContent ?? input.value);
}

function resolveSection(element: HTMLElement): string {
  const fieldset = element.closest("fieldset");
  const legend = fieldset?.querySelector("legend")?.textContent;
  if (legend) return cleanText(legend);

  let cursor: Element | null = element.parentElement;
  for (let depth = 0; cursor && depth < 5; depth += 1) {
    let sibling = cursor.previousElementSibling;
    while (sibling) {
      if (/^H[1-4]$/.test(sibling.tagName)) {
        return cleanText(sibling.textContent ?? "");
      }
      sibling = sibling.previousElementSibling;
    }
    cursor = cursor.parentElement;
  }
  return "Application";
}

function isUsableField(element: HTMLElement): boolean {
  if (element.hasAttribute("disabled") || element.getAttribute("aria-hidden") === "true")
    return false;
  const input = element instanceof HTMLInputElement ? element : null;
  if (input && ["password", "submit", "button", "reset", "image"].includes(input.type))
    return false;
  return isVisible(element);
}

function isVisible(element: HTMLElement): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style?.display === "none" || style?.visibility === "hidden") return false;
  if (element.getAttribute("hidden") !== null) return false;
  return true;
}

function setTextValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  element.focus();
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  if (!setter) element.value = value;
  emitEvents(element);
}

async function setComboboxValue(
  element: HTMLInputElement,
  value: string,
): Promise<boolean> {
  setTextValue(element, value);
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  const normalized = normalize(value);
  const options = Array.from(
    element.ownerDocument.querySelectorAll<HTMLElement>("[role='option']"),
  ).filter(isVisible);
  const match =
    options.find((option) => normalize(option.textContent ?? "") === normalized) ??
    options.find((option) => normalize(option.textContent ?? "").includes(normalized));
  if (!match) return false;
  match.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  match.click();
  return true;
}

function setChecked(element: HTMLInputElement, checked: boolean): void {
  element.focus();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "checked",
  )?.set;
  setter?.call(element, checked);
  if (!setter) element.checked = checked;
  emitEvents(element);
}

function setSelectValue(element: HTMLSelectElement, requested: string): void {
  const normalized = normalize(requested);
  const options = Array.from(element.options);
  const match =
    options.find((option) => normalize(option.value) === normalized) ??
    options.find((option) => normalize(option.textContent ?? "") === normalized) ??
    options.find(
      (option) =>
        normalize(option.textContent ?? "").includes(normalized) ||
        normalized.includes(normalize(option.textContent ?? "")),
    );
  if (!match) throw new Error(`No matching option for “${requested}”`);
  element.focus();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  setter?.call(element, match.value);
  if (!setter) element.value = match.value;
  emitEvents(element);
}

function setFileInput(
  input: HTMLInputElement,
  attachment: ResumeAttachment,
): void {
  const [meta, encoded] = attachment.dataUrl.split(",", 2);
  if (!encoded || !meta) throw new Error("Saved resume file is invalid");

  // iOS / iPadOS Safari does not allow scripts to programmatically set file inputs.
  // Surface a clear message so the user can upload the resume manually.
  const isIos =
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) &&
    !(window as { MSStream?: unknown }).MSStream;
  if (isIos) {
    throw new Error("Resume upload cannot be automated on iOS / iPadOS Safari. Please attach it manually.");
  }

  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const file = new File([bytes], attachment.name, {
    type: attachment.mimeType || "application/pdf",
  });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  emitEvents(input);
}

function findMatchingRadio(
  radios: HTMLInputElement[],
  requested: string,
  doc: Document,
): HTMLInputElement | undefined {
  const normalized = normalize(requested);
  return (
    radios.find((radio) => normalize(radio.value) === normalized) ??
    radios.find(
      (radio) => normalize(resolveOptionLabel(radio, doc)) === normalized,
    ) ??
    radios.find((radio) =>
      normalize(resolveOptionLabel(radio, doc)).includes(normalized),
    )
  );
}

function emitEvents(element: HTMLElement): void {
  for (const type of ["input", "change", "blur"]) {
    element.dispatchEvent(new Event(type, { bubbles: true }));
  }
}

function markFilled(element: HTMLElement): void {
  const previousOutline = element.style.outline;
  const previousOffset = element.style.outlineOffset;
  element.style.outline = "2px solid #6d5dfc";
  element.style.outlineOffset = "2px";
  window.setTimeout(() => {
    element.style.outline = previousOutline;
    element.style.outlineOffset = previousOffset;
  }, 1800);
}

function parseBoolean(value: string): boolean {
  return /^(true|yes|y|1|checked)$/i.test(value.trim());
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\s*\*+\s*$/, "").trim();
}

function cleanMultiline(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalize(value: string): string {
  return cleanText(value).toLocaleLowerCase();
}

function unique(value: string, index: number, values: string[]): boolean {
  return values.indexOf(value) === index;
}

function escapeAttribute(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
