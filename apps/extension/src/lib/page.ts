import { PageFieldKind, SuggestionAction } from "./enums";
import { isPlaceholderOption, normalizeChoice } from "./fields";
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
const FIELD_SELECTOR = "input:not([type='hidden']):not([type='submit']):not([type='button']), textarea, select, [contenteditable='true']";
const SENSITIVE_PATTERN =
  /\b(?:gender|sex|race|racial|ethnicity|ethnic|hispanic|latino|latina|latinx|disability|disabilities|disabled|veterans?|religion|religious|sexual orientation|lgbtq\w*|transgender|pronouns?|date of birth|birth\s?date|age|how old|18(?: years)? (?:of age )?or older|marital(?: status)?|nationality)\b/iu;

const JOB_TEXT_SELECTORS = [
  "[data-automation-id='jobPostingDescription']",
  "[data-testid*='job-description']",
  "[class*='job-description']",
  "[class*='jobDescription']",
  "#job-description",
  "#jobDescriptionText",
  ".posting-description",
  ".jobs-description__content",
  ".posting-page",
  ".job-post",
  "article",
  "main",
];

type CapturedSnapshot = PageSnapshot & {
  jobDescriptionDetected: boolean;
  jobDescriptionSource?: string;
  jobDescriptionText: string;
  captureWarnings: string[];
};

