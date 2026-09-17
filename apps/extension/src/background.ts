import { isAnalyzableTabUrl } from "./lib/page";
import {
  getNotificationUrl,
  runReleaseCheck,
  showUpdateNotification,
} from "./lib/release-check";
import { analyzeJob, testAiConnection } from "./lib/openai";
import { testExaConnection } from "./lib/exa";
import {
  SIDE_PANEL_PORT,
  SIDE_PANEL_TOGGLE_COMMAND,
  type SidePanelHostMessage,
  closeSidePanel,
  openSidePanel,
  toggleSidePanel,
} from "./lib/side-panel";
import {
  isNotificationsApiSupported,
  isSidePanelApiSupported,
  toggleOverlayOnActiveTab,
  sendToggleOverlayToTab,
} from "./lib/ui-host";
import {
  clearTabSessionsIfSessionStorageMissing,
  getExaApiKey,
  getProfile,
  getSettings,
  getTabAnalysisSession,
  mutateTabAnalysisSessions,
  removeTabAnalysisSession,
} from "./lib/storage";
import {
  canUpdateRun,
  createAnalysisSession,
  withCompletedAnalysis,
} from "./lib/tab-sessions";
import type {
  FillResult,
  PageSnapshot,
  ResolvedActiveTab,
  RuntimeRequest,
  TabAnalysisSession,
} from "./types";

/** Live side-panel ports keyed by browser windowId. */
const sidePanelPorts = new Map<number, chrome.runtime.Port>();

const RELEASE_CHECK_ALARM = "fieldcraft-release-check";

// Only configure the native side panel on browsers that support it (Chrome/Edge).
// Safari uses a content-script overlay instead.
if (isSidePanelApiSupported()) {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

// An MV3 worker can be terminated only when no event is keeping it alive. If
// that happens, an in-flight network/DOM operation cannot be resumed safely;
// surface a retry state rather than leaving a tab on an endless spinner.
void recoverInterruptedTabRuns();

chrome.runtime.onInstalled.addListener(() => {
  if (isSidePanelApiSupported()) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
  // Allow content scripts and extension pages (including the overlay iframe)
  // to share session storage. Safari requires this explicit access grant.
  if (chrome.storage.session && "setAccessLevel" in chrome.storage.session) {
    void chrome.storage.session.setAccessLevel({
      accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
    });
  }
  // Older Safari falls back to chrome.storage.local for tab sessions, which
  // survives browser restarts. Clear stale sessions on startup/install.
  void clearTabSessionsIfSessionStorageMissing();
  void initReleaseChecker();
});

chrome.runtime.onStartup.addListener(() => {
  // Ensure local-storage tab-session fallback is reset across browser restarts.
  void clearTabSessionsIfSessionStorageMissing();
  void initReleaseChecker();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RELEASE_CHECK_ALARM) {
    void runReleaseCheck().then((release) => {
      if (release) showUpdateNotification(release);
    });
  }
});

if (isNotificationsApiSupported()) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    void (async () => {
      const url = await getNotificationUrl(notificationId);
      if (url) {
        void chrome.tabs.create({ url });
        await chrome.notifications.clear(notificationId);
      }
    })();
  });
}

// --- last-focused window cache for toggle-side-panel ---
//
// chrome.sidePanel.open() must be called from a SYNCHRONOUS (non-async)
// context — Chrome drops the user-gesture flag across async function
// boundaries.  Caching the windowId lets us call openSidePanel() directly
// in the command listener, preserving the gesture.
// Safari does not implement chrome.windows, so this is gated.
let _lastFocusedWindowId: number | undefined;

if (typeof chrome !== "undefined" && "windows" in chrome) {
  chrome.windows.getLastFocused({ populate: false }).then((win) => {
    _lastFocusedWindowId = win.id;
  });

  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
      _lastFocusedWindowId = windowId;
    }
  });
}

