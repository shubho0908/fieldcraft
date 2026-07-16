import { isAnalyzableTabUrl } from "./lib/page";
import { analyzeJob, testOpenAiConnection } from "./lib/openai";
import {
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

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
// An MV3 worker can be terminated only when no event is keeping it alive. If
// that happens, an in-flight network/DOM operation cannot be resumed safely;
// surface a retry state rather than leaving a tab on an endless spinner.
void recoverInterruptedTabRuns();

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
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

    if (request.type === "FIELDCRAFT_TEST_API") {
      void testOpenAiConnection(request.model)
        .then((result) =>
          sendResponse({
            ok: true,
            model: result.model,
            responseId: result.responseId,
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

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
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
