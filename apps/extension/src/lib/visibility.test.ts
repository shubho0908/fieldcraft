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

  it("rejects controls parked above the scroll origin of a scrolled container", () => {
    document.body.innerHTML = '<div style="overflow:auto;height:150px"><input name="trap"><iframe></iframe></div>';
    const scroller = document.querySelector("div")!;
    bounds(scroller, 0, 500, 300, 150);
    bounds(document.querySelector("input")!, 10, 420, 100, 30);
    bounds(document.querySelector("iframe")!, 10, 420, 200, 40);
    expect(collectFields(document)).toEqual([]);
    expect(isFrameHostVisible(document.querySelector("iframe")!)).toBe(false);
  });

  it("keeps controls the scroller can still scroll up to", () => {
    document.body.innerHTML = '<div style="overflow:auto;height:150px"><input name="reachable"></div>';
    const scroller = document.querySelector("div")!;
    scroller.scrollTop = 200;
    bounds(scroller, 0, 500, 300, 150);
    bounds(document.querySelector("input")!, 10, 420, 100, 30);
    expect(collectFields(document).map((field) => field.name)).toEqual(["reachable"]);
  });

  it("keeps a field an inner scroller can return inside an outer scroller", () => {
    document.body.innerHTML = '<div id="outer" style="overflow:auto"><div id="inner" style="overflow:auto"><input name="reachable"><iframe></iframe></div></div>';
    document.querySelector("#inner")!.scrollTop = 300;
    bounds(document.querySelector("#outer")!, 0, 400, 300, 200);
    bounds(document.querySelector("#inner")!, 0, 400, 300, 200);
    bounds(document.querySelector("input")!, 10, 80, 100, 30);
    bounds(document.querySelector("iframe")!, 10, 120, 200, 80);
    expect(collectFields(document).map((field) => field.name)).toEqual(["reachable"]);
    expect(isFrameHostVisible(document.querySelector("iframe")!)).toBe(true);
  });

  it("keeps a field an inner horizontal scroller can return inside an outer scroller", () => {
    document.body.innerHTML = '<div id="outer" style="overflow-x:auto;overflow-y:visible"><div id="inner" style="overflow-x:auto;overflow-y:visible"><input name="reachable"></div></div>';
    document.querySelector("#inner")!.scrollLeft = 300;
    bounds(document.querySelector("#outer")!, 400, 0, 200, 80);
    bounds(document.querySelector("#inner")!, 400, 0, 200, 80);
    bounds(document.querySelector("input")!, 80, 10, 100, 30);
    expect(collectFields(document).map((field) => field.name)).toEqual(["reachable"]);
  });

  it("keeps a visible field when an ltr scroller sits inside an rtl scroller", () => {
    document.body.innerHTML = '<div id="outer" style="direction:rtl;overflow-x:auto;overflow-y:visible"><div id="inner" style="overflow-x:auto;overflow-y:visible"><input name="reachable"><iframe></iframe></div></div>';
    document.querySelector("#inner")!.scrollLeft = 300;
    bounds(document.querySelector("#outer")!, 0, 0, 300, 150);
    bounds(document.querySelector("#inner")!, 0, 0, 300, 150);
    bounds(document.querySelector("input")!, 20, 20, 100, 30);
    bounds(document.querySelector("iframe")!, 20, 60, 200, 40);
    expect(collectFields(document).map((field) => field.name)).toEqual(["reachable"]);
    expect(isFrameHostVisible(document.querySelector("iframe")!)).toBe(true);
  });

  it("keeps a field an inner rtl scroller can return to an rtl parent", () => {
    document.body.innerHTML = '<div id="outer" style="direction:rtl;overflow-x:auto;overflow-y:visible"><div id="inner" style="direction:rtl;overflow-x:auto;overflow-y:visible"><input name="reachable"></div></div>';
    document.querySelector("#inner")!.scrollLeft = -300;
    bounds(document.querySelector("#outer")!, 0, 0, 300, 150);
    bounds(document.querySelector("#inner")!, 0, 0, 300, 150);
    bounds(document.querySelector("input")!, 350, 20, 100, 30);
    expect(collectFields(document).map((field) => field.name)).toEqual(["reachable"]);
  });

  it("rejects a field that remains above the inner origin when that scroller returns to zero", () => {
    document.body.innerHTML = '<div id="outer" style="overflow:auto"><div id="inner" style="overflow:auto"><input name="trap"><iframe></iframe></div></div>';
    document.querySelector("#inner")!.scrollTop = 50;
    bounds(document.querySelector("#outer")!, 0, 500, 300, 200);
    bounds(document.querySelector("#inner")!, 0, 500, 300, 200);
    bounds(document.querySelector("input")!, 10, 420, 100, 30);
    bounds(document.querySelector("iframe")!, 10, 420, 200, 20);
    expect(collectFields(document)).toEqual([]);
    expect(isFrameHostVisible(document.querySelector("iframe")!)).toBe(false);
  });

  it("keeps a visible field in an rtl scroller scrolled toward the left", () => {
    document.body.innerHTML = '<div style="direction:rtl;overflow:auto"><input name="reachable"><iframe></iframe></div>';
    document.querySelector("div")!.scrollLeft = -240;
    bounds(document.querySelector("div")!, 0, 0, 300, 150);
    bounds(document.querySelector("input")!, 20, 20, 100, 30);
    bounds(document.querySelector("iframe")!, 20, 60, 200, 40);
    expect(collectFields(document).map((field) => field.name)).toEqual(["reachable"]);
    expect(isFrameHostVisible(document.querySelector("iframe")!)).toBe(true);
  });

  it("rejects a field parked past the rtl scroll start", () => {
    document.body.innerHTML = '<div style="direction:rtl;overflow:auto"><input name="trap"><iframe></iframe></div>';
    bounds(document.querySelector("div")!, 0, 0, 300, 150);
    bounds(document.querySelector("input")!, 400, 20, 100, 30);
    bounds(document.querySelector("iframe")!, 420, 60, 200, 40);
    expect(collectFields(document)).toEqual([]);
    expect(isFrameHostVisible(document.querySelector("iframe")!)).toBe(false);
  });

  it("keeps controls below the scroll origin of a scrolled container", () => {
    document.body.innerHTML = '<div style="overflow:auto;height:150px"><input name="below"></div>';
    const scroller = document.querySelector("div")!;
    bounds(scroller, 0, 500, 300, 150);
    bounds(document.querySelector("input")!, 10, 620, 100, 30);
    expect(collectFields(document).map((field) => field.name)).toEqual(["below"]);
  });
});
