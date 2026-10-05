// @vitest-environment node
import { File as NodeFile } from "node:buffer";
import { readFile } from "node:fs/promises";
import { DOMMatrix, Path2D } from "@napi-rs/canvas";
import { JSDOM } from "jsdom";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { beforeAll, describe, expect, test } from "vitest";
import { MAX_RESUME_BYTES, parseResume } from "./resume-parser";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

beforeAll(() => {
  // Real DOM XML parsing and geometry, not mocked parser responses. Node uses
  // PDF.js's real in-process worker; browser OCR is exercised by scan fixtures
  // in the built extension, where its worker/WASM/CSP prerequisites exist.
  const dom = new JSDOM("");
  Object.assign(globalThis, { DOMParser: dom.window.DOMParser, DOMMatrix, Path2D });
});

async function fixture(name: string, type?: string): Promise<File> {
  const bytes = await readFile(new URL(`./__fixtures__/resumes/${name}`, import.meta.url));
  return new NodeFile([bytes], name, { type: type ?? (name.endsWith(".pdf") ? "application/pdf" : name.endsWith(".docx") ? DOCX_MIME : "application/msword") }) as File;
}

async function editedDocx(edit: (entries: Record<string, Uint8Array>) => void): Promise<File> {
  const original = await fixture("structured-resume.docx");
  const entries = unzipSync(new Uint8Array(await original.arrayBuffer()));
  edit(entries);
  return new NodeFile([zipSync(entries)], "resume.docx", { type: DOCX_MIME }) as File;
}

