import { afterEach, expect, it, vi } from "vitest";
import getManifest from "./manifest";

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

async function loadWorker(native = true) {
  const event = () => ({ addListener: vi.fn() });
  const onCommand = event();
  const onConnect = event();
  const onFocusChanged = event();
  const open = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn().mockResolvedValue(undefined);
  const query = vi.fn().mockResolvedValue([{ id: 7, windowId: 42 }]);
  const sendMessage = vi.fn().mockResolvedValue({ ok: true, open: true });
  // Deliberately unresolved: an MV3 command can arrive before the startup lookup.
  const getLastFocused = vi.fn(() => new Promise<chrome.windows.Window>(() => {}));
  vi.stubGlobal("chrome", {
    runtime: { onMessage: event(), onInstalled: event(), onStartup: event(), onConnect },
    alarms: { onAlarm: event() },
    commands: { onCommand },
    action: { onClicked: event() },
    tabs: { query, sendMessage, onRemoved: event(), onUpdated: event() },
    ...(native ? {
      sidePanel: { open, close, setPanelBehavior: vi.fn().mockResolvedValue(undefined) },
      windows: { getLastFocused, onFocusChanged, WINDOW_ID_NONE: -1 },
    } : {}),
  });
  await import("./background");
  const command = onCommand.addListener.mock.calls[0]![0] as
    (name: string, tab?: Partial<chrome.tabs.Tab>) => void;
  return { command, open, close, query, sendMessage, onConnect, onFocusChanged };
}

it.each(["mac", "windows"] as const)("opens synchronously on a cold worker for the %s shortcut", async (platform) => {
  const manifest = getManifest("chrome") as chrome.runtime.ManifestV3;
  const commandId = "toggle-side-panel";
  const shortcut = manifest.commands![commandId]!.suggested_key as Record<string, string>;
  expect(shortcut[platform]).toBe(platform === "mac" ? "Alt+F" : "Ctrl+Shift+F");
  const worker = await loadWorker();
  worker.command(commandId, { id: 7, windowId: 42 });
  // Assert before yielding: an async open loses the command's user gesture.
  expect(worker.open).toHaveBeenCalledTimes(1);
  expect(worker.open).toHaveBeenCalledWith({ windowId: 42 });
  expect(worker.query).not.toHaveBeenCalled();
});

it("uses the command's window instead of a stale focus cache", async () => {
  const worker = await loadWorker();
  worker.onFocusChanged.addListener.mock.calls[0]![0](99);
  worker.command("toggle-side-panel", { id: 7, windowId: 42 });
  expect(worker.open).toHaveBeenCalledWith({ windowId: 42 });
});

it("closes the panel in the command's window and leaves other windows alone", async () => {
  const worker = await loadWorker();
  const port = { name: "fieldcraft-sidepanel", onMessage: { addListener: vi.fn() },
    onDisconnect: { addListener: vi.fn() }, postMessage: vi.fn() };
  worker.onConnect.addListener.mock.calls[0]![0](port);
  port.onMessage.addListener.mock.calls[0]![0]({ type: "FIELDCRAFT_SIDEPANEL_READY", windowId: 42 });
  worker.command("toggle-side-panel", { windowId: 42 });
  expect(worker.close).toHaveBeenCalledWith({ windowId: 42 });
  expect(worker.open).not.toHaveBeenCalled();
  worker.command("toggle-side-panel", { windowId: 99 });
  expect(worker.open).toHaveBeenCalledWith({ windowId: 99 });
});

it("targets the command's Safari tab without querying a possibly different active tab", async () => {
  const worker = await loadWorker(false);
  worker.command("toggle-side-panel", { id: 18, windowId: 42 });
  expect(worker.sendMessage).toHaveBeenCalledWith(18, { type: "FIELDCRAFT_TOGGLE_OVERLAY" });
  expect(worker.query).not.toHaveBeenCalled();
});

it("falls back to active-tab resolution when Safari omits the command tab", async () => {
  const worker = await loadWorker(false);
  worker.command("toggle-side-panel");
  await vi.waitFor(() => expect(worker.sendMessage).toHaveBeenCalledWith(7, { type: "FIELDCRAFT_TOGGLE_OVERLAY" }));
});

it("ignores unrelated commands", async () => {
  const worker = await loadWorker();
  worker.command("unrelated", { windowId: 42 });
  expect(worker.open).not.toHaveBeenCalled();
  expect(worker.close).not.toHaveBeenCalled();
});
