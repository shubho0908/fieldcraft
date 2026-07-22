import { describe, expect, it } from "vitest";
import { compareVersions, versionSegments } from "./release-check";

describe("version comparison", () => {
  it("compares basic semver", () => {
    expect(compareVersions("0.2.0", "0.1.0")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0", "0.2.0")).toBeLessThan(0);
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
  });

  it("treats build metadata as newer than the plain version", () => {
    expect(compareVersions("0.1.0+build.123", "0.1.0")).toBeGreaterThan(0);
  });

  it("orders build numbers numerically", () => {
    expect(compareVersions("0.1.0+build.124", "0.1.0+build.123")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0+build.99", "0.1.0+build.100")).toBeLessThan(0);
  });

  it("ignores leading v in tags", () => {
    expect(versionSegments("v0.2.0")).toEqual([0, 2, 0]);
    expect(compareVersions("0.2.0", "v0.1.0")).toBeGreaterThan(0);
  });
});
