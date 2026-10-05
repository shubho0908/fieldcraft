import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { Worker as OcrWorker } from "tesseract.js";
import { readDocStreams } from "./resume-doc-container";
import { readDocxArchive } from "./resume-docx-archive";

export const MAX_RESUME_BYTES = 8 * 1024 * 1024;
const MAX_DOCUMENT_TEXT = 2 * 1024 * 1024;
const MAX_PDF_PAGES = 50;
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const STRICT_WORD_NS = "http://purl.oclc.org/ooxml/wordprocessingml/main";

type Result = { text: string; warnings: string[] };
type Format = "pdf" | "docx" | "doc";
const MIME: Record<Format, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
};

function fail(message: string): never {
  throw new Error(message);
}

function finish(text: string, warnings: string[]): Result {
  text = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  if (text.length > MAX_DOCUMENT_TEXT) fail("The document contains too much text. Upload a shorter resume.");
  if (text.length < 100 || (text.match(/\p{L}/gu)?.length || 0) < 30) {
    fail("The document has fewer than 100 characters of readable resume text. Upload a text-based resume or paste your resume text.");
  }
  const bad = text.match(/[\u0000-\u0008\u000e-\u001f\ufffd]/g)?.length || 0;
  if (bad > 0) fail("The document's text encoding is unreadable. Export a fresh PDF or DOCX and try again.");
  return { text, warnings: [...new Set(warnings)] };
}

