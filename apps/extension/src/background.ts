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
  closePanelForTab,
  openPanelForTab,
} from "./lib/side-panel";
import {
  clearPanelBoundTab,
  getAllPanelBoundTabs,
  getExaApiKey,
  getProfile,
  getSettings,
  getTabAnalysisSession,
  mutateTabAnalysisSessions,
  removeTabAnalysisSession,
  setPanelBoundTab,
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
/** Active tab cache keyed by browser windowId, used for the keyboard shortcut. */
const activeTabs = new Map<number, number>();
/** Bound panel tab keyed by browser windowId. */
const boundPanelTabs = new Map<number, number>();

const RELEASE_CHECK_ALARM = "fieldcraft-release-check";

// Fieldcraft's side panel is per-tab. Disable the default global panel and
// leave it hidden until the user explicitly opens it on a specific tab.
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
void chrome.sidePanel.setOptions({ enabled: false });
void initActiveTabCache();
void restorePanelBindings();
// An MV3 worker can be terminated only when no event is keeping it alive. If
// that happens, an in-flight network/DOM operation cannot be resumed safely;
// surface a retry state rather than leaving a tab on an endless spinner.
void recoverInterruptedTabRuns();

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  void chrome.sidePanel.setOptions({ enabled: false });
  void initReleaseChecker();
});

chrome.runtime.onStartup.addListener(() => {
  void initReleaseChecker();
  void restorePanelBindings();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RELEASE_CHECK_ALARM) {
    void runReleaseCheck().then((release) => {
      if (release) showUpdateNotification(release);
    });
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  void (async () => {
    const url = await getNotificationUrl(notificationId);
    if (url) {
      void chrome.tabs.create({ url });
      await chrome.notifications.clear(notificationId);
    }
  })();
});

// --- last-focused window and active-tab caches for the toggle shortcut ---
//
// chrome.sidePanel.open() must be called from a SYNCHRONOUS (non-async)
// context — Chrome drops the user-gesture flag across async function
// boundaries. Caching the windowId and active tab lets us call
// openPanelForTab() directly in the command listener, preserving the gesture.
let _lastFocusedWindowId: number | undefined;

async function updateActiveTabForWindow(windowId: number): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  if (tab?.id) activeTabs.set(windowId, tab.id);
}

chrome.windows.getLastFocused({ populate: false }).then((win) => {
  if (win.id != null) {
    _lastFocusedWindowId = win.id;
    void updateActiveTabForWindow(win.id);
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    _lastFocusedWindowId = windowId;
    void updateActiveTabForWindow(windowId);
  }
});

// Ctrl+Shift+F (Windows) / Option+F (macOS) — open or close the Fieldcraft side panel.
chrome.commands.onCommand.addListener((command) => {
  if (command !== SIDE_PANEL_TOGGLE_COMMAND) return;

  const windowId = _lastFocusedWindowId;
  if (windowId == null) return;

  const cachedTabId = activeTabs.get(windowId);
  if (cachedTabId != null) {
    togglePanelForTab(windowId, cachedTabId);
    return;
  }

  // Cache not ready — try async resolution (gesture may be lost, fallback only).
  void chrome.tabs.query({ active: true, windowId }).then(([tab]) => {
    if (tab?.id) togglePanelForTab(windowId, tab.id);
  });
});

// Click the toolbar icon to bind the side panel to the current tab.
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id || !tab.windowId) return;

  const url = tab.url || tab.pendingUrl || "";
  if (url && !isAnalyzableTabUrl(url)) {
    const bound = boundPanelTabs.get(tab.windowId);
    if (bound != null) {
      void closePanelAndUnbind(tab.windowId, bound);
    }
    return;
  }

  togglePanelForTab(tab.windowId, tab.id, url);
});

// Side panel documents check in while open so we can close them on toggle.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== SIDE_PANEL_PORT) return;

  let windowId: number | undefined;

  port.onMessage.addListener((message: SidePanelHostMessage) => {
    if (message?.type !== "FIELDCRAFT_SIDEPANEL_READY") return;
    if (!Number.isInteger(message.windowId)) return;
    windowId = message.windowId;
    sidePanelPorts.set(windowId, port);
    if (Number.isInteger(message.tabId) && message.tabId > 0) {
      boundPanelTabs.set(windowId, message.tabId);
    }
  });

  port.onDisconnect.addListener(() => {
    if (windowId != null && sidePanelPorts.get(windowId) === port) {
      sidePanelPorts.delete(windowId);
    }
  });
});