async function editedDoc(edit: (view: DataView, fibOffset: number) => void): Promise<File> {
  const original = await fixture("legacy-showcase.doc");
  const bytes = new Uint8Array(await original.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let fib = -1;
  for (let offset = 512; offset < bytes.length - 32; offset += 512) {
    if (view.getUint16(offset, true) === 0xa5ec) { fib = offset; break; }
  }
  if (fib < 0) throw new Error("The real DOC fixture's WordDocument FIB is missing.");
  edit(view, fib);
  return new NodeFile([bytes], "resume.doc", { type: "application/msword" }) as File;
}

describe("parseResume: actual PDF documents", () => {
  test("extracts factual text and paragraph/heading boundaries", async () => {
    const result = await parseResume(await fixture("text-resume.pdf"));
    expect(result.text).toContain("Ada Example - Software Engineer");
    expect(result.text).toContain("ada@example.test | London");
    expect(result.text).toMatch(/EXPERIENCE\n+Senior Engineer, Northwind, 2021-2025/);
    expect(result.text).toContain("Built reliable APIs and improved application performance.");
    expect(result.text).toContain("TypeScript, React, PostgreSQL and distributed systems.");
    expect(result.warnings).toEqual([]);
  });

  test("reads down columns rather than interleaving their rows", async () => {
    const result = await parseResume(await fixture("two-column-resume.pdf"));
    expect(result.text).toContain("Accessible interfaces");
    expect(result.text.indexOf("Distributed systems")).toBeLessThan(result.text.indexOf("EXPERIENCE"));
    expect(result.text.indexOf("SKILLS")).toBeLessThan(result.text.indexOf("TypeScript and React"));
    expect(result.text.indexOf("EXPERIENCE")).toBeLessThan(result.text.indexOf("Senior Engineer at Northwind"));
    expect(result.text).not.toContain("SKILLS EXPERIENCE");
  });

  test("retains page boundaries and text from later pages", async () => {
    const result = await parseResume(await fixture("two-page-resume.pdf"));
    expect(result.text).toContain("\f");
    expect(result.text).toContain("University of Example, Computer Science, 2016-2020");
    expect(result.text.indexOf("\f")).toBeLessThan(result.text.indexOf("EDUCATION"));
  });

  test("rejects genuine encrypted and truncated PDFs", async () => {
    await expect(parseResume(await fixture("encrypted-resume.pdf"))).rejects.toThrow(/password-protected|encrypted/i);
    await expect(parseResume(await fixture("corrupt-resume.pdf"))).rejects.toThrow(/corrupt|unreadable/i);
  });

  test("rejects pathological page counts before extracting", async () => {
    await expect(parseResume(await fixture("too-many-pages.pdf"))).rejects.toThrow(/more than 50 pages/);
  });

  test("does not call a scan successful when browser OCR prerequisites are absent", async () => {
    await expect(parseResume(await fixture("scanned-resume.pdf"))).rejects.toThrow(/page 1 requires local OCR.*no partial text/i);
  });

  test("does not return the first page as partial success for a mixed PDF", async () => {
    await expect(parseResume(await fixture("mixed-resume.pdf"))).rejects.toThrow(/page 2 requires local OCR.*no partial text/i);
  });
});

describe("parseResume: actual DOCX archive and XML", () => {
  test("preserves headings, paragraphs, bullets, table cells and explicit page breaks", async () => {
    const result = await parseResume(await fixture("structured-resume.docx"));
    expect(result.text).toContain("Ada Example - Contact Header\n\nAda Example - Software Engineer");
    expect(result.text).toContain("EXPERIENCE\n\n• Built reliable APIs at Northwind, 2021-2025.");
    expect(result.text).toContain("• Mentored engineers and shipped accessible interfaces.");
    expect(result.text).toContain("TypeScript\tAdvanced\nPostgreSQL\tProduction");
    expect(result.text).toContain("\f\nEDUCATION");
    expect(result.text).not.toContain("<w:");
    expect(result.warnings.join(" ")).toMatch(/headers and footers.*included once/);
  });

  test("resolves numbered list labels from actual numbering definitions", async () => {
    const file = await editedDocx((entries) => {
      entries["word/numbering.xml"] = strToU8(strFromU8(entries["word/numbering.xml"]).replace('w:val="bullet"', 'w:val="decimal"').replace('w:val="•"', 'w:val="%1."'));
    });
    const result = await parseResume(file);
    expect(result.text).toContain("1. Built reliable APIs");
    expect(result.text).toContain("2. Mentored engineers");
  });

  test("accepts tracked insertions, omits deletions and field instructions", async () => {
    const file = await editedDocx((entries) => {
      entries["word/document.xml"] = strToU8(strFromU8(entries["word/document.xml"]).replace("</w:body>", '<w:p><w:del><w:r><w:delText>Deleted invented employer</w:delText></w:r></w:del><w:ins><w:r><w:t>Accepted project contribution</w:t></w:r></w:ins><w:r><w:instrText> HYPERLINK private-instruction </w:instrText></w:r><w:r><w:t>Visible link label</w:t></w:r></w:p></w:body>'));
    });
    const result = await parseResume(file);
    expect(result.text).toContain("Accepted project contributionVisible link label");
    expect(result.text).not.toContain("Deleted invented employer");
    expect(result.text).not.toContain("private-instruction");
    expect(result.warnings.join(" ")).toContain("Tracked changes were accepted");
  });

  test("does not include inactive, orphaned header text", async () => {
    const file = await editedDocx((entries) => {
      entries["word/header2.xml"] = strToU8(strFromU8(entries["word/header1.xml"]).replace("Contact Header", "Orphaned Old Contact"));
    });
    expect((await parseResume(file)).text).not.toContain("Orphaned Old Contact");
  });

  test("rejects empty text, corrupt XML, foreign ZIPs and missing list definitions", async () => {
    await expect(parseResume(await fixture("empty-resume.docx"))).rejects.toThrow(/fewer than 100 characters/);
    await expect(parseResume(await editedDocx((entries) => { entries["word/document.xml"] = strToU8("<broken>"); }))).rejects.toThrow(/corrupt XML/);
    await expect(parseResume(new NodeFile([zipSync({ "notes.txt": strToU8("not a Word document") })], "resume.docx", { type: DOCX_MIME }) as File)).rejects.toThrow(/not a valid DOCX/);
    await expect(parseResume(await editedDocx((entries) => { delete entries["word/numbering.xml"]; }))).rejects.toThrow(/list definitions are missing/);
  });

  test("rejects imported embedded content rather than dropping it", async () => {
    const file = await editedDocx((entries) => {
      entries["word/document.xml"] = strToU8(strFromU8(entries["word/document.xml"]).replace("</w:body>", '<w:altChunk r:id="embedded-html"/></w:body>'));
    });
    await expect(parseResume(file)).rejects.toThrow(/embedded content/);
  });

  test("rejects oversized archive declarations before inflation", async () => {
    const file = await fixture("structured-resume.docx");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer);
    for (let offset = 0; offset < bytes.length - 46; offset++) {
      if (view.getUint32(offset, true) === 0x02014b50) { view.setUint32(offset + 24, 65 * 1024 * 1024, true); break; }
    }
    await expect(parseResume(new NodeFile([bytes], "resume.docx", { type: DOCX_MIME }) as File)).rejects.toThrow(/safe document limits/);
  });

  test("rejects integrity mismatches rather than returning recoverable text", async () => {
    const file = await fixture("structured-resume.docx");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer);
    for (let offset = 0; offset < bytes.length - 46; offset++) {
      if (view.getUint32(offset, true) === 0x02014b50) { view.setUint32(offset + 16, view.getUint32(offset + 16, true) ^ 0xffffffff, true); break; }
    }
    await expect(parseResume(new NodeFile([bytes], "resume.docx", { type: DOCX_MIME }) as File)).rejects.toThrow(/corrupt/);
  });
});