// Ctrl+Shift+F (Windows) / Option+F (macOS) — open or close the Fieldcraft panel.
// On Chrome/Edge this uses the native side panel. On Safari (and any browser
// without chrome.sidePanel) it toggles a content-script overlay iframe.
chrome.commands.onCommand.addListener((command) => {
  if (command !== SIDE_PANEL_TOGGLE_COMMAND) return;

  if (!isSidePanelApiSupported()) {
    void toggleOverlayOnActiveTab();
    return;
  }

  const windowId = _lastFocusedWindowId;
  if (windowId == null) {
    // Cache not ready — try async toggle (close still works via port fallback).
    void toggleSidePanel(sidePanelPorts);
    return;
  }

  const openPort = sidePanelPorts.get(windowId);
  if (openPort) {
    void closeSidePanel(windowId, openPort);
  } else {
    // Synchronous call preserves the keyboard-command user gesture.
    openSidePanel(windowId);
  }
});

// Toolbar icon click on browsers without a native side panel toggles the overlay.
if (!isSidePanelApiSupported()) {
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id != null) void sendToggleOverlayToTab(tab.id);
  });
}

// Side panel documents check in while open so we can close them on toggle.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== SIDE_PANEL_PORT) return;

  let windowId: number | undefined;

  port.onMessage.addListener((message: SidePanelHostMessage) => {
    if (message?.type !== "FIELDCRAFT_SIDEPANEL_READY") return;
    if (!Number.isInteger(message.windowId)) return;
    windowId = message.windowId;
    sidePanelPorts.set(windowId, port);
  });

  port.onDisconnect.addListener(() => {
    if (windowId != null && sidePanelPorts.get(windowId) === port) {
      sidePanelPorts.delete(windowId);
    }
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void removeTabAnalysisSession(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // A same-URL reload creates a new DOM too, so field IDs from the previous
  // document are unsafe even when Chrome does not report a changed URL.
  if (!changeInfo.url && changeInfo.status !== "loading") return;
  void invalidateSessionAfterNavigation(tabId, changeInfo.url ?? "");
});

chrome.runtime.onMessage.addListener(
  (request: RuntimeRequest, sender, sendResponse) => {
    if (request.type === "FIELDCRAFT_OVERLAY_CLOSE") {
      if (sender.tab?.id == null) {
        sendResponse({ ok: false, error: "Could not identify the overlay tab" });
        return false;
      }
      void chrome.tabs.sendMessage(sender.tab.id, { type: "FIELDCRAFT_HIDE_OVERLAY" })
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) =>
          sendResponse({ ok: false, error: errorMessage(error, "Could not close the overlay") }),
        );
      return true;
    }

    if (request.type === "FIELDCRAFT_START_ANALYSIS") {
      void startAnalysis(request.tabId)
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) =>
          sendResponse({ ok: false, error: errorMessage(error, "Analysis failed") }),
        );
      return true;
    }

    if (request.type === "FIELDCRAFT_GET_TAB_SESSION") {
      void getCurrentSession(request.tabId)
        .then((session) => sendResponse({ ok: true, session }))
        .catch((error: unknown) =>
          sendResponse({ ok: false, error: errorMessage(error, "Could not read tab state") }),
        );
      return true;
    }

    if (request.type === "FIELDCRAFT_UPDATE_TAB_REVIEW") {
      void updateTabReview(request)
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) =>
          sendResponse({ ok: false, error: errorMessage(error, "Could not save review") }),
        );
      return true;
    }

    if (request.type === "FIELDCRAFT_FILL_TAB") {
      void fillTab(request)
        .then((results) => sendResponse({ ok: true, results }))
        .catch((error: unknown) =>
          sendResponse({ ok: false, error: errorMessage(error, "Could not fill page") }),
        );
      return true;
    }

    if (request.type === "FIELDCRAFT_DIRECT_FILL") {
      void (async () => {
        try {
          await assertTabUrl(request.tabId, request.url);
          const response = await chrome.tabs.sendMessage(request.tabId, {
            type: "FIELDCRAFT_DIRECT_FILL",
            tabId: request.tabId,
            url: request.url,
          } satisfies RuntimeRequest);
          if (!response?.ok) throw new Error(response?.error || "Could not direct-fill page");
          sendResponse({ ok: true, results: response.results as FillResult[] });
        } catch (error) {
          sendResponse({ ok: false, error: errorMessage(error, "Could not direct-fill page") });
        }
      })();
      return true;
    }

    if (request.type === "FIELDCRAFT_TEST_API") {
      void testConfiguredConnections(request.model)
        .then((result) =>
          sendResponse({
            ok: true,
            model: result.model,
            responseId: result.responseId,
            exaTested: result.exaTested,
            exaRequestId: result.exaRequestId,
          }),
        )
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error: errorMessage(error, "Connection failed"),
          }),
        );
      return true;
    }

    if (request.type === "FIELDCRAFT_RESOLVE_ACTIVE_TAB") {
      void resolveActiveBrowserTab(sender)
        .then((tab) => sendResponse({ ok: true, tab }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error: errorMessage(error, "Could not read the active tab"),
          }),
        );
      return true;
    }

    return false;
  },
);

