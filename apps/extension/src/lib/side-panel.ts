/**
 * Side panel open/close toggle helpers.
 *
 * Chrome can open the panel via sidePanel.open() (116+) from a keyboard
 * command. Closing is newer (sidePanel.close, 141+). For older Chromium we
 * track the panel via a long-lived port and ask it to window.close().
 */

export const SIDE_PANEL_PORT = "fieldcraft-sidepanel";
export const SIDE_PANEL_TOGGLE_COMMAND = "toggle-side-panel";

export type SidePanelHostMessage =
  | { type: "FIELDCRAFT_SIDEPANEL_READY"; windowId: number }
  | { type: "FIELDCRAFT_SIDEPANEL_CLOSE" };

/**
 * Connect the side panel page to the service worker so the worker knows the
 * panel is open for this window and can request close on toggle.
 */
export function connectSidePanelHost(): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.connect) return;

  void chrome.windows.getCurrent().then((win) => {
    if (win.id == null) return;
    const port = chrome.runtime.connect({ name: SIDE_PANEL_PORT });
    const ready: SidePanelHostMessage = {
      type: "FIELDCRAFT_SIDEPANEL_READY",
      windowId: win.id,
    };
    port.postMessage(ready);
    port.onMessage.addListener((message: SidePanelHostMessage) => {
      if (message?.type === "FIELDCRAFT_SIDEPANEL_CLOSE") {
        window.close();
      }
    });
  });
}

/**
 * Open the side panel. MUST be called from a synchronous (non-async) context
 * during a user gesture — Chrome drops the user-gesture flag across async
 * function boundaries.
 */
export function openSidePanel(windowId: number): void {
  // Must NOT be async — Chrome's user-gesture flag is lost across async
  // boundaries.  .catch() is fine because the registration is synchronous
  // and doesn't break the gesture context.
  chrome.sidePanel.open({ windowId }).catch(() => {});
}

/**
 * Close the side panel via native API or port-driven fallback.
 */
export async function closeSidePanel(
  windowId: number,
  port: chrome.runtime.Port,
): Promise<void> {
  // Chrome 141+: native close. Prefer it so the panel and Chrome UI stay in sync.
  const sidePanelClose = (
    chrome.sidePanel as typeof chrome.sidePanel & {
      close?: (options: { windowId: number }) => Promise<void>;
    }
  ).close;

  if (typeof sidePanelClose === "function") {
    try {
      await sidePanelClose.call(chrome.sidePanel, { windowId });
      return;
    } catch {
      // Fall through to port-driven close if the native call fails.
    }
  }

  try {
    const message: SidePanelHostMessage = { type: "FIELDCRAFT_SIDEPANEL_CLOSE" };
    port.postMessage(message);
  } catch {
    // Port already disconnected — panel is gone.
  }
}

/**
 * Open or close Fieldcraft's side panel in the focused browser window.
 * When no cachedWindowId is available the open call may fail because the
 * async resolution loses the keyboard-command user gesture.
 */
export async function toggleSidePanel(
  openPorts: Map<number, chrome.runtime.Port>,
): Promise<void> {
  const windowId = await resolveFocusedWindowId();
  if (windowId == null) return;

  const openPort = openPorts.get(windowId);
  if (openPort) {
    await closeSidePanel(windowId, openPort);
    return;
  }

  // Gesture may be lost after the await above — callers should use
  // openSidePanel() from a sync context when a gesture is active.
  await chrome.sidePanel.open({ windowId });
}

async function resolveFocusedWindowId(): Promise<number | undefined> {
  try {
    const win = await chrome.windows.getLastFocused({ populate: false });
    if (win.id != null) return win.id;
  } catch {
    // Fall through to active-tab lookup.
  }

  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tab?.windowId;
}
