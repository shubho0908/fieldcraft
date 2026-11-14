import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from "../lib/defaults";
import { AutofillMode } from "../lib/enums";
import { collectPageSnapshot } from "../lib/page";
import { prepareDirectReview } from "../lib/direct-review";
import { createAnalysisSession, withCompletedAnalysis } from "../lib/tab-sessions";
import Dashboard from "./Dashboard";

const state = vi.hoisted(() => ({ session: null as import("../types").TabAnalysisSession | null }));
vi.mock("./useDashboardBinding", () => ({
  useDashboardBinding: () => ({
    binding: { id: 1, url: document.location.href },
    bindIssue: "",
    session: state.session,
    setSession: vi.fn(),
  }),
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("chrome", { runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true }) } });
  document.body.innerHTML = '<label>Full name<input name="name"></label>';
  const snapshot = collectPageSnapshot(document);
  state.session = withCompletedAnalysis(
    createAnalysisSession({ tabId: 1, url: snapshot.url, runId: "direct-run", status: "capturing", snapshot }),
    prepareDirectReview(snapshot, { ...DEFAULT_PROFILE, identity: { ...DEFAULT_PROFILE.identity, fullName: "Ada Example" } }),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it.each([false, true])("refreshes Direct-fill review without switching to AI (API key: %s)", async (apiKeyExists) => {
  const onOpenSettings = vi.fn();
  await act(async () => root.render(
    <Dashboard apiKeyExists={apiKeyExists} settings={{ ...DEFAULT_SETTINGS, autofillMode: AutofillMode.Direct }}
      setSettings={vi.fn()} onOpenSettings={onOpenSettings} />,
  ));
  await act(async () => container.querySelector<HTMLButtonElement>('[title="Re-analyze current page"]')!.click());
  expect(onOpenSettings).not.toHaveBeenCalled();
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
    type: "FIELDCRAFT_DIRECT_FILL", tabId: 1, url: document.location.href,
  });
  expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "FIELDCRAFT_START_ANALYSIS" }));
});

it.each([false, true])("preserves AI refresh and its API-key gate (API key: %s)", async (apiKeyExists) => {
  const onOpenSettings = vi.fn();
  await act(async () => root.render(
    <Dashboard apiKeyExists={apiKeyExists} settings={DEFAULT_SETTINGS}
      setSettings={vi.fn()} onOpenSettings={onOpenSettings} />,
  ));
  await act(async () => container.querySelector<HTMLButtonElement>('[title="Re-analyze current page"]')!.click());
  if (apiKeyExists) {
    expect(onOpenSettings).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "FIELDCRAFT_START_ANALYSIS", tabId: 1 });
  } else {
    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  }
});
