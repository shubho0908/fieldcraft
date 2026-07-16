import type { JobAnalysis, PageSnapshot, TabAnalysisSession } from "../types";

export function isSessionCurrentFor(
  session: TabAnalysisSession | undefined,
  tabId: number,
  url: string,
): session is TabAnalysisSession {
  return Boolean(session && session.tabId === tabId && session.url === url);
}

/** A completion may only update the exact run that started it. */
export function canUpdateRun(
  session: TabAnalysisSession | undefined,
  tabId: number,
  url: string,
  runId: string,
): session is TabAnalysisSession {
  return isSessionCurrentFor(session, tabId, url) && session.runId === runId;
}

export function createAnalysisSession(input: {
  tabId: number;
  url: string;
  runId: string;
  status: "capturing" | "analyzing";
  snapshot?: PageSnapshot;
}): TabAnalysisSession {
  const now = new Date().toISOString();
  return {
    ...input,
    selectedFieldIds: [],
    fillResults: [],
    error: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function withCompletedAnalysis(
  session: TabAnalysisSession,
  analysis: JobAnalysis,
): TabAnalysisSession {
  return {
    ...session,
    status: "done",
    analysis,
    error: "",
    updatedAt: new Date().toISOString(),
  };
}
