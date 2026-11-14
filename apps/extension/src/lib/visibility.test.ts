import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectFields } from "./page";
import { isFrameHostVisible } from "./frame-document";

const rect = (x: number, y: number, width: number, height: number): DOMRect => ({
  x, y, left: x, top: y, width, height, right: x + width, bottom: y + height, toJSON() {},
});
function bounds(element: Element, x: number, y: number, width: number, height: number) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(rect(x, y, width, height));
}

beforeEach(() => {
  document.head.innerHTML = "<style>* { opacity: 1; }</style>";
  document.body.innerHTML = "";
  bounds(document.documentElement, 0, 0, 1000, 2000);
});

describe("shared field and frame visibility", () => {
  it.each(["auto", "scroll"])("retains below-fold controls and frames in overflow:%s", (overflow) => {
    document.body.innerHTML = `<div style="overflow:${overflow};height:150px"><input name="last"><iframe></iframe></div>`;
    bounds(document.querySelector("div")!, 0, 0, 300, 150);
    bounds(document.querySelector("input")!, 10, 600, 100, 30);
    bounds(document.querySelector("iframe")!, 10, 650, 200, 100);
    expect(collectFields(document).map((field) => field.name)).toEqual(["last"]);
    expect(isFrameHostVisible(document.querySelector("iframe")!)).toBe(true);
  });

  it("retains a frame above the viewport after ordinary page scrolling", () => {
    document.body.innerHTML = "<iframe></iframe>";
    bounds(document.querySelector("iframe")!, 10, -700, 300, 150);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(800);
    expect(isFrameHostVisible(document.querySelector("iframe")!)).toBe(true);
  });

  it.each(["hidden", "clip"])("rejects fields and frames fully outside nonzero overflow:%s bounds", (overflow) => {
    document.body.innerHTML = `<div style="overflow:${overflow}"><input name="trap"><iframe></iframe></div>`;
    bounds(document.querySelector("div")!, 0, 0, 100, 100);
    bounds(document.querySelector("input")!, 200, 10, 100, 30);
    bounds(document.querySelector("iframe")!, 200, 10, 300, 150);
    expect(collectFields(document)).toEqual([]);
    expect(isFrameHostVisible(document.querySelector("iframe")!)).toBe(false);
  });

  it("clips only the configured axis", () => {
    document.body.innerHTML = '<div style="overflow-x:clip;overflow-y:visible"><input name="below"><iframe></iframe></div>';
    bounds(document.querySelector("div")!, 0, 0, 300, 100);
    bounds(document.querySelector("input")!, 10, 600, 100, 30);
    bounds(document.querySelector("iframe")!, 10, 650, 200, 100);
    expect(collectFields(document).map((field) => field.name)).toEqual(["below"]);
    expect(isFrameHostVisible(document.querySelector("iframe")!)).toBe(true);
  });

  it("keeps content reachable through nested scrollers inside clipping ancestors", () => {
    document.body.innerHTML = '<div id="clip" style="overflow:hidden"><div id="scroll" style="overflow:auto"><input name="reachable"><iframe></iframe></div></div>';
    bounds(document.querySelector("#clip")!, 0, 0, 300, 100);
    bounds(document.querySelector("#scroll")!, 0, 0, 300, 100);
    bounds(document.querySelector("input")!, 10, 600, 100, 30);
    bounds(document.querySelector("iframe")!, 10, 650, 200, 100);
    expect(collectFields(document).map((field) => field.name)).toEqual(["reachable"]);
    expect(isFrameHostVisible(document.querySelector("iframe")!)).toBe(true);
    document.querySelector("#scroll")!.scrollTop = 700;
    bounds(document.querySelector("input")!, 10, -100, 100, 30);
    bounds(document.querySelector("iframe")!, 10, -50, 200, 100);
    expect(collectFields(document).map((field) => field.name)).toEqual(["reachable"]);
    expect(isFrameHostVisible(document.querySelector("iframe")!)).toBe(true);
  });

  it("does not let page scroll make fixed offscreen honeypots accessible", () => {
    document.body.innerHTML = '<input name="fixed-trap" style="position:fixed"><iframe style="position:fixed"></iframe>';
    bounds(document.querySelector("input")!, 10, -300, 100, 30);
    bounds(document.querySelector("iframe")!, 10, -300, 200, 100);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(800);
    expect(collectFields(document)).toEqual([]);
    expect(isFrameHostVisible(document.querySelector("iframe")!)).toBe(false);
  });
});