async function testConfiguredConnections(model: string): Promise<{
  model: string;
  responseId?: string;
  exaTested: boolean;
  exaRequestId?: string;
}> {
  const aiTest = testAiConnection(model);
  const exaApiKey = await getExaApiKey();
  const exaTest = exaApiKey ? testExaConnection(exaApiKey) : undefined;
  const [ai, exa] = await Promise.all([aiTest, exaTest]);

  return {
    ...ai,
    exaTested: Boolean(exaTest),
    exaRequestId: exa?.requestId,
  };
}

async function startAnalysis(tabId: number): Promise<void> {
  const tab = await getEligibleTab(tabId);
  const runId = crypto.randomUUID();
  const url = tab.url!;

  await mutateTabAnalysisSessions((sessions) => {
    sessions[String(tabId)] = createAnalysisSession({
      tabId,
      url,
      runId,
      status: "capturing",
    });
  });

  try {
    // Capture then analyze. No site denylist / content credit-gate — user owns spend.
    const snapshot = await captureTab(tabId);
    await assertPageStillMatches(tabId, url, runId, snapshot);

    const movedToAnalyzing = await updateRun(tabId, url, runId, (session) => ({
      ...session,
      status: "analyzing",
      snapshot,
      error: "",
      updatedAt: new Date().toISOString(),
    }));
    if (!movedToAnalyzing) {
      throw new Error("This analysis was superseded by a newer tab action.");
    }

    // Read these after the capture so an immediately saved profile/settings
    // change is reflected in the actual background run.
    const [profile, settings] = await Promise.all([getProfile(), getSettings()]);
    const analysis = await analyzeJob(snapshot, profile, settings);

    await assertPageStillMatches(tabId, url, runId, snapshot);
    const completed = await updateRun(tabId, url, runId, (session) =>
      withCompletedAnalysis(session, analysis),
    );
    if (!completed) {
      throw new Error("This analysis was superseded by a newer tab action.");
    }
  } catch (error) {
    await markRunFailed(tabId, url, runId, errorMessage(error, "Analysis failed"));
    throw error;
  }
}

