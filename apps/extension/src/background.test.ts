import { afterEach, expect, it, vi } from "vitest";

vi.mock("./lib/storage", () => ({
  mutateTabAnalysisSessions: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./lib/openai", () => ({}));
vi.mock("./lib/exa", () => ({}));
vi.mock("./lib/release-check", () => ({}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("keeps two overlay senders isolated while native side panels follow the active tab", async () => {
  const onMessage = { addListener: vi.fn() };
  const onClicked = { addListener: vi.fn() };
  const event = () => ({ addListener: vi.fn() });
  const first = { id: 11, url: "https://first.example/jobs", title: "First" };
  const second = { id: 22, url: "https://second.example/jobs", title: "Second" };
  const active = { id: 33, url: "https://active.example/jobs", title: "Active" };
  const query = vi.fn().mockResolvedValue([active]);
  const sendMessage = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("chrome", {
    runtime: { onMessage, onInstalled: event(), onStartup: event(), onConnect: event() },
    alarms: { onAlarm: event() },
    commands: { onCommand: event() },
    action: { onClicked },
    tabs: { query, sendMessage, onRemoved: event(), onUpdated: event() },
  });
  // Load the worker only after its browser event APIs exist.
  await import("./background");
  const listener = onMessage.addListener.mock.calls[0]![0] as (
    request: { type: string },
    sender: chrome.runtime.MessageSender,
    respond: (response: unknown) => void,
  ) => void;
  // The project targets ES2022, before Promise.withResolvers is available.
  const request = (type: string, sender: chrome.runtime.MessageSender) =>
    new Promise((resolve) => listener({ type }, sender, resolve));
  const sender = (tab: typeof first) => ({
    tab: tab as chrome.tabs.Tab,
    url: "safari-web-extension://fieldcraft/sidepanel.html?host=overlay&tabId=33",
  });

  expect(await request("FIELDCRAFT_RESOLVE_ACTIVE_TAB", sender(first))).toEqual({ ok: true, tab: first });
  expect(await request("FIELDCRAFT_RESOLVE_ACTIVE_TAB", sender(second))).toEqual({ ok: true, tab: second });
  expect(query).not.toHaveBeenCalled();
  expect(await request("FIELDCRAFT_OVERLAY_CLOSE", sender(first))).toEqual({ ok: true });
  expect(await request("FIELDCRAFT_OVERLAY_CLOSE", sender(second))).toEqual({ ok: true });
  expect(sendMessage.mock.calls).toEqual([
    [first.id, { type: "FIELDCRAFT_HIDE_OVERLAY" }],
    [second.id, { type: "FIELDCRAFT_HIDE_OVERLAY" }],
  ]);
  expect(query).not.toHaveBeenCalled();

  onClicked.addListener.mock.calls[0]![0](first);
  expect(sendMessage).toHaveBeenLastCalledWith(first.id, { type: "FIELDCRAFT_TOGGLE_OVERLAY" });
  expect(await request("FIELDCRAFT_RESOLVE_ACTIVE_TAB", {})).toEqual({ ok: true, tab: active });

  query.mockClear();
  sendMessage.mockClear();
  expect(await request("FIELDCRAFT_RESOLVE_ACTIVE_TAB", { url: sender(first).url })).toEqual({ ok: true, tab: null });
  expect(await request("FIELDCRAFT_OVERLAY_CLOSE", {})).toMatchObject({ ok: false });
  expect(query).not.toHaveBeenCalled();
  expect(sendMessage).not.toHaveBeenCalled();
});