/** Extracts entirely in the extension; never sends the document to a server. */
export async function parseResume(file: File): Promise<Result> {
  if (!file.size) fail("The resume file is empty.");
  if (file.size > MAX_RESUME_BYTES) fail("Resume files must be 8 MB or smaller.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "pdf" && extension !== "docx" && extension !== "doc") {
    fail("Choose a PDF, DOCX, or Word 97–2003 DOC resume.");
  }
  const format = extension as Format;
  if (file.type && file.type !== MIME[format] && file.type !== "application/octet-stream") {
    fail("The file type does not match its filename. Choose a genuine PDF, DOCX, or DOC document.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = format === "pdf" ? [0x25, 0x50, 0x44, 0x46, 0x2d]
    : format === "docx" ? [0x50, 0x4b, 0x03, 0x04]
    : [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (format === "docx" && bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    fail("This DOCX is encrypted or password-protected. Save an unprotected copy and try again.");
  }
  if (!signature.every((byte, index) => bytes[index] === byte)) {
    fail(`This file is not a valid ${format.toUpperCase()} document. Export the original resume again.`);
  }
  try {
    const result = format === "pdf" ? await parsePdf(bytes)
      : format === "docx" ? await parseDocx(bytes) : await parseDoc(bytes);
    return finish(result.text, result.warnings);
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") {
      fail("This PDF is password-protected or encrypted. Save an unprotected copy and upload it.");
    }
    if (error instanceof Error && error.name === "InvalidPDFException") {
      fail("This PDF is corrupt or unreadable. Export a fresh PDF and try again.");
    }
    throw error instanceof Error ? error : new Error("The resume could not be read. Export a fresh PDF or DOCX and try again.");
  }
}

function asset(path: string): string {
  return new URL(`resume-parser/${path}`, document.baseURI).href;
}

type Span = { text: string; x: number; y: number; end: number; height: number; eol: boolean };
function pdfPageText(items: TextItem[], width: number): string {
  const spans: Span[] = items.filter((item) => item.str.trim()).map((item) => ({
    text: item.str, x: item.transform[4], y: item.transform[5],
    end: item.transform[4] + item.width,
    height: Math.max(Math.abs(item.height), 1), eol: item.hasEOL,
  }));
  if (!spans.length) return "";
  // Look for a genuine vertical gutter supported by several lines on both
  // sides. A title spanning it remains a full-width band above the columns.
  let split: number | undefined;
  let best = 0;
  for (let x = width * 0.25; x <= width * 0.75; x += width * 0.02) {
    const left = spans.filter((span) => span.end < x - width * 0.015);
    const right = spans.filter((span) => span.x > x + width * 0.015);
    const crossing = spans.filter((span) => span.x <= x + width * 0.015 && span.end >= x - width * 0.015);
    const leftRows = new Set(left.map((span) => Math.round(span.y / 6)));
    const rightRows = new Set(right.map((span) => Math.round(span.y / 6)));
    if (leftRows.size < 3 || rightRows.size < 3) continue;
    const columnTop = Math.min(Math.max(...left.map((s) => s.y)), Math.max(...right.map((s) => s.y)));
    const columnBottom = Math.max(Math.min(...left.map((s) => s.y)), Math.min(...right.map((s) => s.y)));
    if (crossing.some((span) => span.y < columnTop && span.y > columnBottom)) continue;
    const gutter = Math.min(...right.map((s) => s.x)) - Math.max(...left.map((s) => s.end));
    if (gutter > best) { best = gutter; split = x; }
  }
  function lines(group: Span[]): string {
    const ordered = group.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: { y: number; height: number; spans: Span[] }[] = [];
    for (const span of ordered) {
      const row = rows[rows.length - 1];
      if (row && Math.abs(row.y - span.y) <= Math.min(row.height, span.height) * 0.35) row.spans.push(span);
      else rows.push({ y: span.y, height: span.height, spans: [span] });
    }
    return rows.map((row, index) => {
      row.spans.sort((a, b) => a.x - b.x);
      let text = "";
      for (let i = 0; i < row.spans.length; i++) {
        const current = row.spans[i];
        const previous = row.spans[i - 1];
        const gap = previous && current.x - previous.end;
        text += previous && gap > Math.min(previous.height, current.height) * 0.12 && !/\s$/.test(text) && !/^\s/.test(current.text) ? ` ${current.text}` : current.text;
      }
      const previous = rows[index - 1];
      return `${previous && previous.y - row.y > Math.max(previous.height, row.height) * 1.7 ? "\n" : ""}${text}`;
    }).join("\n");
  }
  if (split === undefined) return lines(spans);
  const full = spans.filter((span) => span.x <= split! && span.end >= split!);
  // Full-width headings separate independent column bands. Within each band
  // read down the left column, then down the right, never across their rows.
  const boundaries = [...new Set(full.map((span) => span.y))].sort((a, b) => b - a);
  const output: string[] = [];
  let top = Infinity;
  for (const bottom of [...boundaries, -Infinity]) {
    const band = spans.filter((span) => span.y < top - 1 && span.y > bottom + 1);
    output.push(lines(band.filter((span) => span.end < split!)), lines(band.filter((span) => span.x > split!)));
    if (Number.isFinite(bottom)) output.push(lines(spans.filter((span) => Math.abs(span.y - bottom) <= 1)));
    top = bottom;
  }
  return output.filter(Boolean).join("\n\n");
}

async function parsePdf(bytes: Uint8Array): Promise<Result> {
  // Required lazy boundary: PDF.js and its worker must not load in the initial UI.
  const pdf = await import("pdfjs-dist");
  // chrome-extension URLs have an opaque URL.origin. Letting PDF.js decide
  // same-origin would create a blob wrapper, which MV3 correctly blocks.
  const workerPort = typeof Worker !== "undefined" ? new Worker(asset("pdf.worker.mjs"), { type: "module" }) : undefined;
  if (workerPort) pdf.GlobalWorkerOptions.workerPort = workerPort;
  const loading = pdf.getDocument({
    data: bytes, isEvalSupported: false, useWasm: false, stopAtErrors: true,
    ...(typeof document !== "undefined" ? {
      cMapUrl: asset("cmaps/"), cMapPacked: true,
      standardFontDataUrl: asset("standard_fonts/"),
    } : {}),
  });
  const warnings: string[] = [];
  let ocr: OcrWorker | undefined;
  try {
    const documentPdf = await loading.promise;
    if (documentPdf.numPages > MAX_PDF_PAGES) fail("The PDF has more than 50 pages. Upload a shorter resume.");
    const pages: string[] = [];
    let totalText = 0;
    for (let number = 1; number <= documentPdf.numPages; number++) {
      const page = await documentPdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      if (!Number.isFinite(viewport.width * viewport.height) || viewport.width <= 0 || viewport.height <= 0 || viewport.width > 20_000 || viewport.height > 20_000) fail(`PDF page ${number} has invalid or oversized page dimensions. Export a standard-size PDF.`);
      const content = await page.getTextContent();
      const items = content.items.filter((item): item is TextItem => "str" in item);
      if (items.length > 100_000 || items.reduce((length, item) => length + item.str.length, 0) > MAX_DOCUMENT_TEXT) fail(`PDF page ${number} exceeds safe text complexity limits. Upload a shorter resume.`);
      let text = pdfPageText(items, viewport.width);
      const operators = await page.getOperatorList();
      if (operators.fnArray.length > 200_000) fail(`PDF page ${number} exceeds safe graphics complexity limits. Export a simpler PDF.`);
      // Track the graphics matrix to distinguish a photo/logo from a scanned
      // text region. For mixed pages, OCR the entire rendered page once so text
      // inside the image is not silently lost or duplicated with its text layer.
      let matrix = [1, 0, 0, 1, 0, 0];
      const stack: number[][] = [];
      let imageArea = 0;
      let hasImage = false;
      for (let i = 0; i < operators.fnArray.length; i++) {
        const operation = operators.fnArray[i];
        if (operation === pdf.OPS.save) stack.push([...matrix]);
        else if (operation === pdf.OPS.restore) matrix = stack.pop() || [1, 0, 0, 1, 0, 0];
        else if (operation === pdf.OPS.transform) {
          const [a, b, c, d, e, f] = operators.argsArray[i] as number[];
          const [g, h, j, k, l, m] = matrix;
          matrix = [g * a + j * b, h * a + k * b, g * c + j * d, h * c + k * d, g * e + j * f + l, h * e + k * f + m];
        } else if (operation === pdf.OPS.paintImageXObject || operation === pdf.OPS.paintInlineImageXObject || operation === pdf.OPS.paintImageMaskXObject) {
          hasImage = true;
          imageArea += Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]);
        } else if (operation === pdf.OPS.paintImageXObjectRepeat || operation === pdf.OPS.paintImageMaskXObjectRepeat || operation === pdf.OPS.paintInlineImageXObjectGroup || operation === pdf.OPS.paintImageMaskXObjectGroup) {
          // Optimized image groups use their own per-image transforms. OCR the
          // page rather than guessing their coverage and dropping scan text.
          hasImage = true;
          imageArea = viewport.width * viewport.height;
        }
      }
      const needsOcr = !/\p{L}/u.test(text) || imageArea > viewport.width * viewport.height * 0.1;
      if (needsOcr) {
        if (typeof document === "undefined" || typeof Worker === "undefined") {
          fail(`PDF page ${number} requires local OCR. Open Fieldcraft in a browser with canvas, Web Workers and WebAssembly enabled; no partial text was saved.`);
        }
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context || typeof WebAssembly === "undefined") fail(`PDF page ${number} requires local OCR, but canvas or WebAssembly is unavailable. No partial text was saved.`);
        const scale = Math.min(2.5, Math.sqrt(12_000_000 / (viewport.width * viewport.height)));
        if (scale < 1) fail(`PDF page ${number} is too large to OCR safely. Export a smaller, text-based PDF.`);
        const rasterViewport = page.getViewport({ scale });
        canvas.width = Math.ceil(rasterViewport.width);
        canvas.height = Math.ceil(rasterViewport.height);
        await page.render({ canvas, canvasContext: context, viewport: rasterViewport }).promise;
        try {
          if (!ocr) {
            // OCR is loaded only for pages that actually require recognition.
            const { createWorker, OEM } = await import("tesseract.js");
            ocr = await createWorker("eng", OEM.LSTM_ONLY, {
              workerPath: asset("ocr/worker.min.js"), workerBlobURL: false,
              corePath: asset("ocr/tesseract-core-lstm.wasm.js"),
              langPath: asset("ocr/"), cacheMethod: "none", gzip: true,
            });
          }
          const result = await ocr.recognize(canvas);
          text = result.data.text.trim();
          if (result.data.confidence < 65 || (text.match(/\p{L}/gu)?.length || 0) < 20) {
            fail(`PDF page ${number} could not be read reliably by local English OCR. Upload a clearer scan or a text-based PDF; no partial text was saved.`);
          }
          warnings.push(`Page ${number} used local English OCR. Recognition may change characters, numbers or layout; review the extracted text carefully. Other languages are not supported by the bundled OCR model.`);
        } catch (error) {
          if (error instanceof Error && error.message.includes("no partial text")) throw error;
          fail(`Local OCR could not read PDF page ${number}. The extension requires its packaged OCR worker, English language data and WebAssembly CSP permission. No document bytes were uploaded and no partial text was saved.`);
        } finally {
          canvas.width = canvas.height = 0;
        }
      } else if (hasImage) {
        warnings.push(`Page ${number} contains small images; only its text layer was extracted. Check any text in logos or small graphics.`);
      }
      totalText += text.length;
      if (totalText > MAX_DOCUMENT_TEXT) fail("The PDF contains too much text. Upload a shorter resume.");
      pages.push(text);
      page.cleanup();
    }
    return { text: pages.join("\n\n\f\n\n"), warnings };
  } finally {
    try { await ocr?.terminate(); }
    finally {
      try { await loading.destroy(); }
      finally {
        if (pdf.GlobalWorkerOptions.workerPort === workerPort) pdf.GlobalWorkerOptions.workerPort = null;
        workerPort?.terminate();
      }
    }
  }
}

