export {};

const OVERLAY_ID = "fieldcraft-overlay-host";

function getOverlayUrl(): string {
  return chrome.runtime.getURL("sidepanel.html?host=overlay");
}

function createOverlay(): HTMLIFrameElement {
  let iframe = document.getElementById(OVERLAY_ID) as HTMLIFrameElement | null;
  if (iframe) return iframe;

  iframe = document.createElement("iframe");
  iframe.id = OVERLAY_ID;
  iframe.src = getOverlayUrl();
  iframe.setAttribute(
    "style",
    [
      "all: initial !important",
      "position: fixed !important",
      "top: 0 !important",
      "right: 0 !important",
      "left: auto !important",
      "bottom: auto !important",
      "margin: 0 !important",
      "padding: 0 !important",
      "width: 400px !important",
      "max-width: 100vw !important",
      "height: 100vh !important",
      "height: 100dvh !important",
      "border: none !important",
      "z-index: 2147483646 !important",
      "box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12) !important",
      "background: #f7f6f2 !important",
    ].join("; "),
  );

  // Block the iframe from receiving focus until the user explicitly opens it.
  iframe.style.setProperty("display", "none", "important");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "Fieldcraft");

  document.documentElement.appendChild(iframe);
  return iframe;
}

function showOverlay(): HTMLIFrameElement {
  const iframe = createOverlay();
  iframe.style.setProperty("display", "block", "important");
  iframe.setAttribute("aria-hidden", "false");
  return iframe;
}

function hideOverlay(): void {
  const iframe = document.getElementById(OVERLAY_ID) as HTMLIFrameElement | null;
  if (!iframe) return;
  iframe.style.setProperty("display", "none", "important");
  iframe.setAttribute("aria-hidden", "true");
}

function toggleOverlay(): boolean {
  const iframe = document.getElementById(OVERLAY_ID) as HTMLIFrameElement | null;
  if (!iframe) {
    showOverlay();
    return true;
  }

  const isHidden = iframe.style.display === "none";
  if (isHidden) {
    showOverlay();
    return true;
  }
  hideOverlay();
  return false;
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.type === "FIELDCRAFT_TOGGLE_OVERLAY") {
    try {
      const open = toggleOverlay();
      sendResponse({ ok: true, open });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (request?.type === "FIELDCRAFT_HIDE_OVERLAY") {
    try {
      hideOverlay();
      sendResponse({ ok: true });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  return false;
});
