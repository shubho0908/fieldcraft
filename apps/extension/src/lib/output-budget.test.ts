import { describe, expect, it, vi } from "vitest";
import { generateText, streamText } from "ai";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from "./defaults";
import { formatAnalysisError, runJobAnalysis } from "./openai";
import { Provider, resolveMaxOutputTokens } from "./models";
import { hundredFieldOutput, hundredFieldSnapshot } from "./__fixtures__/large-analysis";

vi.mock("ai", () => ({
  generateText: vi.fn(), streamText: vi.fn(),
  jsonSchema: (schema: unknown) => schema,
  Output: { object: (config: { schema: unknown }) => config.schema },
}));
vi.mock("./ai-provider", () => ({ createAiModel: vi.fn(() => ({})) }));

const auth = { apiKey: "mock-key", installId: "test" };

describe("analysis output budgets", () => {
  it.each(["builtin", "custom", "anthropic-custom"])("rejects %s truncated output before reading partial JSON", async (provider) => {
    const result = {
      finishReason: Promise.resolve("length"), text: Promise.resolve('{"fit":{"score":82'),
      get output() { throw new Error("No object generated: partial JSON"); },
    };
    const custom = provider !== "builtin";
    const settings = { ...DEFAULT_SETTINGS, ...(custom ? { model: "custom:test", provider: Provider.Custom } : {}), customProtocol: provider === "anthropic-custom" ? "anthropic" as const : "openai" as const };
    vi.mocked(provider === "anthropic-custom" ? streamText : generateText).mockResolvedValueOnce(result as never);
    await expect(runJobAnalysis(hundredFieldSnapshot, DEFAULT_PROFILE, settings, auth)).rejects.toThrow(/output.*truncated.*increase.*output tokens.*reduce.*fields/i);
  });

  it("formats SDK structured-output errors carrying the length finish reason", async () => {
    const error = Object.assign(new Error("No object generated"), { finishReason: "length" });
    expect(formatAnalysisError(error, Provider.OpenAI)).toMatch(/truncated.*output tokens/i);
    vi.mocked(generateText).mockRejectedValueOnce(error);
    await expect(runJobAnalysis(hundredFieldSnapshot, DEFAULT_PROFILE, DEFAULT_SETTINGS, auth)).rejects.toThrow(/truncated.*output tokens/i);
  });

  it("provides headroom over the measured 100-field response and preserves every answer", async () => {
    const serialized = JSON.stringify(hundredFieldOutput);
    const estimatedTokens = Math.ceil(new TextEncoder().encode(serialized).length / 3);
    expect(hundredFieldSnapshot.fields).toHaveLength(100);
    expect(hundredFieldOutput.suggestions.every((suggestion) => suggestion.value.split(/\s+/).length >= 130)).toBe(true);
    expect(resolveMaxOutputTokens(DEFAULT_SETTINGS.model)).toBeGreaterThan(estimatedTokens * 1.5);
    expect(resolveMaxOutputTokens("custom:test")).toBeGreaterThan(estimatedTokens * 1.5);
    vi.mocked(generateText).mockResolvedValueOnce({ output: hundredFieldOutput, finishReason: "stop" } as never);
    const result = await runJobAnalysis(hundredFieldSnapshot, DEFAULT_PROFILE, DEFAULT_SETTINGS, auth);
    expect(result.suggestions.map((suggestion) => suggestion.value)).toEqual(hundredFieldOutput.suggestions.map((suggestion) => suggestion.value));
    expect(vi.mocked(generateText).mock.calls[0][0].maxOutputTokens).toBeGreaterThan(estimatedTokens * 1.5);
  });
});
