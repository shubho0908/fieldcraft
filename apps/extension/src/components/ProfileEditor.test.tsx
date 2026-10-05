import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfileEditor from "./ProfileEditor";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from "../lib/defaults";
import { AutofillMode } from "../lib/enums";
import { parseResume } from "../lib/resume-parser";

vi.mock("../lib/resume-parser", () => ({ MAX_RESUME_BYTES: 8 * 1024 * 1024, parseResume: vi.fn() }));
let root: Root;
let container: HTMLDivElement;
const oldText = "Previous employment and education. ".repeat(6);
const onSaved = vi.fn();

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const area = { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) };
  vi.stubGlobal("chrome", { storage: { local: area, session: area }, runtime: { getManifest: () => ({ version: "test" }) } });
  vi.mocked(parseResume).mockReset();
  onSaved.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const profile = structuredClone(DEFAULT_PROFILE);
  profile.identity.fullName = "Asha";
  profile.identity.email = "asha@example.com";
  profile.resumeText = oldText;
  profile.resumeAttachment = { name: "previous.pdf", mimeType: "application/pdf", size: 3, dataUrl: "data:application/pdf;base64,b2xk" };
  await act(async () => root.render(<ProfileEditor initialProfile={profile} initialSettings={{ ...DEFAULT_SETTINGS, autofillMode: AutofillMode.Direct }} onboarding apiKeyExists={false} exaApiKeyExists={false} onSaved={onSaved} />));
  await click("Continue");
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function button(text: string) { return Array.from(container.querySelectorAll("button")).find(b => b.textContent?.includes(text))!; }
async function click(text: string) { await act(async () => button(text).click()); }
async function upload() {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Upload resume"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["new bytes"], "replacement.pdf", { type: "application/pdf" })] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}
async function finish() { await click("Continue"); await click("Continue"); await click("Finish setup"); }

describe("resume upload transaction", () => {
  it("keeps the previous candidate truth and original attachment when parsing fails", async () => {
    vi.mocked(parseResume).mockRejectedValue(new Error("Encrypted document"));
    await upload();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Encrypted document");
    expect(container.querySelector<HTMLTextAreaElement>(".resume-textarea")?.value).toBe(oldText);
    await finish();
    const saved = onSaved.mock.calls[0][0];
    expect(saved.resumeText).toBe(oldText);
    expect(saved.resumeAttachment.name).toBe("previous.pdf");
  });

  it("blocks navigation during extraction and commits the new text and file together", async () => {
    let resolve!: (value: { text: string; warnings: string[] }) => void;
    vi.mocked(parseResume).mockReturnValue(new Promise(done => { resolve = done; }));
    await upload();
    expect(button("Continue").disabled).toBe(true);
    expect(button("Back").disabled).toBe(true);
    expect(container.querySelector<HTMLTextAreaElement>(".resume-textarea")?.value).toBe(oldText);
    const text = "EXPERIENCE\nSenior Engineer, Example Co\nBuilt services for 200 customers and reduced processing time by 35 percent.\n\nEDUCATION\nBSc Computer Science, 2020";
    await act(async () => {
      resolve({ text, warnings: ["Review OCR accuracy."] });
      await new Promise(done => setTimeout(done, 20));
    });
    expect(button("Continue").disabled).toBe(false);
    expect(container.querySelector<HTMLTextAreaElement>(".resume-textarea")?.value).toBe(text);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Review OCR accuracy.");
    await finish();
    const saved = onSaved.mock.calls[0][0];
    expect(saved.resumeText).toBe(text);
    expect(saved.resumeAttachment.name).toBe("replacement.pdf");
    expect(atob(saved.resumeAttachment.dataUrl.split(",")[1])).toBe("new bytes");
  });
});
