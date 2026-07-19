import { describe, expect, it } from "vitest";
import {
  isThinCompanyResearch,
  sanitizeFit,
  verdictForScore,
} from "./fit";

import { FitVerdict, HARD_BLOCKER_SCORE_CAP } from "./enums";
describe("verdictForScore", () => {
  it("maps score bands", () => {
    expect(verdictForScore(100)).toBe(FitVerdict.Excellent);
    expect(verdictForScore(90)).toBe(FitVerdict.Excellent);
    expect(verdictForScore(89)).toBe(FitVerdict.Strong);
    expect(verdictForScore(75)).toBe(FitVerdict.Strong);
    expect(verdictForScore(74)).toBe(FitVerdict.Mixed);
    expect(verdictForScore(50)).toBe(FitVerdict.Mixed);
    expect(verdictForScore(49)).toBe(FitVerdict.Weak);
    expect(verdictForScore(0)).toBe(FitVerdict.Weak);
  });
});

describe("sanitizeFit", () => {
  it("clamps score and forces matching verdict", () => {
    expect(
      sanitizeFit({
        score: 140,
        verdict: FitVerdict.Weak,
        strongestMatches: ["React"],
        gaps: [],
        hardBlockers: [],
        recommendation: "Apply",
      }),
    ).toEqual({
      score: 100,
      verdict: FitVerdict.Excellent,
      strongestMatches: ["React"],
      gaps: [],
      hardBlockers: [],
      recommendation: "Apply",
    });
  });

  it("caps score when hard blockers exist", () => {
    const result = sanitizeFit({
      score: 92,
      verdict: FitVerdict.Excellent,
      strongestMatches: ["TypeScript"],
      gaps: ["No distributed systems"],
      hardBlockers: ["Requires US work authorization without sponsorship"],
      recommendation: "Still interesting, but blocked on authorization",
    });
    expect(result.score).toBe(HARD_BLOCKER_SCORE_CAP);
    expect(result.verdict).toBe(FitVerdict.Mixed);
    expect(result.hardBlockers).toHaveLength(1);
  });

  it("dedupes and trims list fields", () => {
    const result = sanitizeFit({
      score: 80,
      verdict: FitVerdict.Mixed,
      strongestMatches: [" React ", "react", "TypeScript", ""],
      gaps: ["  ", "Kafka"],
      hardBlockers: [],
      recommendation: "  Solid match  ",
    });
    expect(result.strongestMatches).toEqual(["React", "TypeScript"]);
    expect(result.gaps).toEqual(["Kafka"]);
    expect(result.recommendation).toBe("Solid match");
    expect(result.verdict).toBe(FitVerdict.Strong);
  });
});

describe("isThinCompanyResearch", () => {
  it("is false when research was not attempted", () => {
    expect(
      isThinCompanyResearch(
        {
          summary: "",
          product: "Unknown",
          stage: "Unknown",
          size: "Unknown",
          funding: "Unknown",
          engineeringSignals: [],
          risks: [],
          sources: [],
        },
        false,
      ),
    ).toBe(false);
  });

  it("is false when sources exist", () => {
    expect(
      isThinCompanyResearch(
        {
          summary: "A product company",
          product: "Unknown",
          stage: "Unknown",
          size: "Unknown",
          funding: "Unknown",
          engineeringSignals: [],
          risks: [],
          sources: [{ title: "About", url: "https://example.com/about" }],
        },
        true,
      ),
    ).toBe(false);
  });

  it("is true when research ran but facts and sources are empty", () => {
    expect(
      isThinCompanyResearch(
        {
          summary: "Little public information.",
          product: "Unknown",
          stage: "Unknown",
          size: "n/a",
          funding: "",
          engineeringSignals: [],
          risks: [],
          sources: [],
        },
        true,
      ),
    ).toBe(true);
  });
});