describe("parseResume: real legacy Word DOC", () => {
  // Upstream generated-content fixture, 0BSD; built on an application-saved
  // skeleton and confirmed by upstream to open in a real word processor.
  // https://github.com/Alpaq92/JSDoc/blob/821695a884e0c0bb8592a635d9524bb3e116cd67/samples/feature-showcase.doc
  test("reads body text, real list definitions and table boundaries without Node shims", async () => {
    const result = await parseResume(await fixture("legacy-showcase.doc"));
    expect(result.text).toContain("JSDoc feature showcase");
    expect(result.text).toContain("1. Open the OLE2 compound file");
    expect(result.text).toContain("2. Walk the piece table to the text");
    expect(result.text).toContain("• List markers come from the list definition");
    expect(result.text).toContain("Phase\tState\tOwner");
    expect(result.text).toContain("Design\tDone\tAlpaq92");
    expect(result.warnings.join(" ")).toContain("Legacy DOC layout");
  });

  test("rejects encrypted/obfuscated DOC and unsupported Word 6/95", async () => {
    await expect(parseResume(await editedDoc((view, fib) => { view.setUint16(fib + 10, view.getUint16(fib + 10, true) | 0x100, true); }))).rejects.toThrow(/encrypted|password-protected/);
    await expect(parseResume(await editedDoc((view, fib) => { view.setUint16(fib + 2, 0x65, true); }))).rejects.toThrow(/Word 6\/95/);
  });

  test("rejects truncated CFB instead of returning partial Word text", async () => {
    const file = await fixture("legacy-showcase.doc");
    const bytes = new Uint8Array(await file.arrayBuffer()).subarray(0, file.size - 512);
    await expect(parseResume(new NodeFile([bytes], "resume.doc", { type: "application/msword" }) as File)).rejects.toThrow(/corrupt|truncated/);
  });

  test("identifies encrypted DOCX wrapped in an OLE container", async () => {
    const file = await fixture("legacy-showcase.doc");
    await expect(parseResume(new NodeFile([await file.arrayBuffer()], "resume.docx", { type: DOCX_MIME }) as File)).rejects.toThrow(/encrypted|password-protected/);
  });
  test("retains an explicit legacy DOC page break rather than flattening it", async () => {
    const file = await fixture("legacy-showcase.doc");
    const bytes = Buffer.from(await file.arrayBuffer());
    let offset = bytes.indexOf(Buffer.from("read back,", "utf16le"));
    let characterBytes = 2;
    if (offset < 0) { offset = bytes.indexOf(Buffer.from("read back,")); characterBytes = 1; }
    if (offset < 0) throw new Error("The real DOC fixture's expected text bytes are missing.");
    bytes[offset + 9 * characterBytes] = 0x0c;
    if (characterBytes === 2) bytes[offset + 9 * characterBytes + 1] = 0;
    const result = await parseResume(new NodeFile([bytes], "resume.doc", { type: "application/msword" }) as File);
    expect(result.text).toContain("read back\n\f\n exercising");
  });

  test("rejects cyclic FAT chains without hanging or fabricating text", async () => {
    const file = await fixture("legacy-showcase.doc");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const sectorSize = 2 ** view.getUint16(30, true);
    const directorySector = view.getUint32(48, true);
    const fatIndex = Math.floor(directorySector / (sectorSize / 4));
    const fatSector = view.getUint32(76 + fatIndex * 4, true);
    view.setUint32((fatSector + 1) * sectorSize + (directorySector % (sectorSize / 4)) * 4, directorySector, true);
    await expect(parseResume(new NodeFile([bytes], "resume.doc", { type: "application/msword" }) as File)).rejects.toThrow(/corrupt/);
  });

  test("rejects incomplete piece-table declarations instead of recovery text", async () => {
    const file = await editedDoc((view, fib) => {
      let offset = fib + 32;
      offset += 2 + view.getUint16(offset, true) * 2;
      offset += 2 + view.getUint16(offset, true) * 4;
      offset += 2;
      view.setUint32(offset + 33 * 8 + 4, 0xffffffff, true);
    });
    await expect(parseResume(file)).rejects.toThrow(/corrupt or truncated.*no partial text/);
  });
});

describe("parseResume upload validation", () => {
  test("exposes the shared 8 MB limit and rejects empty/oversized uploads", async () => {
    expect(MAX_RESUME_BYTES).toBe(8 * 1024 * 1024);
    await expect(parseResume(new NodeFile([], "resume.pdf") as File)).rejects.toThrow(/empty/);
    await expect(parseResume(new NodeFile([new Uint8Array(MAX_RESUME_BYTES + 1)], "resume.pdf") as File)).rejects.toThrow(/8 MB/);
  });

  test("rejects unsupported extensions and conflicting MIME types", async () => {
    await expect(parseResume(new NodeFile(["resume content"], "resume.txt") as File)).rejects.toThrow(/PDF, DOCX/);
    await expect(parseResume(await fixture("text-resume.pdf", "image/png"))).rejects.toThrow(/type does not match/);
  });

  test("checks actual signatures, not merely filenames", async () => {
    await expect(parseResume(new NodeFile(["<html>not PDF</html>"], "resume.pdf", { type: "application/pdf" }) as File)).rejects.toThrow(/not a valid PDF/);
  });

  test("accepts absent/generic MIME types and case-insensitive extensions", async () => {
    const file = await fixture("text-resume.pdf");
    const result = await parseResume(new NodeFile([await file.arrayBuffer()], "RESUME.PDF", { type: "application/octet-stream" }) as File);
    expect(result.text).toContain("Ada Example");
    expect((await parseResume(await fixture("text-resume.pdf", ""))).text).toContain("Ada Example");
  });
});