function xml(bytes: Uint8Array, name: string): XMLDocument {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) fail(`The DOCX contains unsupported XML declarations in ${name}.`);
  const parsed = new DOMParser().parseFromString(source, "application/xml");
  if (parsed.getElementsByTagName("parsererror").length) fail(`The DOCX contains corrupt XML in ${name}.`);
  const nodes: { element: Element; depth: number }[] = [{ element: parsed.documentElement, depth: 0 }];
  let count = 0;
  while (nodes.length) {
    const node = nodes.pop()!;
    if (++count > 100_000 || node.depth > 128) fail("The DOCX XML exceeds safe document complexity limits.");
    for (const child of Array.from(node.element.children)) nodes.push({ element: child, depth: node.depth + 1 });
  }
  return parsed;
}
function isWord(element: Element, name?: string): boolean {
  return (element.namespaceURI === WORD_NS || element.namespaceURI === STRICT_WORD_NS) && (!name || element.localName === name);
}
function children(element: Element, name: string): Element[] {
  return Array.from(element.children).filter((child) => isWord(child, name));
}
function descendants(element: Element | Document, name: string): Element[] {
  return Array.from(element.getElementsByTagNameNS("*", name)).filter((child) => isWord(child, name));
}
function attr(element: Element | undefined, name: string): string | undefined {
  return element?.getAttributeNS(WORD_NS, name) ?? element?.getAttributeNS(STRICT_WORD_NS, name) ?? undefined;
}

