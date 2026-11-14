import { PageFieldKind, SuggestionAction } from "./enums";
import { findUniqueChoice, isPlaceholderOption } from "./fields";
import { composedChildren, composedContains, composedParent, isElementVisible, queryComposedAll as queryAll } from "./visibility";
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
  ".job__description",
  ".ashby-job-posting-description",
  ".show-more-less-html__markup",
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
    const text = cleanText(visibleText(node));
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
  const descriptionNodes = new Set<Node>();
  const specificSelectors = JOB_TEXT_SELECTORS.slice(0, JOB_TEXT_SELECTORS.indexOf(".posting-page"));
  const explicit = queryAll<HTMLElement>(doc, specificSelectors.join(","))
    .filter((node) => isVisible(node) && !isExcludedText(node));
  // Keep enclosing descriptions, including their own prose, and all disjoint
  // siblings. Reading only these roots naturally avoids nested duplication.
  const roots = explicit.filter((node) => !explicit.some((other) => other !== node && composedContains(other, node)));
  const postingScope = (node: Element): Element | null => {
    for (let parent = composedParent(node); parent; parent = composedParent(parent)) {
      if (parent.matches("article, main")) return parent;
    }
    return null;
  };
  // A posting can split its description across wrappers. Only a distinct
  // article or a card that links to its own role is evidence of another
  // posting: grouping by the immediate parent drops overview and
  // qualifications of one job, and the English fallback cannot recover that
  // text when the posting is not in English.
  const postingArticle = (node: Element): Element | null => {
    if (node.matches("article")) return node;
    for (let parent = composedParent(node); parent; parent = composedParent(parent)) {
      if (parent.matches("article")) return parent;
    }
    return null;
  };
  const jobHref = /(?:^|\/)(?:jobs?|careers?|positions?|apply)(?:\/|$|[?#])/i;
  const isPostingCardControl = (control: Element): boolean => {
    if (!isVisible(control as HTMLElement)) return false;
    const label = `${control.textContent ?? ""} ${control.getAttribute("aria-label") ?? ""} ${control.getAttribute("value") ?? ""}`.replace(/\s+/g, " ").trim();
    return /\b(?:apply(?: now)?|view (?:this )?(?:job|role|position|posting)|job details)\b/i.test(label) ||
      jobHref.test(control.getAttribute("href") ?? "");
  };
  const postingTarget = (control: Element, card: Element): string => {
    const jobId = control.getAttribute("data-job-id") ?? control.getAttribute("data-posting-id") ??
      card.getAttribute("data-job-id") ?? card.getAttribute("data-posting-id");
    if (jobId) return `job:${jobId}`;
    const raw = control.getAttribute("href") ?? control.getAttribute("formaction") ??
      control.closest("form")?.getAttribute("action") ?? "";
    if (!raw || raw === "#" || /^javascript:/i.test(raw)) return "";
    try {
      return `url:${new URL(raw, control.ownerDocument.baseURI).href}`;
    } catch {
      return `url:${raw}`;
    }
  };
  const postingCard = (node: Element): { card: Element; target: string } | null => {
    for (let parent = composedParent(node); parent; parent = composedParent(parent)) {
      if (parent.matches("main, body")) break;
      const control = queryAll<HTMLElement>(parent, "a[href], button, [role='button'], input[type='submit'], input[type='button']").find(isPostingCardControl);
      if (control) return { card: parent, target: postingTarget(control, parent) };
    }
    return null;
  };
  const cards = new Map<HTMLElement, { card: Element; target: string } | null>();
  for (const root of roots) cards.set(root, postingCard(root));
  const looseRoots = roots.filter((root) => !postingArticle(root));
  // Only split loose blocks by card when every one of them has a card. Cards
  // that point at the same application are sections of one posting; cards
  // with different targets are different roles.
  const allCards = looseRoots.length > 1 && looseRoots.every((root) => Boolean(cards.get(root)));
  const postingGroups = new Map<Element | string, HTMLElement[]>();
  for (const root of roots) {
    const card = cards.get(root);
    const group = postingArticle(root) ?? (allCards && card ? (card.target || card.card) : null) ?? postingScope(root) ?? doc.body ?? doc.documentElement;
    const existing = postingGroups.get(group);
    if (existing) existing.push(root);
    else postingGroups.set(group, [root]);
  }
  const separatePostings = [...postingGroups.values()].filter((group) =>
    group.map((node) => visibleText(node, true)).join("\n\n").length > 120).length > 1;
  const scopes = new Set(roots.map(postingScope).filter((node) => node !== null));
  const headers = queryAll<HTMLElement>(doc, "header").filter((header) => {
    const scope = postingScope(header);
    return scope !== null && scopes.has(scope) && !roots.some((root) => composedContains(root, header)) &&
      isVisible(header) && !isExcludedText(header);
  });
  const selectedRoots = new Set([...roots, ...headers]);
  const sections = queryAll<HTMLElement>(doc, "*").filter((node) => selectedRoots.has(node))
    .map((node) => ({ node, text: visibleText(node, true) })).filter(({ text }) => text);
  const explicitText = separatePostings ? "" : sections.map(({ text }) => text).join("\n\n");
  if (explicitText.length > 120) {
    description = explicitText;
    sections.forEach(({ node }) => descriptionNodes.add(node));
    source = `selector:${specificSelectors.find((selector) => explicit.some((node) => node.matches(selector)))}`;
  } else if (!separatePostings) {
    const jobLanguage = /\b(?:responsibilities|requirements|qualifications|about (?:the|this) role|what you(?:'|’)ll do|experience|we(?:'|’)re hiring)\b/iu;
    const isListing = (node: HTMLElement) =>
      queryAll<HTMLInputElement>(node, "input").some((input) => isVisible(input) && /search.*(?:roles|jobs|positions)/i.test(`${input.placeholder} ${input.getAttribute("aria-label") ?? ""}`)) ||
      queryAll<HTMLElement>(node, "article").filter((article) => !isExcludedText(article) && visibleText(article, true).length > 120).length > 1;
    for (const selector of JOB_TEXT_SELECTORS.slice(specificSelectors.length)) {
      const candidates = queryAll<HTMLElement>(doc, selector)
        .filter((node) => isVisible(node) && !isExcludedText(node) && !isListing(node))
        .map((node) => ({ node, text: visibleText(node, true) }))
        .filter(({ text }) => text.length > 120 && jobLanguage.test(text));
      const independent = candidates.filter(({ node }) => !candidates.some((other) => other.node !== node && composedContains(other.node, node)));
      // Several independent broad matches are a listing, not one selected job.
      if (independent.length > 1) break;
      if (!independent.length) continue;
      description = independent[0].text;
      descriptionNodes.add(independent[0].node);
      source = `selector:${selector}`;
      break;
    }
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
  const formText = queryAll<HTMLElement>(doc, "form").filter((form) => isVisible(form)).map((form) => visibleText(form, false, true, descriptionNodes)).filter(Boolean).join("\n\n");
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

function isExcludedText(element: Element): boolean {
  for (let node: Element | null = element; node; node = composedParent(node)) {
    if (node.matches("header, footer") && !hasPostingAncestor(node)) return true;
    if (node.matches("nav, aside, [role='navigation'], [role='complementary'], .recommended-jobs, .related-jobs, .other-jobs, .job-listings, [class*='recommended-job'], [class*='related-job'], [data-testid*='recommended'], [data-testid*='related-job']")) return true;
  }
  return false;
}

function hasPostingAncestor(element: Element): boolean {
  for (let parent = composedParent(element); parent; parent = composedParent(parent)) {
    if (parent.matches(`main, article, ${JOB_TEXT_SELECTORS.slice(0, -2).join(",")}`)) return true;
  }
  return false;
}

function visibleText(root: Node, excludeForms = false, rendered = true, excludedNodes?: ReadonlySet<Node>): string {
  const visited = new Set<Node>();
  const walk = (node: Node): string => {
    if (excludedNodes?.has(node) || visited.has(node)) return "";
    visited.add(node);
    if (node.nodeType === 3) return node.textContent ?? "";
    if (node.nodeType === 1) {
      const element = node as HTMLElement;
      if (element.matches("script, style, template, noscript, svg, input, textarea, select, button") || (excludeForms && element.matches("form")) || isExcludedText(element) || !isVisible(element, rendered)) return "";
      const content = composedChildren(element).map(walk).join("");
      if (/^H[1-6]$/.test(element.tagName)) return `\n${content}`;
      return /^(?:P|DIV|SECTION|ARTICLE|MAIN|HEADER|FOOTER|LI|UL|OL|BR|LABEL|FIELDSET|LEGEND|FORM|TABLE|THEAD|TBODY|TFOOT|TR|TH|TD|DL|DT|DD)$/.test(element.tagName) ? `\n${content}\n` : content;
    }
    return composedChildren(node).map(walk).join("");
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

  let cursor: Element | null = element;
  for (; cursor; cursor = composedParent(cursor)) {
    if (cursor.matches("fieldset")) {
      const title = cursor.querySelector("legend");
      if (title) return cleanText(labelText(title));
    }
    let sibling = cursor.previousElementSibling;
    while (sibling) {
      if (/^H[1-4]$/.test(sibling.tagName)) {
        return cleanText(visibleText(sibling));
      }
      sibling = sibling.previousElementSibling;
    }
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
  return isElementVisible(element, { rendered });
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
  const fieldId = element.getAttribute(FIELD_ATTRIBUTE);
  const url = element.ownerDocument.location?.href;
  const scope = labelScope(element);
  const controlledIds = () => `${element.getAttribute("aria-controls") ?? ""} ${element.getAttribute("aria-owns") ?? ""}`.trim();
  let changed = false;
  let writing = true;
  let selecting = false;
  const edited = () => {
    // The option's own selection events are not user edits.
    if (writing || selecting) return;
    // A widget may commit the option asynchronously, after the interaction
    // ended. A value that already matches the requested option is the
    // selection itself, not an edit made underneath us.
    if (element.value === value) return;
    changed = true;
  };
  element.addEventListener("input", edited);
  element.addEventListener("change", edited);
  try {
    setTextValue(element, value);
    writing = false;
    const controls = controlledIds();
    const assertOwned = () => {
      if (changed || !element.isConnected || element.value !== value || !isUsableField(element) ||
        element.getAttribute(FIELD_ATTRIBUTE) !== fieldId || labelScope(element) !== scope ||
        element.ownerDocument.location?.href !== url || controlledIds() !== controls) {
        throw new Error("The combobox changed while choosing an option. Review it again.");
      }
    };
    await new Promise((resolve) => (element.ownerDocument.defaultView ?? window).setTimeout(resolve, 120));
    assertOwned();
    const options = controls.split(/\s+/).filter(Boolean).flatMap((id) => {
      const list = scope.getElementById(id);
      return list?.getAttribute("role") === "listbox" ? queryAll<HTMLElement>(list, "[role='option']") : [];
    }).filter((option) => isVisible(option) && option.getAttribute("aria-disabled") !== "true");
    const match = findUniqueChoice(options, value, (option) => [
      option.getAttribute("data-value") ?? "", option.getAttribute("aria-label") ?? "", option.textContent ?? "",
    ]);
    if (!match) {
      assertOwned();
      writing = true;
      setTextValue(element, previous);
      throw new Error(`No unique exact matching option in the controlled listbox for “${value}”`);
    }
    const MouseEventType = element.ownerDocument.defaultView?.MouseEvent ?? MouseEvent;
    selecting = true;
    try {
      match.dispatchEvent(new MouseEventType("mousedown", { bubbles: true, composed: true }));
      // A mousedown handler can replace either the control or the option.
      assertOwned();
      if (!match.isConnected || !isVisible(match)) throw new Error("The combobox option changed before it could be chosen.");
      match.click();
    } finally {
      selecting = false;
    }
  } finally {
    element.removeEventListener("input", edited);
    element.removeEventListener("change", edited);
  }
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
  const options = Array.from(element.options).filter((option) => !option.disabled && !option.hidden && !option.parentElement?.matches("optgroup:disabled") && !isPlaceholderOption(option, option.index));
  const match = findUniqueChoice(options, requested, (option) => [option.value, option.textContent ?? ""]);
  if (!match) throw new Error(`No unique exact matching option for “${requested}”`);
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
  return findUniqueChoice(radios, requested, (radio) => [radio.value, resolveOptionLabel(radio, doc)]);
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
  const normalized = value.trim();
  if (/^(true|yes|y|1|checked)$/i.test(normalized)) return true;
  if (/^(false|no|n|0|unchecked)$/i.test(normalized)) return false;
  throw new Error("No exact matching checkbox choice. Select an explicit yes or no answer.");
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
