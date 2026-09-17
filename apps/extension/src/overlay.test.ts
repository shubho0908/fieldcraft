import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  document.getElementById("fieldcraft-overlay-host")?.remove();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("opens, hides and reopens the same panel without losing its document", async () => {
  const addListener = vi.fn();
  vi.stubGlobal("chrome", { runtime: {
    getURL: (path: string) => `https://extension.example/${path}`,
    onMessage: { addListener },
  } });
  // Load after installing the browser API: the content script registers at module initialization.
  await import("./overlay");
  const dispatch = (type: string) => {
    const respond = vi.fn();
    addListener.mock.calls[0]![0]({ type }, {}, respond);
    return respond.mock.calls[0]![0];
  };
  expect(dispatch("FIELDCRAFT_TOGGLE_OVERLAY")).toEqual({ ok: true, open: true });
  const panel = document.querySelector("iframe")!;
  expect(getComputedStyle(panel).display).toBe("block");
  expect(panel.getAttribute("aria-hidden")).toBe("false");
  expect(dispatch("FIELDCRAFT_HIDE_OVERLAY")).toEqual({ ok: true });
  expect(getComputedStyle(panel).display).toBe("none");
  expect(panel.getAttribute("aria-hidden")).toBe("true");
  expect(dispatch("FIELDCRAFT_TOGGLE_OVERLAY")).toEqual({ ok: true, open: true });
  expect(document.querySelector("iframe")).toBe(panel);
  expect(getComputedStyle(panel).display).toBe("block");
});