export function collectPageSnapshot(doc: Document = document): CapturedSnapshot {
  const fields = collectFields(doc);
  const context = capturePageContext(doc, fields);
  if (fields.length === 100) {
    const capturedIds = new Set(fields.map((field) => field.id));
    if (queryAll<HTMLElement>(doc, FIELD_SELECTOR).some((element) => isUsableField(element) && !capturedIds.has(element.getAttribute(FIELD_ATTRIBUTE) ?? ""))) {
      context.captureWarnings.push("Only the first 100 usable fields were captured; additional fields were omitted.");
    }
  }
  const headings: string[] = [];
  const seenHeadings = new Set<string>();
  for (const node of queryAll<HTMLElement>(doc, "h1, h2, h3")) {
    if (!isVisible(node) || isExcludedText(node)) continue;
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
    ...context,
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
  const elements = queryAll<HTMLElement>(doc, FIELD_SELECTOR).filter(isUsableField);

  const fields: PageField[] = [];
  const handledRadios = new Set<HTMLInputElement>();
  const random = doc.defaultView?.crypto ?? crypto;
  const captureId = random.randomUUID?.() ?? Array.from(random.getRandomValues(new Uint32Array(4)), (part) => part.toString(36)).join("-");

  for (const element of elements) {
    if (fields.length >= 100) break;
    const input = isInput(element) ? element : null;
    if (input?.type === "radio") {
      if (handledRadios.has(input)) continue;
      const radios = elements.filter(
        (candidate): candidate is HTMLInputElement =>
          isInput(candidate) &&
          candidate.type === "radio" &&
          (input.name ? candidate.name === input.name && candidate.form === input.form && candidate.getRootNode() === input.getRootNode() : candidate === input),
      );
      const id = `fc-${captureId}-${fields.length}`;
      radios.forEach((radio) => {
        handledRadios.add(radio);
        radio.setAttribute(FIELD_ATTRIBUTE, id);
      });
      const label =
        cleanText(labelText(input.closest("fieldset")?.querySelector("legend") ?? null)).slice(0, 240) ||
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
        required: radios.some(isRequiredField),
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
      required: isRequiredField(element),
      sensitive: SENSITIVE_PATTERN.test(
        `${label} ${name} ${element.getAttribute("autocomplete") ?? ""}`,
      ),
      currentValue: getCurrentValue(element),
      maxLength:
        isInput(element) || isTextarea(element)
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
  selectedFieldIds?: ReadonlySet<string>,
): Promise<FillResult[]> {
  const results: FillResult[] = [];

  for (const suggestion of suggestions) {
    if (!selectedFieldIds?.has(suggestion.fieldId) || suggestion.action === SuggestionAction.Skip) {
      results.push({
        fieldId: suggestion.fieldId,
        status: "skipped",
        message: suggestion.action === SuggestionAction.Skip ? "Marked to skip" : "Not explicitly selected",
      });
      continue;
    }

    const elements = queryAll<HTMLElement>(doc,
      `[${FIELD_ATTRIBUTE}="${escapeAttribute(suggestion.fieldId)}"]`,
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
      if (!elements.every(isUsableField)) throw new Error("Field is hidden, disabled, or no longer usable");
      const successMessage = "Filled";
      if (isInput(first) && first.type === "file") {
        if (!resumeAttachment) {
          throw new Error("No resume file saved in the profile");
        }
        setFileInput(first, resumeAttachment);
      } else if (
        isInput(first) &&
        first.type === "radio"
      ) {
        const match = findMatchingRadio(
          elements.filter(
            (item): item is HTMLInputElement => isInput(item),
          ),
          suggestion.value,
          doc,
        );
        if (!match) throw new Error("No matching radio option found");
        setChecked(match, true);
      } else if (
        isInput(first) &&
        first.type === "checkbox"
      ) {
        setChecked(first, parseBoolean(suggestion.value));
      } else if (isSelect(first)) {
        setSelectValue(first, suggestion.value);
      } else if (
        isInput(first) || isTextarea(first)
      ) {
        if (
          isInput(first) &&
          (first.getAttribute("role") === "combobox" ||
            first.hasAttribute("aria-autocomplete"))
        ) {
          await setComboboxValue(first, suggestion.value);
        } else {
          setTextValue(first, suggestion.value);
        }
      } else if (first.isContentEditable || first.getAttribute("contenteditable") === "true") {
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
  return capturePageContext(doc, collectFields(doc)).pageText;
}

function capturePageContext(doc: Document, fields: PageField[]) {
  let description = "";
  let source: string | undefined;
  let descriptionNode: HTMLElement | undefined;
  for (const selector of JOB_TEXT_SELECTORS) {
    const candidates = queryAll<HTMLElement>(doc, selector)
      .filter((node) => isVisible(node) && !isExcludedText(node))
      .map((node) => ({ node, text: visibleText(node, true) }))
      .filter(({ text }) => text.length > 120 && /\b(?:responsibilities|requirements|qualifications|about (?:the|this) role|what you(?:'|’)ll do|experience|we(?:'|’)re hiring)\b/iu.test(text));
    const candidate = candidates.find(({ node }) => !candidates.some((other) => other.node !== node && node.contains(other.node)));
    if (!candidate) continue;
    description = candidate.text;
    descriptionNode = candidate.node;
    source = `selector:${selector}`;
    break;
  }

  if (!description) {
    for (const script of queryAll<HTMLScriptElement>(doc, 'script[type="application/ld+json"]').slice(0, 20)) {
      if (!script.textContent || script.textContent.length > 100_000) continue;
      try {
        const posting = findJsonLdObjects(JSON.parse(script.textContent)).find((item) => isJobPosting(item) && typeof item.description === "string");
        if (!posting) continue;
        const template = doc.createElement("template");
        template.innerHTML = posting.description as string;
        const text = visibleText(template.content, true, false);
        if (text.length <= 120) continue;
        description = text;
        source = "structured:JobPosting.description";
        break;
      } catch {}
    }
  }

  const fieldText = fields.map((field) => `${field.label}${field.required ? " (required)" : ""} [${field.kind}]`).join("\n");
  const optionText = fields.filter((field) => field.options.length).map((field) => `${field.label}: ${field.options.map((option) => option.label).join(" | ")}`).join("\n");
  const formText = queryAll<HTMLElement>(doc, "form").filter((form) => isVisible(form)).map((form) => visibleText(form, false, true, descriptionNode)).filter(Boolean).join("\n\n");
  const formContext = fieldText || formText ? `Application fields:\n${fieldText}\n\nField choices:\n${truncateText(optionText, 6_000, "Field choices")}\n\nApplication instructions:\n${truncateText(formText, 6_000, "Form instructions")}` : "";
  const jobDescriptionText = truncateText(description, 60_000 - formContext.length - 100, "Job description");
  const fallback = !description && doc.body ? truncateText(visibleText(doc.body, true), 60_000 - formContext.length - 100, "Page context") : "";
  const captureWarnings: string[] = [];
  if (jobDescriptionText.length < description.length) captureWarnings.push("Job description was truncated to fit the capture budget.");
  if (optionText.length > 6_000) captureWarnings.push("Field choice text was truncated; captured field options remain available separately.");
  if (formText.length > 6_000) captureWarnings.push("Application instructions were truncated to fit the capture budget.");
  if (fallback.includes("[Page context truncated")) captureWarnings.push("Page context was truncated to fit the capture budget.");
  return {
    pageText: [jobDescriptionText || fallback, formContext].filter(Boolean).join("\n\n--- APPLICATION CONTEXT ---\n\n"),
    jobDescriptionDetected: Boolean(description),
    jobDescriptionSource: source,
    jobDescriptionText,
    captureWarnings,
  };
}

function truncateText(text: string, budget: number, label: string): string {
  if (text.length <= budget) return text;
  const notice = `\n[${label} truncated to fit capture budget]`;
  return text.slice(0, Math.max(0, budget - notice.length)) + notice;
}

function queryAll<T extends Element>(root: Document | ShadowRoot, selector: string): T[] {
  const found: T[] = [];
  for (const node of Array.from(root.querySelectorAll("*"))) {
    if (node.matches(selector)) found.push(node as T);
    if (node.shadowRoot) found.push(...queryAll<T>(node.shadowRoot, selector));
  }
  return found;
}

function composedParent(element: Element): Element | null {
  return element.parentElement ?? (element.getRootNode() as ShadowRoot).host ?? null;
}

function isExcludedText(element: Element): boolean {
  for (let node: Element | null = element; node; node = composedParent(node)) {
    if (node.matches("nav, aside, header, footer, [role='navigation'], [role='complementary'], .recommended-jobs, .related-jobs, .other-jobs, .job-listings, [class*='recommended-job'], [class*='related-job'], [data-testid*='recommended'], [data-testid*='related-job']")) return true;
  }
  return false;
}

function visibleText(root: Node, excludeForms = false, rendered = true, excludedNode?: Node): string {
  const walk = (node: Node): string => {
    if (node === excludedNode) return "";
    if (node.nodeType === 3) return node.textContent ?? "";
    if (node.nodeType === 1) {
      const element = node as HTMLElement;
      if (element.matches("script, style, template, noscript, svg, input, textarea, select, button") || (excludeForms && element.matches("form")) || isExcludedText(element) || !isVisible(element, rendered)) return "";
      const content = Array.from((element.shadowRoot ?? element).childNodes).map(walk).join("");
      if (/^H[1-6]$/.test(element.tagName)) return `\n${content}`;
      return /^(?:P|DIV|SECTION|ARTICLE|MAIN|LI|UL|OL|BR|LABEL|FIELDSET|LEGEND|FORM)$/.test(element.tagName) ? `\n${content}\n` : content;
    }
    return Array.from(node.childNodes).map(walk).join("");
  };
  return cleanMultiline(walk(root));
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
  [/(?:^|\.)greenhouse\.(?:io|com)$/i, "Greenhouse"],
  [/(?:^|\.)lever\.co$/i, "Lever"],
  [/(?:^|\.)ashbyhq\.com$/i, "Ashby"],
  [/(?:^|\.)myworkdayjobs\.com$/i, "Workday"],
  [/(?:^|\.)smartrecruiters\.com$/i, "SmartRecruiters"],
  [/(?:^|\.)jobvite\.com$/i, "Jobvite"],
  [/(?:^|\.)icims\.com$/i, "iCIMS"],
  [/(?:^|\.)bamboohr\.com$/i, "BambooHR"],
  [/(?:^|\.)(?:wellfound\.com|angel\.co)$/i, "Wellfound"],
  [/(?:^|\.)linkedin\.com$/i, "LinkedIn"],
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
  const hosted = ATS_HOSTNAME_PATTERNS.find(([pattern]) => pattern.test(hostname));
  if (hosted) return hosted[1];
  for (const node of queryAll<HTMLElement>(doc, "iframe[src], form[action], script[src]")) {
    const raw = node.getAttribute("src") ?? node.getAttribute("action");
    if (!raw) continue;
    try {
      const url = new URL(raw, doc.location?.href ?? "https://example.invalid");
      if (!/^https?:$/.test(url.protocol)) continue;
      const match = ATS_HOSTNAME_PATTERNS.find(([pattern]) => pattern.test(url.hostname));
      if (match) return match[1];
    } catch {}
  }
  if (doc.querySelector("[data-automation-id='jobPostingDescription'], [data-automation-id='applyFlow']")) return "Workday";
  return "Generic";
}

function resolveKind(element: HTMLElement): PageField["kind"] {
  if (isTextarea(element)) return PageFieldKind.Textarea;
  if (isSelect(element)) return PageFieldKind.Select;
  if (element.isContentEditable || element.getAttribute("contenteditable") === "true") return PageFieldKind.Contenteditable;
  if (isInput(element)) {
    if (element.type === "checkbox") return PageFieldKind.Checkbox;
    if (element.type === "radio") return PageFieldKind.Radio;
    if (element.type === "file") return PageFieldKind.File;
    return PageFieldKind.Text;
  }
  return PageFieldKind.Text;
}

function getOptions(element: HTMLElement): FieldOption[] {
  if (isSelect(element)) {
    const options: FieldOption[] = [];
    for (const [index, option] of Array.from(element.options).entries()) {
      if (option.disabled || option.hidden || option.parentElement?.matches("optgroup:disabled") || isPlaceholderOption(option, index)) continue;
      options.push({
        value: option.value,
        label: cleanText(option.textContent ?? option.label),
      });
    }
    return options;
  }
  if (isInput(element) && element.type === "checkbox") {
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
  if (isInput(element)) {
    if (element.type === "checkbox") return String(element.checked);
    if (element.type === "file") return element.files?.[0]?.name ?? "";
    return element.value;
  }
  if (isSelect(element)) {
    const option = element.selectedOptions[0];
    return !option || isPlaceholderOption(option, option.index) ? "" : element.value;
  }
  if (isTextarea(element)) return element.value;
  return element.textContent ?? "";
}

function labelText(element: Element | null): string {
  if (!element) return "";
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll("input, textarea, select, button, [contenteditable], script, style, svg").forEach((node) => node.remove());
  return clone.textContent ?? "";
}

function labelScope(element: Element): Document | ShadowRoot {
  const root = element.getRootNode();
  return root.nodeType === 9 || (root.nodeType === 11 && "host" in root) ? root as Document | ShadowRoot : element.ownerDocument;
}

function rawFieldLabel(element: HTMLElement): string {
  const scope = labelScope(element);
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel;

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => labelText(scope.getElementById(id)))
      .join(" ");
    if (cleanText(text)) return text;
  }

  if (element.id) {
    const direct = scope.querySelector<HTMLLabelElement>(
      `label[for="${escapeAttribute(element.id)}"]`,
    );
    if (labelText(direct)) return labelText(direct);
  }

  const enclosing = element.closest("label");
  if (labelText(enclosing)) return labelText(enclosing);

  const fieldset = element.closest("fieldset");
  const legend = fieldset?.querySelector("legend");
  if (labelText(legend ?? null)) return labelText(legend ?? null);

  const container = element.closest(
    "[data-automation-id*='formField'], .field, .form-field, .application-question, [class*='question']",
  );
  if (container) {
    const candidate = container.querySelector<HTMLElement>(
      "label, legend, [class*='label'], [class*='question'], p",
    );
    const candidateText = labelText(candidate);
    if (cleanText(candidateText)) return candidateText;
  }

  const previous = labelText(element.previousElementSibling);
  if (previous) return previous;

  return (
    element.getAttribute("placeholder") ||
      element.getAttribute("name") ||
      element.id ||
      "Unlabelled field"
  );
}

function resolveFieldLabel(element: HTMLElement, _doc: Document): string {
  return cleanText(rawFieldLabel(element)).slice(0, 240);
}

function isRequiredField(element: HTMLElement): boolean {
  if (element.matches(":required, [required], [aria-required='true']")) return true;
  if (element.closest(".required, .is-required, [data-required='true']")) return true;
  const label = rawFieldLabel(element);
  const legend = labelText(element.closest("fieldset")?.querySelector("legend") ?? null);
  return /\*|\(\s*required\s*\)/iu.test(`${label} ${legend}`);
}

function resolveOptionLabel(input: HTMLInputElement, doc: Document): string {
  if (input.hasAttribute("aria-label") || input.hasAttribute("aria-labelledby")) return resolveFieldLabel(input, doc);
  if (input.id) {
    const label = labelScope(input).querySelector<HTMLLabelElement>(
      `label[for="${escapeAttribute(input.id)}"]`,
    );
    if (labelText(label)) return cleanText(labelText(label)).slice(0, 240);
  }
  return cleanText(labelText(input.closest("label")) || input.value).slice(0, 240);
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
  if (isExcludedText(element)) return false;
  if (element.matches(":disabled, [disabled], [readonly], [aria-disabled='true']"))
    return false;
  const input = isInput(element) ? element : null;
  if (input && ["hidden", "password", "submit", "button", "reset", "image"].includes(input.type))
    return false;
  return isVisible(element);
}

function isVisible(element: HTMLElement, rendered = true): boolean {
  const view = element.ownerDocument.defaultView;
  for (let node: Element | null = element; node; node = composedParent(node)) {
    if (node.matches("[hidden], [inert], [aria-hidden='true']")) return false;
    const style = view?.getComputedStyle(node) ?? (node as HTMLElement).style;
    if (!style) continue;
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.contentVisibility === "hidden" || style.opacity === "0") return false;
    if (/^(?:absolute|fixed)$/.test(style.position) && [style.left, style.top].some((value) => /^-\d/.test(value) && parseFloat(value) < -1000)) return false;
    if (/rect\(\s*0(?:px)?[ ,]+0(?:px)?[ ,]+0(?:px)?[ ,]+0(?:px)?\s*\)/i.test(style.clip) || /inset\(\s*50%\s*\)/i.test(style.clipPath)) return false;
    if (/(?:hidden|clip)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`) && ((style.width === "0px" && style.height === "0px") || (parseFloat(style.width) <= 1 && parseFloat(style.height) <= 1))) return false;
  }
  if (!rendered) return true;
  if (typeof element.checkVisibility === "function" && !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
  const documentRect = element.ownerDocument.documentElement.getBoundingClientRect();
  if (documentRect.width > 0 || documentRect.height > 0) {
    const rect = element.getBoundingClientRect();
    const display = view?.getComputedStyle(element).display;
    if (display !== "contents" && (rect.width <= 0 || rect.height <= 0)) return false;
    const scrollX = view?.scrollX ?? 0;
    const scrollY = view?.scrollY ?? 0;
    if (rect.right + scrollX <= 0 || rect.bottom + scrollY <= 0) return false;
    for (let parent = composedParent(element); parent; parent = composedParent(parent)) {
      const style = view?.getComputedStyle(parent);
      if (!style || !/(?:hidden|clip|scroll|auto)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)) continue;
      const bounds = parent.getBoundingClientRect();
      if (rect.right <= bounds.left || rect.left >= bounds.right || rect.bottom <= bounds.top || rect.top >= bounds.bottom || bounds.width <= 1 || bounds.height <= 1) return false;
    }
  }
  return true;
}

function isInput(element: Element): element is HTMLInputElement {
  return element.tagName === "INPUT";
}

function isTextarea(element: Element): element is HTMLTextAreaElement {
  return element.tagName === "TEXTAREA";
}

function isSelect(element: Element): element is HTMLSelectElement {
  return element.tagName === "SELECT";
}

function setTextValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  element.focus();
  const view = element.ownerDocument.defaultView;
  const prototype =
    isTextarea(element)
      ? (view?.HTMLTextAreaElement ?? HTMLTextAreaElement).prototype
      : (view?.HTMLInputElement ?? HTMLInputElement).prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  if (!setter) element.value = value;
  emitEvents(element);
}

async function setComboboxValue(
  element: HTMLInputElement,
  value: string,
): Promise<void> {
  const previous = element.value;
  setTextValue(element, value);
  await new Promise((resolve) => (element.ownerDocument.defaultView ?? window).setTimeout(resolve, 120));
  const normalized = normalizeChoice(value);
  const scope = labelScope(element);
  const listIds = `${element.getAttribute("aria-controls") ?? ""} ${element.getAttribute("aria-owns") ?? ""}`.trim().split(/\s+/).filter(Boolean);
  const options = listIds.flatMap((id) => {
    const list = scope.getElementById(id);
    return list?.getAttribute("role") === "listbox" ? Array.from(list.querySelectorAll<HTMLElement>("[role='option']")) : [];
  }).filter((option) => isVisible(option) && option.getAttribute("aria-disabled") !== "true");
  const match = normalized ? options.find((option) => [option.getAttribute("data-value") ?? "", option.getAttribute("aria-label") ?? "", option.textContent ?? ""].map(normalizeChoice).filter(Boolean).includes(normalized)) : undefined;
  if (!match) {
    setTextValue(element, previous);
    throw new Error(`No exact matching option in the controlled listbox for “${value}”`);
  }
  const MouseEventType = element.ownerDocument.defaultView?.MouseEvent ?? MouseEvent;
  match.dispatchEvent(new MouseEventType("mousedown", { bubbles: true, composed: true }));
  match.click();
}

function setChecked(element: HTMLInputElement, checked: boolean): void {
  element.focus();
  const setter = Object.getOwnPropertyDescriptor(
    (element.ownerDocument.defaultView?.HTMLInputElement ?? HTMLInputElement).prototype,
    "checked",
  )?.set;
  setter?.call(element, checked);
  if (!setter) element.checked = checked;
  emitEvents(element);
}

function setSelectValue(element: HTMLSelectElement, requested: string): void {
  const normalized = normalizeChoice(requested);
  const options = Array.from(element.options).filter((option) => !option.disabled && !option.hidden && !option.parentElement?.matches("optgroup:disabled") && !isPlaceholderOption(option, option.index));
  const match = normalized ? options.find((option) => [option.value, option.textContent ?? ""].map(normalizeChoice).filter(Boolean).includes(normalized)) : undefined;
  if (!match) throw new Error(`No exact matching option for “${requested}”`);
  element.focus();
  const setter = Object.getOwnPropertyDescriptor(
    (element.ownerDocument.defaultView?.HTMLSelectElement ?? HTMLSelectElement).prototype,
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
  const normalized = normalizeChoice(requested);
  return normalized ? radios.find((radio) => [radio.value, resolveOptionLabel(radio, doc)].map(normalizeChoice).filter(Boolean).includes(normalized)) : undefined;
}

function emitEvents(element: HTMLElement): void {
  for (const type of ["input", "change", "blur"]) {
    const EventType = element.ownerDocument.defaultView?.Event ?? Event;
    element.dispatchEvent(new EventType(type, { bubbles: true, composed: true }));
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

function escapeAttribute(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
