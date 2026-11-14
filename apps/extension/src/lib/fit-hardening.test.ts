import { describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from "./defaults";
import { FitVerdict, HARD_BLOCKER_SCORE_CAP } from "./enums";
import { sanitizeFit } from "./fit";
import { coerceAnalysisOutput, runJobAnalysis, sanitizeAnalysis } from "./openai";
import type { PageSnapshot } from "../types";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  jsonSchema: (schema: unknown) => schema,
  Output: { object: (config: { schema: unknown }) => config.schema },
}));
vi.mock("./ai-provider", () => ({ createAiModel: vi.fn(() => ({})) }));

const snapshot: PageSnapshot = {
  title: "Product designer", url: "https://example.com/job", hostname: "example.com",
  ats: "Generic", headings: [], pageText: "Design accessible financial products.",
  fields: [], capturedAt: "2026-11-14T00:00:00Z",
};
const auth = { apiKey: "mock-key", installId: "test" };

describe("fit hardening", () => {
  it("forces real blockers into the weak band at both boundaries", () => {
    const fit = { score: 93, hardBlockers: ["Requires US citizenship"] };
    const result = sanitizeFit(fit);
    expect(HARD_BLOCKER_SCORE_CAP).toBeLessThanOrEqual(49);
    expect(result.verdict).toBe(FitVerdict.Weak);
    const output = coerceAnalysisOutput({ fit });
    expect(sanitizeAnalysis(output, snapshot, [], false).fit.verdict).toBe(FitVerdict.Weak);
  });

  it.each(["None", "N/A", "na", "null", "NIL.", "-", "—", "No hard blockers", "No blockers identified.", "No hard blockers identified!"])(
    "ignores the placeholder blocker %s", async (placeholder) => {
      const raw = { fit: { score: 88, hardBlockers: [placeholder] } };
      const output = coerceAnalysisOutput(raw);
      expect(sanitizeFit(output.fit).score).toBe(88);
      vi.mocked(generateText).mockResolvedValueOnce({ output: raw, finishReason: "stop" } as never);
      const result = await runJobAnalysis(snapshot, DEFAULT_PROFILE, DEFAULT_SETTINGS, auth);
      expect(result.fit.score).toBe(88);
      expect(result.fit.hardBlockers).toEqual([]);
    },
  );

  it.each(["82", " 82.4 ", "8.2e1"])("accepts a finite numeric string %s", async (score) => {
    const output = coerceAnalysisOutput({ fit: { score } });
    expect(output.fit.score).toBeCloseTo(Number(score));
    vi.mocked(generateText).mockResolvedValueOnce({ text: JSON.stringify({ fit: { score } }), finishReason: "stop" } as never);
    const result = await runJobAnalysis(snapshot, DEFAULT_PROFILE, { ...DEFAULT_SETTINGS, model: "custom:test" }, auth);
    expect(result.fit.score).toBe(82);
    expect(result.fit.verdict).toBe(FitVerdict.Strong);
  });

  it.each([undefined, null, "", " ", "82 points", "0x52", "NaN", "Infinity", NaN, Infinity, false, [], {}])(
    "rejects an unavailable or malformed score %s instead of fabricating zero", async (score) => {
      expect(() => sanitizeFit({ score } as never)).toThrow(/missing or invalid fit score/i);
      expect(() => coerceAnalysisOutput({ fit: { score } })).toThrow(/missing or invalid fit score/i);
      vi.mocked(generateText).mockResolvedValueOnce({ output: { fit: { score } }, finishReason: "stop" } as never);
      await expect(runJobAnalysis(snapshot, DEFAULT_PROFILE, DEFAULT_SETTINGS, auth)).rejects.toThrow(/missing or invalid fit score/i);
    },
  );

  it("preserves a real zero score", () => {
    expect(sanitizeFit({ score: 0 }).score).toBe(0);
    expect(coerceAnalysisOutput({ fitScore: "0" }).fit.score).toBe(0);
  });

  it("does not relabel industry, work policy, or compensation as other company facts", async () => {
    const raw = { fit: { score: 82 }, company: { industry: "Healthcare", locationPolicy: "Remote", compensation: "$180k" } };
    const output = coerceAnalysisOutput(raw);
    expect(output.company).toMatchObject({ summary: "", product: "", funding: "" });
    vi.mocked(generateText).mockResolvedValueOnce({ output: raw, finishReason: "stop" } as never);
    const result = await runJobAnalysis(snapshot, DEFAULT_PROFILE, DEFAULT_SETTINGS, auth);
    expect(result.company).toMatchObject({ summary: "", product: "", funding: "" });
  });

  it("drops malformed suggestion items before the sanitizer sees them", async () => {
    const raw = { fit: { score: 82 }, suggestions: [null, 42, "bad", {}, { fieldId: 42 }] };
    expect(coerceAnalysisOutput(raw).suggestions).toEqual([]);
    vi.mocked(generateText).mockResolvedValueOnce({ text: JSON.stringify(raw), finishReason: "stop" } as never);
    await expect(runJobAnalysis(snapshot, DEFAULT_PROFILE, { ...DEFAULT_SETTINGS, model: "custom:test" }, auth)).resolves.toMatchObject({ suggestions: [] });
  });
});
