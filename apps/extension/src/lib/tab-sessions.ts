import { toSafeAnalysis } from "./analysis";
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

/**
 * Coerce a persisted tab session into a crash-safe shape. Tab sessions may be
 * read by the side panel or the service worker, and older/malformed analyses
 * must not crash either side.
 */
export function normalizeSession(
  session: TabAnalysisSession | null,
): TabAnalysisSession | null {
  if (!session?.analysis || !session.snapshot) return session;
  return {
    ...session,
    analysis: toSafeAnalysis(session.analysis, session.snapshot),
  };
}