// Listen for the native side-panel close event (Chrome 141+) so we can clear
// the bound tab when the user explicitly closes the panel.
const sidePanelOnClosed = (
  chrome.sidePanel as unknown as {
    onClosed?: {
      addListener: (callback: (info: { tabId?: number; windowId: number }) => void) => void;
    };
  }
).onClosed;
if (sidePanelOnClosed?.addListener) {
  sidePanelOnClosed.addListener(({ tabId, windowId }) => {
    if (tabId == null) return;
    for (const [winId, boundTabId] of boundPanelTabs) {
      if (winId === windowId && boundTabId === tabId) {
        boundPanelTabs.delete(winId);
        void clearPanelBoundTab(winId);
        void chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {});
        break;
      }
    }
  });
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  activeTabs.set(activeInfo.windowId, activeInfo.tabId);

  const bound = boundPanelTabs.get(activeInfo.windowId);
  if (bound === activeInfo.tabId) {
    void chrome.sidePanel.setOptions({ tabId: bound, enabled: true }).catch(() => {});
  } else {
    void chrome.sidePanel.setOptions({ tabId: activeInfo.tabId, enabled: false }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void removeTabAnalysisSession(tabId);

  for (const [windowId, boundTabId] of boundPanelTabs) {
    if (boundTabId === tabId) {
      boundPanelTabs.delete(windowId);
      void clearPanelBoundTab(windowId);
      void chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {});
      break;
    }
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // A same-URL reload creates a new DOM too, so field IDs from the previous
  // document are unsafe even when Chrome does not report a changed URL.
  if (!changeInfo.url && changeInfo.status !== "loading") return;
  void invalidateSessionAfterNavigation(tabId, changeInfo.url ?? "");
});

chrome.runtime.onMessage.addListener(
  (request: RuntimeRequest, _sender, sendResponse) => {
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
      void resolveActiveBrowserTab()
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

function togglePanelForTab(windowId: number, tabId: number, url?: string): void {
  const bound = boundPanelTabs.get(windowId);
  if (bound === tabId && sidePanelPorts.has(windowId)) {
    void closePanelAndUnbind(windowId, tabId);
    return;
  }

  if (bound != null && bound !== tabId) {
    void chrome.sidePanel.setOptions({ tabId: bound, enabled: false }).catch(() => {});
  }

  boundPanelTabs.set(windowId, tabId);
  if (url) void setPanelBoundTab(windowId, tabId, url);
  else void setPanelBoundTab(windowId, tabId);
  openPanelForTab(tabId, windowId);

  if (url) return;
  void chrome.tabs
    .get(tabId)
    .then((tab) => {
      const tabUrl = tab.url || tab.pendingUrl || "";
      if (tabUrl) void setPanelBoundTab(windowId, tabId, tabUrl);
    })
    .catch(() => {});
}

async function closePanelAndUnbind(windowId: number, tabId: number): Promise<void> {
  const port = sidePanelPorts.get(windowId);
  sidePanelPorts.delete(windowId);
  boundPanelTabs.delete(windowId);
  await clearPanelBoundTab(windowId);
  await closePanelForTab(tabId, windowId, port);
  await chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {});
}

async function initActiveTabCache(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ active: true });
    for (const tab of tabs) {
      if (tab.windowId && tab.id) activeTabs.set(tab.windowId, tab.id);
    }
  } catch {
    // Ignore if the tabs API isn't available.
  }
}

async function restorePanelBindings(): Promise<void> {
  try {
    const all = await getAllPanelBoundTabs();
    for (const [windowId, bound] of Object.entries(all)) {
      if (!bound.tabId) continue;
      const winId = Number(windowId);
      boundPanelTabs.set(winId, bound.tabId);
      const [active] = await chrome.tabs.query({ active: true, windowId: winId });
      if (active?.id === bound.tabId) {
        void chrome.sidePanel.setOptions({ tabId: bound.tabId, enabled: true }).catch(() => {});
      }
    }
  } catch {
    // Ignore.
  }
}

/**
 * Resolve the browser tab the side panel should bind to.
 * Only the active tab in the last-focused / current window — never a background
 * window, which would enable Analyze against a page the user is not looking at.
 */
async function resolveActiveBrowserTab(): Promise<ResolvedActiveTab | null> {
  const candidates: chrome.tabs.Tab[] = [];

  const [lastFocused] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (lastFocused) candidates.push(lastFocused);

  const [currentWindow] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (currentWindow) candidates.push(currentWindow);

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
