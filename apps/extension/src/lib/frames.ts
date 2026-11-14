import type { FieldSuggestion, FillResult, PageSnapshot } from "../types";
import type { FrameCapture } from "./frame-document";

type NavigationFrame = { frameId: number; parentFrameId: number; url: string; documentId?: string };
type CapturedFrame = NavigationFrame & FrameCapture;

async function navigationFrames(tabId: number): Promise<NavigationFrame[]> {
  if (typeof chrome.webNavigation?.getAllFrames !== "function") {
    throw new Error("This browser cannot safely inspect embedded forms. Frame discovery is unavailable; try a supported browser.");
  }
  const frames = await chrome.webNavigation.getAllFrames({ tabId });
  if (!frames?.some((frame) => frame.frameId === 0)) throw new Error("Could not identify the page document. Reload and review again.");
  return frames;
}

export function namespaceFrameSnapshot(frameId: number, snapshot: PageSnapshot): PageSnapshot {
  return {
    ...snapshot,
    fields: snapshot.fields.map((field) => ({ ...field, id: `frame-${frameId}:${field.id}`, frameId, frameUrl: snapshot.url })),
  };
}

export function mergeFrameSnapshots(top: CapturedFrame, embedded: CapturedFrame[], warnings: string[]): PageSnapshot {
  const frames = [top, ...embedded];
  const deduplicate = (values: string[]) => {
    const chunks: string[] = [];
    for (const text of values.map((value) => value.trim()).filter(Boolean)) {
      if (chunks.some((chunk) => chunk.includes(text))) continue;
      for (let index = chunks.length - 1; index >= 0; index--) if (text.includes(chunks[index])) chunks.splice(index, 1);
      chunks.push(text);
    }
    return chunks;
  };
  const descriptions = deduplicate(frames.filter((frame) => frame.snapshot.jobDescriptionDetected === true).map((frame) => frame.snapshot.jobDescriptionText ?? ""));
  const description = descriptions.join("\n\n");
  const contexts = deduplicate(frames.map((frame) => descriptions.reduce((text, jd) => text.replaceAll(jd, ""), frame.snapshot.pageText)));
  const context = contexts.join("\n\n--- EMBEDDED FRAME ---\n\n");
  const contextBudget = description ? 20_000 : 60_000;
  if (description.length > 40_000 || context.length > contextBudget) warnings.push("Page and embedded form text exceeded the context budget; some text was omitted. Captured fields are retained for review.");
  const pageText = [description.slice(0, 40_000), context.slice(0, contextBudget)].filter(Boolean).join("\n\n");
  const hints = frames.flatMap((frame) => frame.snapshot.companyHints ? [frame.snapshot.companyHints] : []);
  const names = new Set(hints.flatMap((hint) => hint.structuredNames.length ? hint.structuredNames : hint.metadataNames).map((name) => name.toLowerCase().trim()));
  if (names.size > 1) warnings.push("Company identity differs across embedded documents. Conflicting company hints were omitted; verify the employer before relying on research.");
  const companyHints = names.size > 1 ? { structuredNames: [], metadataNames: [], officialDomains: [] } : {
    structuredNames: [...new Set(hints.flatMap((hint) => hint.structuredNames))],
    metadataNames: [...new Set(hints.flatMap((hint) => hint.metadataNames))],
    officialDomains: [...new Set(hints.flatMap((hint) => hint.officialDomains))],
  };
  return {
    ...top.snapshot,
    companyHints,
    jobDescriptionDetected: frames.some((frame) => frame.snapshot.jobDescriptionDetected === true),
    jobDescriptionSource: [...new Set(frames.filter((frame) => frame.snapshot.jobDescriptionDetected).map((frame) => frame.snapshot.jobDescriptionSource || frame.snapshot.url))].join("; "),
    jobDescriptionText: description.slice(0, 40_000),
    headings: [...new Set(frames.flatMap((frame) => frame.snapshot.headings))],
    fields: frames.flatMap((frame) => namespaceFrameSnapshot(frame.frameId, frame.snapshot).fields),
    pageText: pageText.slice(0, 60_000),
    frames: frames.map((frame) => ({ frameId: frame.frameId, url: frame.snapshot.url, documentId: frame.documentId })),
    captureWarnings: [...new Set([...frames.flatMap((frame) => frame.snapshot.captureWarnings ?? []), ...warnings])],
  };
}

