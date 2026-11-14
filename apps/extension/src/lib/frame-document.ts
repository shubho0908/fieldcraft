import type { PageSnapshot } from "../types";

export type FrameContentRequest =
  | { type: "FIELDCRAFT_VALIDATE_DOCUMENT"; url: string; documentId: string }
  | { type: "FIELDCRAFT_FILL"; suggestions: import("../types").FieldSuggestion[]; selectedFieldIds: string[]; url: string; documentId: string };

export interface FrameCapture {
  snapshot: PageSnapshot;
  documentId: string;
  frameHosts: Array<{ documentId: string; visible: boolean }>;
}

const PROBE = "FIELDCRAFT_FRAME_PROBE";
const ACK = "FIELDCRAFT_FRAME_ACK";

export function installFrameProbe(documentId: string, win: Window = window): void {
  win.addEventListener("message", (event) => {
    if (event.source !== win.parent || event.data?.type !== PROBE || typeof event.data.nonce !== "string") return;
    win.parent.postMessage({ type: ACK, nonce: event.data.nonce, documentId }, "*");
  });
}

function frameElements(root: Document | ShadowRoot): HTMLIFrameElement[] {
  const frames = Array.from(root.querySelectorAll<HTMLIFrameElement>("iframe, frame"));
  for (const element of root.querySelectorAll("*")) {
    if (element.shadowRoot) frames.push(...frameElements(element.shadowRoot));
  }
  return frames;
}

export function isFrameHostVisible(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    const style = current.ownerDocument.defaultView!.getComputedStyle(current);
    if (current.hasAttribute("hidden") || current.hasAttribute("inert") || current.getAttribute("aria-hidden") === "true" || style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0) return false;
    const rect = current.getBoundingClientRect();
    if ((style.overflow === "hidden" || style.overflow === "clip") && (!rect.width || !rect.height)) return false;
    current = current.parentElement ?? (current.getRootNode() instanceof ShadowRoot ? (current.getRootNode() as ShadowRoot).host : null);
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1 && rect.right > 0 && rect.bottom > 0;
}

export async function inspectFrameHosts(doc: Document = document): Promise<FrameCapture["frameHosts"]> {
  const hosts = frameElements(doc);
  if (!hosts.length) return [];
  const win = doc.defaultView!;
  const pending = new Map(hosts.map((host) => [crypto.randomUUID(), host]));
  const results: FrameCapture["frameHosts"] = [];
  await new Promise<void>((resolve) => {
    const finish = () => {
      win.removeEventListener("message", receive);
      win.clearTimeout(timer);
      resolve();
    };
    const receive = (event: MessageEvent) => {
      const host = pending.get(event.data?.nonce);
      if (!host || event.source !== host.contentWindow || event.data?.type !== ACK || typeof event.data.documentId !== "string") return;
      results.push({ documentId: event.data.documentId, visible: isFrameHostVisible(host) });
      pending.delete(event.data.nonce);
      if (!pending.size) finish();
    };
    const timer = win.setTimeout(finish, 300);
    win.addEventListener("message", receive);
    for (const [nonce, host] of pending) host.contentWindow?.postMessage({ type: PROBE, nonce }, "*");
  });
  return results;
}
