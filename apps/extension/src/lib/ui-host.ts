/**
 * UI host abstraction for cross-browser extension surfaces.
 *
 * Chrome uses the native `chrome.sidePanel` API.
 * Safari (and any browser without sidePanel) uses a content-script injected
 * overlay iframe that loads the same `sidepanel.html` React app.
 */

export type UiHostType = "sidepanel" | "overlay";

const HOST_PARAM = "host";

export function getUiHostType(): UiHostType {
  if (typeof window === "undefined") return "sidepanel";
  const params = new URLSearchParams(window.location.search);
  const host = params.get(HOST_PARAM);
  if (host === "overlay") return "overlay";
  // Side panel pages are loaded without the overlay query parameter.
  return "sidepanel";
}

export function isOverlayHost(): boolean {
  return getUiHostType() === "overlay";
}

export function isSidePanelHost(): boolean {
  return getUiHostType() === "sidepanel";
}

export function sidePanelApi() {
  return (typeof chrome !== "undefined" && "sidePanel" in chrome)
    ? (chrome as typeof chrome & { sidePanel: typeof chrome.sidePanel }).sidePanel
    : undefined;
}

export function isSidePanelApiSupported(): boolean {
  return typeof sidePanelApi() !== "undefined";
}

export function notificationsApi() {
  return (typeof chrome !== "undefined" && "notifications" in chrome)
    ? (chrome as typeof chrome & { notifications: typeof chrome.notifications }).notifications
    : undefined;
}

export function isNotificationsApiSupported(): boolean {
  return typeof notificationsApi() !== "undefined";
}

export function sessionStorageApi() {
  return (typeof chrome !== "undefined" && "storage" in chrome && "session" in chrome.storage)
    ? chrome.storage.session
    : undefined;
}

export function isSessionStorageSupported(): boolean {
  return typeof sessionStorageApi() !== "undefined";
}

export function closeHost(): void {
  if (isOverlayHost()) {
    // Ask the background to instruct the content script to hide this overlay.
    void chrome.runtime.sendMessage({ type: "FIELDCRAFT_OVERLAY_CLOSE" }).catch(() => {});
    return;
  }

  // Side panel: native close is best-effort; fall back to window.close().
  const sidePanel = sidePanelApi();
  if (sidePanel && "close" in sidePanel) {
    void (sidePanel as typeof sidePanel & { close: (options: { windowId: number }) => Promise<void> }).close({ windowId: -1 });
  } else {
    window.close();
  }
}

export async function sendToggleOverlayToTab(tabId: number): Promise<{ ok: boolean; open?: boolean; error?: string }> {
  try {
    return (await chrome.tabs.sendMessage(tabId, { type: "FIELDCRAFT_TOGGLE_OVERLAY" })) as {
      ok: boolean;
      open?: boolean;
      error?: string;
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function toggleOverlayOnActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await sendToggleOverlayToTab(tab.id);
}

export async function hideOverlayOnActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "FIELDCRAFT_HIDE_OVERLAY" });
  } catch {
    // Tab may not have the overlay content script (e.g., internal pages).
  }
}
