import { expect, it } from "vitest";
import { normalizeSourceUrl } from "./source-url";

it("normalizes host case and tracking without changing resource identity", () => {
  expect(normalizeSourceUrl("https://NEWS.example/Acme?id=Case&utm_source=eval&ref=review#facts"))
    .toBe("https://news.example/Acme?id=Case");
  expect(normalizeSourceUrl("https://news.example/Acme"))
    .not.toBe(normalizeSourceUrl("https://news.example/acme"));
  expect(normalizeSourceUrl("https://news.example/?id=Case"))
    .not.toBe(normalizeSourceUrl("https://news.example/?id=case"));
});

it.each(["not a URL", "javascript:alert(1)", "file:///private/report"])("rejects non-HTTP sources: %s", (url) => {
  expect(normalizeSourceUrl(url)).toBe("");
});
