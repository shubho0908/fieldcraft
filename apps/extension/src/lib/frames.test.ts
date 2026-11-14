import { afterEach, describe, expect, it, vi } from "vitest";
import { captureTabFrames, fillTabFrames, mergeFrameSnapshots, namespaceFrameSnapshot } from "./frames";
import { Confidence, PageFieldKind, SuggestionAction } from "./enums";
import type { FieldSuggestion, PageSnapshot } from "../types";

const topUrl = "https://careers.example.test/role";
const childUrl = "https://forms.other.test/application";
const snapshot = (url = topUrl): PageSnapshot => ({
  title: "Careers", url, hostname: new URL(url).hostname, ats: "Generic", capturedAt: "now", headings: ["Apply"], pageText: "Unique job description",
  jobDescriptionDetected: true, jobDescriptionSource: "article", jobDescriptionText: "Unique job description",
  fields: [{ id: "same-local-id", kind: PageFieldKind.Text, type: "text", name: "name", label: "Full name", placeholder: "", ariaLabel: "", section: "", required: true, sensitive: false, currentValue: "", maxLength: null, options: [] }],
});
const navigation = [
  { frameId: 0, parentFrameId: -1, url: topUrl, documentId: "browser-top" },
  { frameId: 7, parentFrameId: 0, url: childUrl, documentId: "browser-child" },
];
const captures = [
  { ...navigation[0], documentId: "content-top", snapshot: snapshot(), frameHosts: [{ documentId: "content-child", visible: true }] },
  { ...navigation[1], documentId: "content-child", snapshot: snapshot(childUrl), frameHosts: [] },
];
const suggestion = (fieldId: string): FieldSuggestion => ({ fieldId, label: "Full name", action: SuggestionAction.Fill, value: "Ada Example", confidence: Confidence.High, evidence: "Saved profile", warning: "" });

function browser() {
  const sendMessage = vi.fn(async (_tabId: number, request: any, target: { frameId: number }) => {
    const capture = captures.find((frame) => frame.frameId === target.frameId)!;
    if (request.type === "FIELDCRAFT_CAPTURE") return { ok: true, ...capture };
    if (request.type === "FIELDCRAFT_VALIDATE_DOCUMENT") return { ok: request.documentId === capture.documentId && request.url === capture.snapshot.url, frameHosts: capture.frameHosts };
    return { ok: true, results: request.suggestions.map((item: FieldSuggestion) => ({ fieldId: item.fieldId, status: "filled", message: "Filled" })) };
  });
  const getAllFrames = vi.fn(async () => navigation);
  vi.stubGlobal("chrome", { tabs: { sendMessage }, webNavigation: { getAllFrames } });
  return { sendMessage, getAllFrames };
}

afterEach(() => vi.unstubAllGlobals());

