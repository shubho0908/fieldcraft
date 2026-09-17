import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { RuntimeRequest, TabAnalysisSession } from "../types";
import { useDashboardBinding } from "./useDashboardBinding";

interface TestEvent<T extends unknown[]> {
  addListener: (listener: (...args: T) => void) => unknown;
  removeListener: (listener: (...args: T) => void) => unknown;
  emit: (...args: T) => void;
}
function event<T extends unknown[]>(): TestEvent<T> {
  const listeners = new Set<(...args: T) => void>();
  return {
    addListener: (listener: (...args: T) => void) => listeners.add(listener),
    removeListener: (listener: (...args: T) => void) => listeners.delete(listener),
    emit: (...args: T) => listeners.forEach((listener) => listener(...args)),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  // ES2022 does not include Promise.withResolvers.
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const first = { id: 11, url: "https://first.example/jobs" };
const second = { id: 22, url: "https://second.example/jobs" };
let root: Root | undefined;
let container: HTMLDivElement;
let result: {
  binding: { id: number; url: string } | null;
  bindIssue: string;
  session: TabAnalysisSession | null;
};
let activated: TestEvent<[]>;
let updated: TestEvent<[number, chrome.tabs.TabChangeInfo]>;
let changed: TestEvent<[Record<string, chrome.storage.StorageChange>, string]>;
let sendMessage: Mock;
let query: Mock;
let get: Mock;

function Probe() {
  result = useDashboardBinding();
  return <output>{result.binding?.id}:{result.binding?.url}:{result.session?.runId}</output>;
}

async function mount(overlay = false) {
  window.history.replaceState(null, "", overlay ? "/?host=overlay" : "/");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root!.render(<Probe />); });
}

function session(runId: string): TabAnalysisSession {
  return {
    tabId: first.id,
    url: first.url,
    runId,
    status: "analyzing",
    selectedFieldIds: [],
    fillResults: [],
    error: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  activated = event<[]>();
  updated = event<[number, chrome.tabs.TabChangeInfo]>();
  changed = event<[Record<string, chrome.storage.StorageChange>, string]>();
  sendMessage = vi.fn((request: RuntimeRequest) => Promise.resolve(
    request.type === "FIELDCRAFT_RESOLVE_ACTIVE_TAB"
      ? { ok: true, tab: first }
      : { ok: true, session: null },
  ));
  query = vi.fn().mockResolvedValue([second]);
  get = vi.fn().mockResolvedValue(first);
  vi.stubGlobal("chrome", {
    runtime: { sendMessage },
    tabs: { query, get, onActivated: activated, onUpdated: updated },
    storage: { onChanged: changed },
  });
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = undefined;
  container?.remove();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("dashboard tab ownership", () => {
  it("keeps an overlay on its owner when another tab activates or navigates", async () => {
    await mount(true);
    await act(async () => {
      activated.emit();
      updated.emit(second.id, { url: "https://second.example/next" });
    });
    expect(result.binding).toEqual(first);
    expect(query).not.toHaveBeenCalled();
    expect(sendMessage.mock.calls.filter(([request]) => request.type === "FIELDCRAFT_RESOLVE_ACTIVE_TAB")).toHaveLength(1);
    await act(async () => { updated.emit(first.id, { url: "https://first.example/next" }); });
    expect(result.binding).toEqual({ id: first.id, url: "https://first.example/next" });
  });

  it("fails closed instead of binding an overlay to the active tab when the worker is unavailable", async () => {
    sendMessage.mockRejectedValue(new Error("Worker unavailable"));
    await mount(true);
    expect(result.binding).toBeNull();
    expect(result.bindIssue).not.toBe("");
    expect(query).not.toHaveBeenCalled();
  });

  it("lets Chrome follow activation but ignores older resolve and tab-get completions", async () => {
    const initial = deferred<unknown>();
    sendMessage.mockImplementationOnce(() => initial.promise);
    await mount();
    sendMessage.mockImplementation((request: RuntimeRequest) => Promise.resolve(
      request.type === "FIELDCRAFT_RESOLVE_ACTIVE_TAB"
        ? { ok: true, tab: second }
        : { ok: true, session: null },
    ));
    await act(async () => { activated.emit(); });
    expect(result.binding).toEqual(second);
    await act(async () => { initial.resolve({ ok: true, tab: first }); });
    expect(result.binding).toEqual(second);

    const oldGet = deferred<unknown>();
    get.mockReturnValueOnce(oldGet.promise);
    await act(async () => { updated.emit(second.id, { status: "complete" }); });
    await act(async () => { updated.emit(second.id, { url: "https://second.example/next" }); });
    await act(async () => { oldGet.resolve(second); });
    expect(result.binding).toEqual({ id: second.id, url: "https://second.example/next" });
  });

  it("preserves Chrome's active-tab fallback without letting an older fallback win", async () => {
    const oldQuery = deferred<unknown>();
    query.mockReturnValueOnce(oldQuery.promise);
    sendMessage.mockRejectedValueOnce(new Error("Worker unavailable"));
    await mount();
    await act(async () => { activated.emit(); });
    expect(result.binding).toEqual(first);
    await act(async () => { oldQuery.resolve([second]); });
    expect(result.binding).toEqual(first);

    sendMessage.mockRejectedValueOnce(new Error("Worker unavailable"));
    await act(async () => { activated.emit(); });
    expect(result.binding).toEqual(second);
  });

  it("rejects stale sessions after returning to the same binding and after a newer storage update", async () => {
    const oldSession = deferred<unknown>();
    const currentSession = deferred<unknown>();
    let reads = 0;
    sendMessage.mockImplementation((request: RuntimeRequest) => {
      if (request.type === "FIELDCRAFT_RESOLVE_ACTIVE_TAB") return Promise.resolve({ ok: true, tab: first });
      reads += 1;
      if (reads === 1) return oldSession.promise;
      if (reads === 3) return currentSession.promise;
      return Promise.resolve({ ok: true, session: null });
    });
    await mount(true);
    await act(async () => { updated.emit(first.id, { url: "https://first.example/next" }); });
    await act(async () => { updated.emit(first.id, { url: first.url }); });
    await act(async () => { oldSession.resolve({ ok: true, session: session("old") }); });
    expect(result.session).toBeNull();
    await act(async () => {
      changed.emit({ "fieldcraft.tabAnalysisSessions": { newValue: { [first.id]: session("newest") } } }, "session");
    });
    await act(async () => { currentSession.resolve({ ok: true, session: session("older") }); });
    expect(result.session?.runId).toBe("newest");
    expect(container.textContent).toContain("newest");
  });

  it("does not resume binding work after unmount", async () => {
    const pending = deferred<unknown>();
    sendMessage.mockReturnValueOnce(pending.promise);
    await mount(true);
    await act(async () => { root!.unmount(); });
    root = undefined;
    await act(async () => {
      pending.resolve({ ok: true, tab: first });
      activated.emit();
      updated.emit(first.id, { url: first.url });
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });
});
