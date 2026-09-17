/**
 * Regression: pages that hide iframes with !important CSS (e.g. ad blockers'
 * utility styles) kept the Fieldcraft overlay invisible even after a successful
 * toggle. The overlay must win those cascade fights and attach to
 * documentElement so a transformed body cannot shift it.
 */
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

it("stays visible when the page hides every iframe with !important", async () => {
  const style = document.createElement("style");
  style.textContent = "iframe { display: none !important; } body { transform: translateX(20px); }";
  document.head.appendChild(style);
  const addListener = vi.fn();
  vi.stubGlobal("chrome", { runtime: {
    getURL: (path: string) => `https://extension.example/${path}`,
    onMessage: { addListener },
  } });
  // Load after installing the browser API: the content script registers at module initialization.
  await import("./overlay");
  const respond = vi.fn();
  addListener.mock.calls[0]![0]({ type: "FIELDCRAFT_TOGGLE_OVERLAY" }, {}, respond);
  expect(respond.mock.calls[0]![0]).toEqual({ ok: true, open: true });
  const panel = document.getElementById("fieldcraft-overlay-host")!;
  expect(panel.parentElement).toBe(document.documentElement);
  expect(getComputedStyle(panel).display).toBe("block");
});
