/**
 * Side panel open/close helpers.
 *
 * Chrome can open the panel via sidePanel.open() (116+) from a user gesture.
 * Closing is newer (sidePanel.close, 141+). For older Chromium we track the
 * panel via a long-lived port and ask it to window.close().
 *
 * Fieldcraft binds the panel to a single tab: the side panel is only enabled
 * for the tab it is working with, so switching tabs hides it and returning to
 * that tab automatically shows it again.
 */

import { getPanelBoundTab } from "./storage";

export const SIDE_PANEL_PORT = "fieldcraft-sidepanel";
export const SIDE_PANEL_TOGGLE_COMMAND = "toggle-side-panel";

export type SidePanelHostMessage =
  | { type: "FIELDCRAFT_SIDEPANEL_READY"; windowId: number; tabId: number }
  | { type: "FIELDCRAFT_SIDEPANEL_CLOSE" };

/**
 * Connect the side panel page to the service worker so the worker knows the
 * panel is open for this window and tab and can request close on toggle.
 */
export function connectSidePanelHost(): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.connect) return;

  const port = chrome.runtime.connect({ name: SIDE_PANEL_PORT });

  port.onMessage.addListener((message: SidePanelHostMessage) => {
    if (message?.type === "FIELDCRAFT_SIDEPANEL_CLOSE") {
      window.close();
    }
  });

  void chrome.windows.getCurrent().then(async (win) => {
    if (win.id == null) return;
    const bound = await getPanelBoundTab(win.id).catch(() => null);
    const ready: SidePanelHostMessage = {
      type: "FIELDCRAFT_SIDEPANEL_READY",
      windowId: win.id,
      tabId: bound?.tabId ?? -1,
    };
    port.postMessage(ready);
  });
}

/**
 * Open the side panel bound to a specific tab. MUST be called from a
 * synchronous (non-async) context during a user gesture — Chrome drops the
 * user-gesture flag across async function boundaries.
 *
 * We set the tab-specific options immediately before opening so the panel is
 * tied to `tabId` rather than every tab in the window.
 */
export function openPanelForTab(tabId: number, windowId: number): void {
  // setOptions does not need a user gesture, but open() does. Fire both in
  // the same synchronous block so the gesture is still valid for open().
  void chrome.sidePanel
    .setOptions({ tabId, path: "sidepanel.html", enabled: true })
    .catch(() => {});
  chrome.sidePanel.open({ tabId, windowId }).catch(() => {});
}

/**
 * Close the side panel for a specific tab via the native API, a port-driven
 * fallback, or by disabling the tab-specific panel so Chrome hides it.
 */
export async function closePanelForTab(
  tabId: number,
  windowId: number,
  port?: chrome.runtime.Port,
): Promise<void> {
  const sidePanelClose = (
    chrome.sidePanel as typeof chrome.sidePanel & {
      close?: (options: { tabId?: number; windowId?: number }) => Promise<void>;
    }
  ).close;

  if (typeof sidePanelClose === "function") {
    try {
      await sidePanelClose.call(chrome.sidePanel, { tabId, windowId });
      return;
    } catch {
      // Fall through to port-driven / setOptions fallback.
    }
  }

  if (port) {
    try {
      const message: SidePanelHostMessage = { type: "FIELDCRAFT_SIDEPANEL_CLOSE" };
      port.postMessage(message);
    } catch {
      // Port already disconnected.
    }
  }

  await chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {});
}