async function fillTab(
  request: Extract<RuntimeRequest, { type: "FIELDCRAFT_FILL_TAB" }>,
): Promise<FillResult[]> {
  const session = await requireCurrentSession(request.tabId, request.url, request.runId);
  if (!session.analysis || !session.snapshot) {
    throw new Error("Analyze this page before filling it.");
  }

  const markedFilling = await updateRun(request.tabId, request.url, request.runId, (current) => ({
    ...current,
    status: "filling",
    error: "",
    updatedAt: new Date().toISOString(),
  }));
  if (!markedFilling) throw new Error("This analysis is no longer current for the tab.");

  try {
    await assertTabUrl(request.tabId, request.url);
    const response = await chrome.tabs.sendMessage(request.tabId, {
      type: "FIELDCRAFT_FILL",
      suggestions: request.suggestions,
    } satisfies RuntimeRequest);
    if (!response?.ok) throw new Error(response?.error || "Could not fill page");
    const results = response.results as FillResult[];

    await updateRun(request.tabId, request.url, request.runId, (current) => ({
      ...current,
      status: "done",
      fillResults: results,
      error: "",
      updatedAt: new Date().toISOString(),
    }));
    return results;
  } catch (error) {
    await markRunFailed(
      request.tabId,
      request.url,
      request.runId,
      errorMessage(error, "Could not fill page"),
    );
    throw error;
  }
}

async function updateTabReview(
  request: Extract<RuntimeRequest, { type: "FIELDCRAFT_UPDATE_TAB_REVIEW" }>,
): Promise<void> {
  await assertTabUrl(request.tabId, request.url);
  const updated = await updateRun(request.tabId, request.url, request.runId, (session) => ({
    ...session,
    analysis: request.analysis,
    selectedFieldIds: [...new Set(request.selectedFieldIds)],
    updatedAt: new Date().toISOString(),
  }));
  if (!updated) throw new Error("This analysis is no longer current for the tab.");
}

async function getCurrentSession(tabId: number): Promise<TabAnalysisSession | null> {
  const session = await getTabAnalysisSession(tabId);
  if (!session) return null;
  try {
    await assertTabUrl(tabId, session.url);
    return session;
  } catch {
    await invalidateSessionAfterNavigation(tabId, "");
    return null;
  }
}

async function captureTab(tabId: number): Promise<PageSnapshot> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "FIELDCRAFT_CAPTURE",
    } satisfies RuntimeRequest);
    if (!response?.ok) throw new Error(response?.error || "Could not read this page");
    return response.snapshot as PageSnapshot;
  } catch (error) {
    const message = errorMessage(error, "Could not read this page");
    if (/receiving end does not exist|could not establish connection/i.test(message)) {
      throw new Error("Reload the job page once so Fieldcraft can read it, then try again.");
    }
    throw error;
  }
}

