import type { PageSnapshot } from "../types";
import { isElementVisible, queryComposedAll } from "./visibility";

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

export function isFrameHostVisible(element: Element): boolean {
  return isElementVisible(element, { minimumSize: 1 });
}

export async function inspectFrameHosts(doc: Document = document): Promise<FrameCapture["frameHosts"]> {
  const hosts = queryComposedAll<HTMLIFrameElement>(doc, "iframe, frame");
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