type ListLevel = { format: string; template: string; start: number };
function listNumber(number: number, format: string): string {
  if (format === "decimal" || format === "decimalZero") return format === "decimalZero" ? String(number).padStart(2, "0") : String(number);
  if (format === "lowerLetter" || format === "upperLetter") {
    let output = "";
    for (let n = number; n > 0; n = Math.floor((n - 1) / 26)) output = String.fromCharCode(97 + (n - 1) % 26) + output;
    return format === "upperLetter" ? output.toUpperCase() : output;
  }
  if (format === "lowerRoman" || format === "upperRoman") {
    let output = "";
    const values: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    if (number > 3999) fail("The DOCX contains unsupported list numbering. Export a PDF instead.");
    for (const [value, marker] of values) while (number >= value) { output += marker; number -= value; }
    return format === "lowerRoman" ? output.toLowerCase() : output;
  }
  fail(`The DOCX uses unsupported ${format} list numbering. Export a PDF to preserve its list labels.`);
}

async function parseDocx(bytes: Uint8Array): Promise<Result> {
  const archive = await readDocxArchive(bytes);
  if (!archive["word/document.xml"] || !archive["[Content_Types].xml"]) fail("This ZIP is not a valid DOCX resume.");
  const types = xml(archive["[Content_Types].xml"], "[Content_Types].xml");
  if (!Array.from(types.getElementsByTagNameNS("*", "Override")).some((entry) => entry.getAttribute("PartName") === "/word/document.xml" && entry.getAttribute("ContentType") === "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml")) {
    fail("The archive is not a DOCX document (macro-enabled documents are not supported).");
  }
  const doc = xml(archive["word/document.xml"], "word/document.xml");
  const body = descendants(doc, "body")[0];
  if (!body) fail("The DOCX document body is missing.");
  if (descendants(doc, "altChunk").length) fail("The DOCX includes embedded content that cannot be extracted safely. Export a PDF instead.");
  const warnings: string[] = [];
  if (descendants(doc, "del").length || descendants(doc, "ins").length) warnings.push("Tracked changes were accepted for extraction: deleted text was omitted and inserted text was kept.");
  if (descendants(doc, "drawing").length || descendants(doc, "pict").length) warnings.push("DOCX text was extracted, including text boxes; text contained only in pictures was not read. Review the result.");
  const abstracts: Record<string, Record<string, ListLevel>> = Object.create(null);
  const lists: Record<string, Record<string, ListLevel>> = Object.create(null);
  const counters: Record<string, number[]> = Object.create(null);
  if (archive["word/numbering.xml"]) {
    const numbering = xml(archive["word/numbering.xml"], "word/numbering.xml");
    function level(element: Element): ListLevel {
      return { format: attr(children(element, "numFmt")[0], "val") || "decimal", template: attr(children(element, "lvlText")[0], "val") || "%1.", start: Number(attr(children(element, "start")[0], "val") || 1) };
    }
    for (const abstract of descendants(numbering, "abstractNum")) {
      const levels: Record<string, ListLevel> = Object.create(null);
      for (const entry of children(abstract, "lvl")) levels[attr(entry, "ilvl") || "0"] = level(entry);
      abstracts[attr(abstract, "abstractNumId") || ""] = levels;
    }
    for (const list of descendants(numbering, "num")) {
      const levels = { ...abstracts[attr(children(list, "abstractNumId")[0], "val") || ""] };
      for (const override of children(list, "lvlOverride")) {
        const index = attr(override, "ilvl") || "0";
        if (children(override, "lvl")[0]) levels[index] = level(children(override, "lvl")[0]);
        if (children(override, "startOverride")[0] && levels[index]) levels[index] = { ...levels[index], start: Number(attr(children(override, "startOverride")[0], "val")) };
      }
      lists[attr(list, "numId") || ""] = levels;
    }
  }
  const styles: Record<string, Element> = Object.create(null);
  if (archive["word/styles.xml"]) {
    for (const style of descendants(xml(archive["word/styles.xml"], "word/styles.xml"), "style")) styles[attr(style, "styleId") || ""] = style;
  }
  function styleNumbering(id: string | undefined, seen = new Set<string>()): Element | undefined {
    if (!id || seen.has(id)) return undefined;
    seen.add(id);
    const style = styles[id];
    if (!style) return undefined;
    return descendants(style, "numPr")[0] || styleNumbering(attr(children(style, "basedOn")[0], "val"), seen);
  }
  function paragraph(element: Element): string {
    let text = "";
    function inline(node: Element) {
      if (isWord(node, "del") || isWord(node, "moveFrom") || isWord(node, "instrText")) return;
      if (isWord(node, "t")) text += node.textContent || "";
      else if (isWord(node, "tab")) text += "\t";
      else if (isWord(node, "br")) text += attr(node, "type") === "page" ? "\n\f\n" : "\n";
      else if (isWord(node, "cr")) text += "\n";
      else if (isWord(node, "noBreakHyphen")) text += "\u2011";
      else if (isWord(node, "softHyphen")) text += "\u00ad";
      else if (node.localName === "AlternateContent") {
        const selected = Array.from(node.children).find((child) => child.localName === "Choice") || Array.from(node.children).find((child) => child.localName === "Fallback");
        if (selected) inline(selected);
      }
      else if (node !== element && isWord(node, "p")) text += `\n${paragraph(node)}\n`;
      else for (const child of Array.from(node.children)) inline(child);
    }
    inline(element);
    const properties = children(element, "pPr")[0];
    const inherited = styleNumbering(attr(properties && children(properties, "pStyle")[0], "val"));
    const numProperties = properties && children(properties, "numPr")[0];
    const numId = attr(numProperties && children(numProperties, "numId")[0], "val") ?? attr(inherited && children(inherited, "numId")[0], "val");
    if (numId && numId !== "0") {
      const index = Number(attr(numProperties && children(numProperties, "ilvl")[0], "val") ?? attr(inherited && children(inherited, "ilvl")[0], "val") ?? 0);
      const definition = lists[numId]?.[index];
      if (!definition || !Number.isInteger(index) || index < 0 || index > 8 || !Number.isInteger(definition.start) || definition.start < 0) fail("The DOCX list definitions are missing or invalid. Export a PDF instead.");
      const counts = counters[numId] ||= [];
      counts[index] = counts[index] === undefined ? definition.start : counts[index] + 1;
      counts.length = index + 1;
      let marker = definition.template;
      if (definition.format === "bullet") marker = /[\uf000-\uf8ff]/.test(marker) ? "•" : marker;
      else if (definition.format === "none") marker = "";
      else marker = marker.replace(/%([1-9])/g, (_, part: string) => {
        const target = Number(part) - 1;
        const targetLevel = lists[numId][target];
        if (!targetLevel) fail("The DOCX has invalid multi-level list numbering.");
        return listNumber(counts[target] ?? targetLevel.start, targetLevel.format);
      });
      text = `${"  ".repeat(index)}${marker}${marker ? " " : ""}${text}`;
    }
    return `${properties && children(properties, "pageBreakBefore").length ? "\f\n" : ""}${text}`;
  }
  function blocks(element: Element): string {
    return Array.from(element.children).map((child): string => {
      if (isWord(child, "del") || isWord(child, "moveFrom") || isWord(child, "sectPr")) return "";
      if (isWord(child, "p")) return paragraph(child);
      if (isWord(child, "tbl")) return children(child, "tr").map((row) => children(row, "tc").map((cell) => blocks(cell)).join("\t")).join("\n");
      return blocks(child);
    }).filter(Boolean).join("\n\n");
  }
  const bodyText = blocks(body);
  const headers: string[] = [];
  const footers: string[] = [];
  const references = [...descendants(doc, "headerReference"), ...descendants(doc, "footerReference")];
  if (references.length) {
    const data = archive["word/_rels/document.xml.rels"];
    if (!data) fail("The DOCX header/footer relationships are missing. Export a fresh DOCX.");
    const relationships = Array.from(xml(data, "word/_rels/document.xml.rels").getElementsByTagNameNS("*", "Relationship"));
    const extracted = new Set<string>();
    for (const reference of references) {
      const id = reference.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id")
        || reference.getAttributeNS("http://purl.oclc.org/ooxml/officeDocument/relationships", "id");
      const relationship = relationships.find((entry) => entry.getAttribute("Id") === id);
      const target = relationship?.getAttribute("Target")?.replace(/^\/word\//, "");
      if (!target || !/^(header|footer)\d+\.xml$/.test(target) || relationship?.getAttribute("TargetMode") === "External" || !archive[`word/${target}`]) fail("The DOCX has an unreadable header or footer. Export a fresh DOCX.");
      if (extracted.has(target)) continue;
      extracted.add(target);
      for (const key of Object.keys(counters)) delete counters[key];
      const text = blocks(xml(archive[`word/${target}`], target).documentElement);
      (isWord(reference, "headerReference") ? headers : footers).push(text);
    }
  }
  if (headers.some(Boolean) || footers.some(Boolean)) warnings.push("Word headers and footers were included once, outside the document body; page layout is not preserved.");
  return { text: [...new Set(headers), bodyText, ...new Set(footers)].filter(Boolean).join("\n\n"), warnings };
}

async function parseDoc(bytes: Uint8Array): Promise<Result> {
  // The large legacy reader is loaded only after selecting a DOC upload.
  const { default: docToText } = await import("legacy-word-parser");
  const streams = readDocStreams(bytes);
  function stream(name: string): Uint8Array {
    const content = streams[name];
    if (!content) fail(`The DOC is missing its ${name} stream. Export a fresh DOCX instead.`);
    return content;
  }
  const word = stream("WordDocument");
  const view = new DataView(word.buffer, word.byteOffset, word.byteLength);
  if (word.length < 34 || view.getUint16(0, true) !== 0xa5ec) fail("This compound file is not a valid Word DOC document.");
  if (view.getUint16(2, true) < 0x00c1) fail("Word 6/95 DOC files are not supported. Save this document as Word 97–2003 DOC or DOCX first.");
  const flags = view.getUint16(10, true);
  if (flags & 0x8100) fail("This DOC is encrypted or password-protected. Save an unprotected DOCX copy and try again.");
  // Validate the full piece table before the forgiving third-party reader can
  // recover a truncated file as plausible partial text.
  try {
    let offset = 32;
    const wordCount = view.getUint16(offset, true); offset += 2 + wordCount * 2;
    const longCount = view.getUint16(offset, true); offset += 2;
    const bodyLength = view.getUint32(offset + 12, true);
    if (bodyLength > MAX_DOCUMENT_TEXT) fail("The DOC contains too much text. Upload a shorter resume.");
    offset += longCount * 4;
    const pairCount = view.getUint16(offset, true); offset += 2;
    if (pairCount < 34) throw new Error("Missing CLX");
    const clxStart = view.getUint32(offset + 33 * 8, true);
    const clxLength = view.getUint32(offset + 33 * 8 + 4, true);
    const table = stream(flags & 0x0200 ? "1Table" : "0Table");
    if (!clxLength || clxStart + clxLength > table.length) throw new Error("Truncated CLX");
    const tableView = new DataView(table.buffer, table.byteOffset, table.byteLength);
    let position = clxStart;
    while (table[position] === 1) position += 3 + tableView.getUint16(position + 1, true);
    if (table[position] !== 2 || position + 5 > clxStart + clxLength) throw new Error("Invalid piece table");
    const length = tableView.getUint32(position + 1, true);
    position += 5;
    if (length < 4 || (length - 4) % 12 || position + length > clxStart + clxLength) throw new Error("Truncated piece table");
    const pieces = (length - 4) / 12;
    let last = 0;
    for (let index = 0; index < pieces; index++) {
      const start = tableView.getUint32(position + index * 4, true);
      const end = tableView.getUint32(position + (index + 1) * 4, true);
      const compressedOffset = tableView.getUint32(position + (pieces + 1) * 4 + index * 8 + 2, true);
      const compressed = !!(compressedOffset & 0x40000000);
      const fileOffset = (compressedOffset & 0x3fffffff) / (compressed ? 2 : 1);
      if (start !== last || end < start || end > MAX_DOCUMENT_TEXT || !Number.isInteger(fileOffset) || fileOffset + (end - start) * (compressed ? 1 : 2) > word.length) throw new Error("Invalid text piece");
      last = end;
    }
    if (last < bodyLength) throw new Error("Incomplete body");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("The DOC")) throw error;
    fail("The DOC text data is corrupt or truncated. Export a fresh DOCX instead; no partial text was saved.");
  }
  const sections = docToText.sections(bytes);
  if (!sections) fail("The DOC is corrupt, encrypted, or unreadable. Export a fresh DOCX instead.");
  const warnings = ["Legacy DOC layout was converted to text; review lists, tables, headers and text boxes. Text inside pictures was not extracted. Tracked changes are treated as accepted."];
  return { text: [sections.headers, sections.body, sections.textboxes, sections.headerTextboxes, sections.footnotes, sections.endnotes].filter(Boolean).join("\n\n"), warnings };
}
