import { describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from "./defaults";
import { coerceAnalysisOutput, normalizeSuggestion, runJobAnalysis, sanitizeAnalysis } from "./openai";
import type { FieldSuggestion, PageField, PageSnapshot } from "../types";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  jsonSchema: (schema: unknown) => schema,
  Output: { object: (config: { schema: unknown }) => config.schema },
}));
vi.mock("./ai-provider", () => ({ createAiModel: vi.fn(() => ({})) }));

const field: PageField = {
  id: "answer", kind: "textarea", type: "textarea", name: "answer", label: "Why this role?",
  placeholder: "", ariaLabel: "", section: "", required: true, sensitive: false,
  currentValue: "", maxLength: 12, options: [],
};
const snapshot: PageSnapshot = {
  title: "Designer", url: "https://example.com/job", hostname: "example.com", ats: "Generic",
  headings: [], pageText: "Design accessible products.", fields: [field], capturedAt: "2026-11-14T00:00:00Z",
};
const suggestion: FieldSuggestion = {
  fieldId: "answer", label: field.label, action: "fill", value: "I designed accessible products.",
  confidence: "high", evidence: "Resume: accessible product design", warning: "Verify the role title.",
};
const auth = { apiKey: "mock-key", installId: "test" };

describe("suggestion safety normalization", () => {
  it("requires review for a model-proposed legal answer even at high confidence", async () => {
    const legalField = { ...field, label: "Are you authorized to work?", maxLength: null };
    const answer = { ...suggestion, value: "Yes", warning: "" };
    expect(normalizeSuggestion(answer, legalField).action).toBe("review");
    vi.mocked(generateText).mockResolvedValueOnce({ output: { fit: { score: 82 }, suggestions: [answer] }, finishReason: "stop" } as never);
    expect((await runJobAnalysis({ ...snapshot, fields: [legalField] }, DEFAULT_PROFILE, DEFAULT_SETTINGS, auth)).suggestions[0].action).toBe("review");
  });
  it("announces maxLength truncation, preserves prior warnings, and requires review", async () => {
    const normalized = normalizeSuggestion(suggestion, field);
    expect(normalized.value).toHaveLength(12);
    expect(normalized.action).toBe("review");
    expect(normalized.warning).toMatch(/truncated.*12/i);
    expect(normalized.warning).toContain(suggestion.warning);
    vi.mocked(generateText).mockResolvedValueOnce({ output: { fit: { score: 82 }, suggestions: [suggestion] }, finishReason: "stop" } as never);
    const result = await runJobAnalysis(snapshot, DEFAULT_PROFILE, DEFAULT_SETTINGS, auth);
    expect(result.suggestions[0]).toMatchObject(normalized);
  });

  it("demotes low confidence fills even when evidence and value exist", async () => {
    const low = { ...suggestion, value: "Design", confidence: "low" as const, warning: "" };
    expect(normalizeSuggestion(low, field)).toMatchObject({ action: "review", warning: expect.stringMatching(/low.confidence/i) });
    vi.mocked(generateText).mockResolvedValueOnce({ output: { fit: { score: 82 }, suggestions: [low] }, finishReason: "stop" } as never);
    const result = await runJobAnalysis(snapshot, DEFAULT_PROFILE, DEFAULT_SETTINGS, auth);
    expect(result.suggestions[0].action).toBe("review");
  });

  it("does not truncate or demote a grounded answer exactly at the limit", () => {
    const answer = { ...suggestion, value: "x".repeat(12), warning: "" };
    expect(normalizeSuggestion(answer, field)).toMatchObject({ action: "fill", value: answer.value, warning: "" });
  });

  it("does not crash on malformed direct sanitizer input and still covers all fields", () => {
    const output = coerceAnalysisOutput({ fit: { score: 82 } });
    output.suggestions = [null, { ...suggestion, fieldId: "unknown" }] as never;
    expect(sanitizeAnalysis(output, snapshot, [], false).suggestions).toEqual([
      expect.objectContaining({ fieldId: field.id, action: "review", value: "" }),
    ]);
  });
});
