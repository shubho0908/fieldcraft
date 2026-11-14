import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE } from "./lib/defaults";
import { Confidence, SuggestionAction } from "./lib/enums";
import { collectPageSnapshot, fillPageFields } from "./lib/page";
import { prepareDirectReview } from "./lib/direct-review";
import { createReviewDraft } from "./lib/dashboard-review";
import { createAnalysisSession, withCompletedAnalysis } from "./lib/tab-sessions";
import type { RuntimeRequest, TabAnalysisSession } from "./types";

const state = vi.hoisted(() => ({ sessions: {} as Record<string, TabAnalysisSession> }));
vi.mock("./lib/storage", () => ({
  getProfile: vi.fn(async () => ({
    ...DEFAULT_PROFILE,
    identity: { ...DEFAULT_PROFILE.identity, fullName: "Ada Example", email: "ada@example.test" },
  })),
  getTabAnalysisSession: vi.fn(async (id: number) => state.sessions[String(id)] ?? null),
  mutateTabAnalysisSessions: vi.fn(async (mutate) => mutate(state.sessions)),
}));
vi.mock("./lib/openai", () => ({}));
vi.mock("./lib/exa", () => ({}));
vi.mock("./lib/release-check", () => ({}));

beforeEach(() => {
  state.sessions = {};
  document.body.innerHTML = '<label for="name">Full name</label><input id="name"><label for="email">Email</label><input id="email">';
});
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it("prepares Direct-fill without mutating the page, then fills only explicitly selected fields", async () => {
  const listeners: Array<(request: RuntimeRequest, sender: object, reply: (response: any) => void) => boolean> = [];
  const event = () => ({ addListener: vi.fn() });
  const url = document.location.href;
  const sendMessage = vi.fn((_: number, request: RuntimeRequest) => new Promise((resolve) => listeners[0](request, {}, resolve)));
  vi.stubGlobal("chrome", {
    runtime: { onMessage: { addListener: (listener: typeof listeners[number]) => listeners.push(listener) }, onInstalled: event(), onStartup: event(), onConnect: event() },
    tabs: { get: vi.fn(async () => ({ id: 1, url })), sendMessage, onRemoved: event(), onUpdated: event() },
    commands: { onCommand: event() }, alarms: { onAlarm: event() }, action: { onClicked: event() },
  });
  await import("./content");
  await import("./background");
  const request = (message: RuntimeRequest) => new Promise<any>((resolve) => listeners[1](message, {}, resolve));
  expect(await request({ type: "FIELDCRAFT_DIRECT_FILL", tabId: 1, url })).toMatchObject({ ok: true });
  expect((document.querySelector("#name") as HTMLInputElement).value).toBe("");
  expect((document.querySelector("#email") as HTMLInputElement).value).toBe("");
  const session = state.sessions["1"];
  expect(session.status).toBe("done");
  expect(session.selectedFieldIds).toEqual([]);
  expect(session.analysis?.suggestions).toHaveLength(2);
  const suggestion = { ...session.analysis!.suggestions[0], value: "Ada Reviewed", action: SuggestionAction.Review };
  expect(await request({ type: "FIELDCRAFT_UPDATE_TAB_REVIEW", tabId: 1, url, runId: session.runId, analysis: { ...session.analysis!, suggestions: [suggestion, session.analysis!.suggestions[1]] }, selectedFieldIds: [suggestion.fieldId] })).toMatchObject({ ok: true });
  expect(await request({ type: "FIELDCRAFT_FILL_TAB", tabId: 1, url, runId: session.runId, suggestions: [suggestion] })).toMatchObject({ ok: true });
  expect((document.querySelector("#name") as HTMLInputElement).value).toBe("Ada Reviewed");
  expect((document.querySelector("#email") as HTMLInputElement).value).toBe("");
  expect(await request({ type: "FIELDCRAFT_FILL_TAB", tabId: 1, url, runId: "old-run", suggestions: [suggestion] })).toMatchObject({ ok: false });
});

it("does not write review-only suggestions without explicit field selection", async () => {
  const snapshot = collectPageSnapshot(document);
  const suggestion = { fieldId: snapshot.fields[0].id, label: "Full name", action: SuggestionAction.Review, value: "REVIEW-ONLY VALUE", confidence: Confidence.High, evidence: "Profile", warning: "Confirm" };
  const results = await fillPageFields([suggestion], document);
  expect(results[0].status).toBe("skipped");
  expect((document.querySelector("#name") as HTMLInputElement).value).toBe("");
});

it("keeps Direct-fill suggestions unselected, including after an empty selection is restored", () => {
  const snapshot = collectPageSnapshot(document);
  const profile = { ...DEFAULT_PROFILE, identity: { ...DEFAULT_PROFILE.identity, fullName: "Ada Example" } };
  const analysis = prepareDirectReview(snapshot, profile);
  expect(analysis.suggestions).toHaveLength(1);
  const session = withCompletedAnalysis(createAnalysisSession({ tabId: 1, url: snapshot.url, runId: "run", status: "capturing", snapshot }), analysis);
  expect([...createReviewDraft(session)!.selectedFieldIds]).toEqual([]);
  expect(analysis.fitUnavailableReason).toContain("No fit analysis was performed");
});
