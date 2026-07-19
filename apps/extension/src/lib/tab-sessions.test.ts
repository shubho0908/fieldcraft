import { describe, expect, it } from "vitest";
import {
  canUpdateRun,
  createAnalysisSession,
  isSessionCurrentFor,
  withCompletedAnalysis,
} from "./tab-sessions";
import type { JobAnalysis } from "../types";

const analysis = {} as JobAnalysis;

describe("tab analysis session guards", () => {
  it("only accepts a completion for the same tab, exact document URL, and run", () => {
    const session = createAnalysisSession({
      tabId: 7,
      url: "https://jobs.example.com/roles/1",
      runId: "run-a",
      status: "analyzing",
    });

    expect(isSessionCurrentFor(session, 7, "https://jobs.example.com/roles/1")).toBe(true);
    expect(isSessionCurrentFor(session, 7, "https://jobs.example.com/roles/2")).toBe(false);
    expect(canUpdateRun(session, 7, "https://jobs.example.com/roles/1", "run-a")).toBe(true);
    expect(canUpdateRun(session, 7, "https://jobs.example.com/roles/1", "run-b")).toBe(false);
    expect(canUpdateRun(session, 8, "https://jobs.example.com/roles/1", "run-a")).toBe(false);
  });

  it("keeps session identity while publishing a completed analysis", () => {
    const session = createAnalysisSession({
      tabId: 7,
      url: "https://jobs.example.com/roles/1",
      runId: "run-a",
      status: "analyzing",
    });
    const completed = withCompletedAnalysis(session, analysis);

    expect(completed).toMatchObject({
      tabId: 7,
      url: "https://jobs.example.com/roles/1",
      runId: "run-a",
      status: "done",
      analysis,
    });
  });
});