describe("frame capture", () => {
  it("namespaces identical local field IDs by their actual frame without changing the top URL", async () => {
    const { sendMessage } = browser();
    const result = await captureTabFrames(12, topUrl);
    expect(result.url).toBe(topUrl);
    expect(result.fields.map((field) => field.id)).toEqual(["frame-0:same-local-id", "frame-7:same-local-id"]);
    expect(result.fields[1]).toMatchObject({ frameId: 7, frameUrl: childUrl });
    expect(result.frames).toEqual([{ frameId: 0, url: topUrl, documentId: "content-top" }, { frameId: 7, url: childUrl, documentId: "content-child" }]);
    expect(result.pageText).toBe("Unique job description");
    expect(result.jobDescriptionText).toBe("Unique job description");
    expect(sendMessage.mock.calls.map((call) => call[2])).toEqual([{ frameId: 0 }, { frameId: 7 }]);
  });

  it("does not silently fall back to a single frame when discovery is unavailable", async () => {
    vi.stubGlobal("chrome", { tabs: { sendMessage: vi.fn() } });
    await expect(captureTabFrames(12, topUrl)).rejects.toThrow(/Frame discovery is unavailable/);
  });

  it("warns explicitly when an embedded frame cannot be captured", async () => {
    const { sendMessage } = browser();
    sendMessage.mockImplementationOnce(async () => ({ ok: true, ...captures[0] }));
    sendMessage.mockImplementationOnce(async () => { throw new Error("No receiving end"); });
    const result = await captureTabFrames(12, topUrl);
    expect(result.fields).toHaveLength(1);
    expect(result.captureWarnings).toEqual([expect.stringContaining("its fields were not captured")]);
  });

  it("excludes fields in hidden frame hosts, even when their own document controls are visible", async () => {
    const { sendMessage } = browser();
    sendMessage.mockImplementationOnce(async () => ({ ok: true, ...captures[0], frameHosts: [{ documentId: "content-child", visible: false }] }));
    const result = await captureTabFrames(12, topUrl);
    expect(result.fields.map((field) => field.frameId)).toEqual([0]);
    expect(result.captureWarnings).toEqual([]);
  });

  it("rejects a same-URL top reload during capture", async () => {
    const { getAllFrames } = browser();
    getAllFrames.mockResolvedValueOnce(navigation).mockResolvedValueOnce([{ ...navigation[0], documentId: "new-browser-top" }, navigation[1]]);
    await expect(captureTabFrames(12, topUrl)).rejects.toThrow(/document changed/);
  });

  it("retains an explicit iframe JD when the top page only has application context", () => {
    const top = { ...captures[0], snapshot: { ...snapshot(), jobDescriptionDetected: false, jobDescriptionText: "", jobDescriptionSource: "" } };
    const result = mergeFrameSnapshots(top, [captures[1]], []);
    expect(result.jobDescriptionDetected).toBe(true);
    expect(result.jobDescriptionText).toBe("Unique job description");
    expect(result.url).toBe(topUrl);
  });
});

describe("frame fills", () => {
  it("sends only selected suggestions to their own document using local field IDs", async () => {
    const { sendMessage } = browser();
    const captured = await captureTabFrames(12, topUrl);
    sendMessage.mockClear();
    const assertCurrent = vi.fn(async () => {});
    const result = await fillTabFrames(12, captured, [suggestion("frame-7:same-local-id")], assertCurrent);
    const fills = sendMessage.mock.calls.filter((call) => call[1].type === "FIELDCRAFT_FILL");
    expect(fills).toHaveLength(1);
    expect(fills[0]).toEqual([12, { type: "FIELDCRAFT_FILL", suggestions: [suggestion("same-local-id")], selectedFieldIds: ["same-local-id"], url: childUrl, documentId: "content-child" }, { frameId: 7 }]);
    expect(result).toEqual([{ fieldId: "frame-7:same-local-id", status: "filled", message: "Filled" }]);
    expect(assertCurrent).toHaveBeenCalledTimes(2);
  });

  it("writes nothing if a selected iframe has reloaded at the same URL", async () => {
    const { sendMessage } = browser();
    const captured = await captureTabFrames(12, topUrl);
    captured.frames![1].documentId = "old-content-document";
    await expect(fillTabFrames(12, captured, [suggestion("frame-0:same-local-id"), suggestion("frame-7:same-local-id")], async () => {})).rejects.toThrow(/document changed/);
    expect(sendMessage.mock.calls.filter((call) => call[1].type === "FIELDCRAFT_FILL")).toEqual([]);
  });

  it("rejects stale top documents even for iframe-only fills", async () => {
    const { sendMessage } = browser();
    const captured = await captureTabFrames(12, topUrl);
    captured.frames![0].documentId = "previous-top-document";
    await expect(fillTabFrames(12, captured, [suggestion("frame-7:same-local-id")], async () => {})).rejects.toThrow(/document changed/);
    expect(sendMessage.mock.calls.filter((call) => call[1].type === "FIELDCRAFT_FILL")).toEqual([]);
  });

  it("rejects unqualified or foreign IDs instead of guessing a target frame", async () => {
    browser();
    const captured = await captureTabFrames(12, topUrl);
    await expect(fillTabFrames(12, captured, [suggestion("same-local-id")], async () => {})).rejects.toThrow(/not part/);
    expect(namespaceFrameSnapshot(7, snapshot()).fields[0].id).toBe("frame-7:same-local-id");
  });
});