function tabHttpUrl(tab: chrome.tabs.Tab): string | undefined {
  const url = tab.url || tab.pendingUrl;
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

async function getEligibleTab(tabId: number): Promise<chrome.tabs.Tab> {
  const tab = await chrome.tabs.get(tabId);
  const url = tabHttpUrl(tab);
  if (!url || !isAnalyzableTabUrl(url)) {
    throw new Error("Open a public http(s) page, then try again.");
  }
  // Normalize so callers always read a concrete http(s) url from tab.url.
  return { ...tab, url };
}

async function assertTabUrl(tabId: number, url: string): Promise<void> {
  const tab = await getEligibleTab(tabId);
  if (tab.url !== url) {
    throw new Error("The page changed while Fieldcraft was working. Analyze the current page again.");
  }
}

async function assertPageStillMatches(
  tabId: number,
  url: string,
  runId: string,
  snapshot: PageSnapshot,
): Promise<void> {
  if (snapshot.url !== url) {
    throw new Error("The page changed while Fieldcraft was reading it. Analyze the current page again.");
  }
  await assertTabUrl(tabId, url);
  const session = await getTabAnalysisSession(tabId);
  if (!canUpdateRun(session ?? undefined, tabId, url, runId)) {
    throw new Error("This analysis was superseded by a newer tab action.");
  }
}

async function requireCurrentSession(
  tabId: number,
  url: string,
  runId: string,
): Promise<TabAnalysisSession> {
  await assertTabUrl(tabId, url);
  const session = await getTabAnalysisSession(tabId);
  if (!canUpdateRun(session ?? undefined, tabId, url, runId)) {
    throw new Error("This analysis is no longer current for the tab.");
  }
  return session!;
}

async function updateRun(
  tabId: number,
  url: string,
  runId: string,
  update: (session: TabAnalysisSession) => TabAnalysisSession,
): Promise<boolean> {
  return mutateTabAnalysisSessions((sessions) => {
    const session = sessions[String(tabId)];
    if (!canUpdateRun(session, tabId, url, runId)) return false;
    sessions[String(tabId)] = update(session);
    return true;
  });
}

async function markRunFailed(
  tabId: number,
  url: string,
  runId: string,
  error: string,
): Promise<void> {
  await updateRun(tabId, url, runId, (session) => ({
    ...session,
    status: "error",
    error,
    updatedAt: new Date().toISOString(),
  }));
}

async function invalidateSessionAfterNavigation(tabId: number, nextUrl: string): Promise<void> {
  await mutateTabAnalysisSessions((sessions) => {
    const session = sessions[String(tabId)];
    if (!session || (nextUrl && session.url === nextUrl)) return;
    sessions[String(tabId)] = {
      ...session,
      // A new run id prevents an in-flight OpenAI or fill response from ever
      // repopulating this tab after its document has changed.
      runId: crypto.randomUUID(),
      status: "error",
      analysis: undefined,
      snapshot: undefined,
      selectedFieldIds: [],
      fillResults: [],
      error: "The page changed. Analyze the current page again.",
      updatedAt: new Date().toISOString(),
    };
  });
}

async function recoverInterruptedTabRuns(): Promise<void> {
  await mutateTabAnalysisSessions((sessions) => {
    for (const [tabId, session] of Object.entries(sessions)) {
      if (!["capturing", "analyzing", "filling"].includes(session.status)) continue;
      sessions[tabId] = {
        ...session,
        status: "error",
        error: "The background worker was interrupted. Analyze this page again.",
        updatedAt: new Date().toISOString(),
      };
    }
  });
}

async function initReleaseChecker(): Promise<void> {
  const existing = await chrome.alarms.get(RELEASE_CHECK_ALARM);
  if (!existing) {
    await chrome.alarms.create(RELEASE_CHECK_ALARM, { periodInMinutes: 60 * 24 });
  }

  const release = await runReleaseCheck();
  if (release) showUpdateNotification(release);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Tab-owned extension frames always resolve their sender tab. Native side panels
 * have no sender tab and follow the active tab in the last-focused/current window.
 */
async function resolveActiveBrowserTab(sender: chrome.runtime.MessageSender): Promise<ResolvedActiveTab | null> {
  if (sender.tab) {
    const url = tabHttpUrl(sender.tab);
    return sender.tab.id != null && url
      ? { id: sender.tab.id, url, title: sender.tab.title }
      : null;
  }
  // An overlay without browser-provided ownership must not follow another tab.
  if (sender.url && new URL(sender.url).searchParams.get("host") === "overlay") return null;

  const candidates: chrome.tabs.Tab[] = [];

  // lastFocusedWindow is not supported by all WebExtensions implementations
  // (Safari in particular), so query it defensively and fall back to currentWindow.
  try {
    const [lastFocused] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (lastFocused) candidates.push(lastFocused);
  } catch {
    // Ignore unsupported query parameter.
  }

  try {
    const [currentWindow] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (currentWindow) candidates.push(currentWindow);
  } catch {
    // currentWindow should always be supported; if it fails we have no candidate.
  }

  const seen = new Set<number>();
  for (const tab of candidates) {
    if (!tab.id || seen.has(tab.id)) continue;
    seen.add(tab.id);
    // pendingUrl covers SPA navigations / mid-load states where url is briefly empty.
    const url = tabHttpUrl(tab);
    if (!url) continue;
    return {
      id: tab.id,
      url,
      title: tab.title,
    };
  }

  return null;
}