export async function captureTabFrames(tabId: number, topUrl: string): Promise<PageSnapshot> {
  const frames = await navigationFrames(tabId);
  const responses = await Promise.allSettled(frames.map(async (frame): Promise<CapturedFrame> => {
    const response = await chrome.tabs.sendMessage(tabId, { type: "FIELDCRAFT_CAPTURE" }, { frameId: frame.frameId });
    if (!response?.ok || !response.documentId || !response.snapshot || response.snapshot.url !== frame.url) throw new Error("The frame could not be read or changed during capture");
    return { ...frame, ...response };
  }));
  const topIndex = frames.findIndex((frame) => frame.frameId === 0);
  const topResult = responses[topIndex];
  if (topResult.status !== "fulfilled") throw new Error("Reload the job page once so Fieldcraft can read its top document, then try again.");
  const top = topResult.value;
  if (top.snapshot.url !== topUrl) throw new Error("The page changed while Fieldcraft was reading it. Review the current page again.");
  const current = await navigationFrames(tabId);
  const warnings: string[] = [];
  const included = new Map<number, CapturedFrame>([[0, top]]);
  const excluded = new Set<number>();
  const pending = frames.filter((frame) => frame.frameId !== 0);
  while (pending.length) {
    const index = pending.findIndex((frame) => included.has(frame.parentFrameId) || excluded.has(frame.parentFrameId));
    if (index < 0) {
      warnings.push("Some embedded frames could not be associated with a visible parent and were not captured.");
      break;
    }
    const [frame] = pending.splice(index, 1);
    if (excluded.has(frame.parentFrameId)) { excluded.add(frame.frameId); continue; }
    const response = responses[frames.indexOf(frame)];
    const parent = included.get(frame.parentFrameId)!;
    const captured = response.status === "fulfilled" ? response.value : undefined;
    const host = captured && parent.frameHosts.find((item) => item.documentId === captured.documentId);
    if (host && !host.visible) { excluded.add(frame.frameId); continue; }
    const active = current.find((item) => item.frameId === frame.frameId);
    if (!captured || !host || !active || active.url !== frame.url || active.documentId !== frame.documentId) {
      excluded.add(frame.frameId);
      warnings.push(`Embedded frame ${frame.frameId} (${frame.url}) was inaccessible or changed; its fields were not captured. Open the form directly and review it there.`);
      continue;
    }
    included.set(frame.frameId, captured);
  }
  const activeTop = current.find((frame) => frame.frameId === 0);
  if (!activeTop || activeTop.url !== topUrl || frames[topIndex].documentId !== activeTop.documentId) {
    throw new Error("The page document changed during capture. Review it again.");
  }
  return mergeFrameSnapshots(top, [...included.values()].filter((frame) => frame.frameId !== 0), warnings);
}

async function validateFrame(tabId: number, frame: NonNullable<PageSnapshot["frames"]>[number]): Promise<FrameCapture["frameHosts"]> {
  if (!frame.documentId) throw new Error("The captured document is missing. Review the page again.");
  const response = await chrome.tabs.sendMessage(tabId, { type: "FIELDCRAFT_VALIDATE_DOCUMENT", url: frame.url, documentId: frame.documentId }, { frameId: frame.frameId });
  if (!response?.ok) throw new Error("An application frame document changed. Review the current page again.");
  return response.frameHosts ?? [];
}

async function validateTargets(tabId: number, snapshot: PageSnapshot, targets: NonNullable<PageSnapshot["frames"]>): Promise<void> {
  const current = await navigationFrames(tabId);
  const required = new Set<number>([0]);
  for (const target of targets) {
    let id = target.frameId;
    while (id !== -1 && !required.has(id)) {
      required.add(id);
      const frame = current.find((item) => item.frameId === id);
      if (!frame) throw new Error("An embedded frame was removed. Review the page again.");
      id = frame.parentFrameId;
    }
  }
  const checked = await Promise.all([...required].map(async (id) => {
    const frame = snapshot.frames!.find((item) => item.frameId === id);
    const active = current.find((item) => item.frameId === id);
    if (!frame || frame.url !== active?.url) throw new Error("An application frame changed. Review the current page again.");
    return { frame, hosts: await validateFrame(tabId, frame) };
  }));
  for (const { frame } of checked) {
    if (frame.frameId === 0) continue;
    const parentId = current.find((item) => item.frameId === frame.frameId)!.parentFrameId;
    const host = checked.find((item) => item.frame.frameId === parentId)?.hosts.find((item) => item.documentId === frame.documentId);
    if (!host?.visible) throw new Error("The embedded form is hidden or inaccessible. Open it and review the page again.");
  }
}

export async function fillTabFrames(tabId: number, snapshot: PageSnapshot, suggestions: FieldSuggestion[], assertCurrent: () => Promise<void>): Promise<FillResult[]> {
  const top = snapshot.frames?.find((frame) => frame.frameId === 0);
  if (!top) throw new Error("Frame capture information is missing. Review the page again before filling.");
  const groups = new Map<number, FieldSuggestion[]>();
  for (const suggestion of suggestions) {
    const field = snapshot.fields.find((item) => item.id === suggestion.fieldId);
    if (!field || field.frameId === undefined || !field.id.startsWith(`frame-${field.frameId}:`)) throw new Error("The reviewed field is not part of this captured document.");
    groups.set(field.frameId, [...groups.get(field.frameId) ?? [], suggestion]);
  }
  const targets = [...groups.keys()].map((id) => {
    const frame = snapshot.frames!.find((item) => item.frameId === id);
    if (!frame) throw new Error("The captured frame is missing. Review the page again.");
    return frame;
  });
  await assertCurrent();
  await validateTargets(tabId, snapshot, targets);
  const results: FillResult[] = [];
  for (const frame of targets) {
    await assertCurrent();
    await validateTargets(tabId, snapshot, [frame]);
    const original = groups.get(frame.frameId)!;
    const local = original.map((item) => ({ ...item, fieldId: item.fieldId.slice(`frame-${frame.frameId}:`.length) }));
    const response = await chrome.tabs.sendMessage(tabId, { type: "FIELDCRAFT_FILL", suggestions: local, selectedFieldIds: local.map((item) => item.fieldId), url: frame.url, documentId: frame.documentId }, { frameId: frame.frameId });
    if (!response?.ok || !Array.isArray(response.results)) throw new Error(response?.error || "Could not fill the reviewed frame. Review the page again.");
    for (const item of response.results as FillResult[]) {
      if (!local.some((suggestion) => suggestion.fieldId === item.fieldId)) throw new Error("The frame returned an unknown field result.");
      results.push({ ...item, fieldId: `frame-${frame.frameId}:${item.fieldId}` });
    }
  }
  return results;
}
