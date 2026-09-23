import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { DEFAULT_SETTINGS } from "./defaults";
import { AnthropicModelId, GeminiModelId, OpenAiModelId, ReasoningEffort } from "./enums";
import { Provider } from "./models";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
  jsonSchema: (schema: unknown) => schema,
  Output: { object: (config: { schema: unknown }) => config.schema },
}));

vi.mock("./ai-provider", () => ({
  createAiModel: vi.fn(() => ({ id: "fake-model" })),
}));

vi.mock("./storage", () => ({
  getApiKey: vi.fn(),
  getSettings: vi.fn(),
  getInstallId: vi.fn(),
  getExaApiKey: vi.fn(),
}));

import { testAiConnection } from "./openai";
import { createAiModel } from "./ai-provider";
import { getApiKey, getInstallId, getSettings } from "./storage";

describe("testAiConnection model alignment (Gemini mismatch fix)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getInstallId).mockResolvedValue("install-1");
    vi.mocked(generateText).mockResolvedValue({
      finishReason: "stop",
      response: { id: "resp-1" },
      text: "connected",
    } as never);
  });

  it("rejects unknown model ids instead of silently probing GPT", async () => {
    vi.mocked(getApiKey).mockResolvedValue("sk-test");
    vi.mocked(getSettings).mockResolvedValue({ ...DEFAULT_SETTINGS });

    await expect(testAiConnection("not-a-model")).rejects.toThrow(/Unknown model/);
    await expect(testAiConnection("")).rejects.toThrow(/Unknown model/);
    // Must never fall back to probing the default GPT model.
    expect(createAiModel).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
  });

  it("probes the requested Gemini model (not GPT) and returns its id", async () => {
    vi.mocked(getApiKey).mockImplementation(async (provider: Provider) => {
      expect(provider).toBe(Provider.Gemini);
      return "sk-gemini";
    });
    vi.mocked(getSettings).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      provider: Provider.Gemini,
      model: GeminiModelId.Gemini38Flash,
      reasoningEffort: ReasoningEffort.High,
    });

    const result = await testAiConnection(GeminiModelId.Gemini38Flash, ReasoningEffort.High);

    expect(result.model).toBe(GeminiModelId.Gemini38Flash);
    expect(result.model).not.toBe(OpenAiModelId.Gpt56Terra);
    expect(createAiModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ id: GeminiModelId.Gemini38Flash }),
      }),
    );
  });

  it("forwards the selected Gemini reasoning as thinkingConfig", async () => {
    vi.mocked(getApiKey).mockResolvedValue("sk-gemini");
    vi.mocked(getSettings).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      provider: Provider.Gemini,
      model: GeminiModelId.Gemini38Flash,
      reasoningEffort: ReasoningEffort.High,
    });

    await testAiConnection(GeminiModelId.Gemini38Flash, ReasoningEffort.High);

    const call = vi.mocked(generateText).mock.calls[0][0] as {
      providerOptions?: unknown;
    };
    expect(call.providerOptions).toEqual({
      google: { thinkingConfig: { thinkingLevel: "high" } },
    });
  });

  it("forwards the selected OpenAI reasoning instead of hardcoded none", async () => {
    vi.mocked(getApiKey).mockResolvedValue("sk-openai");
    vi.mocked(getSettings).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      provider: Provider.OpenAI,
      model: OpenAiModelId.Gpt6Sol,
      reasoningEffort: ReasoningEffort.High,
    });

    await testAiConnection(OpenAiModelId.Gpt6Sol, ReasoningEffort.High);

    const call = vi.mocked(generateText).mock.calls[0][0] as {
      providerOptions?: unknown;
    };
    expect(call.providerOptions).toEqual({
      openai: expect.objectContaining({ reasoningEffort: ReasoningEffort.High }),
    });
  });

  it("clamps none on GPT-6 Astra", async () => {
    vi.mocked(getApiKey).mockResolvedValue("sk-openai");
    vi.mocked(getSettings).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      provider: Provider.OpenAI,
      model: OpenAiModelId.Gpt6Astra,
      reasoningEffort: ReasoningEffort.None,
    });

    const result = await testAiConnection(OpenAiModelId.Gpt6Astra, ReasoningEffort.None);

    expect(result.model).toBe(OpenAiModelId.Gpt6Astra);
    const call = vi.mocked(generateText).mock.calls[0][0] as {
      providerOptions?: unknown;
    };
    expect(call.providerOptions).toEqual({
      openai: expect.objectContaining({ reasoningEffort: ReasoningEffort.Medium }),
    });
  });

  it("falls back to stored settings reasoning when no explicit effort is passed", async () => {
    vi.mocked(getApiKey).mockResolvedValue("sk-gemini");
    vi.mocked(getSettings).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      provider: Provider.Gemini,
      model: GeminiModelId.Gemini38Flash,
      reasoningEffort: ReasoningEffort.Low,
    });

    await testAiConnection(GeminiModelId.Gemini38Flash);

    const call = vi.mocked(generateText).mock.calls[0][0] as {
      providerOptions?: unknown;
    };
    expect(call.providerOptions).toEqual({
      google: { thinkingConfig: { thinkingLevel: "low" } },
    });
  });

  it("forwards Anthropic adaptive effort for reasoning-capable Claude models", async () => {
    vi.mocked(getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(getSettings).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      provider: Provider.Anthropic,
      model: AnthropicModelId.ClaudeOpus55,
      reasoningEffort: ReasoningEffort.XHigh,
    });

    const result = await testAiConnection(AnthropicModelId.ClaudeOpus55, ReasoningEffort.XHigh);

    expect(result.model).toBe(AnthropicModelId.ClaudeOpus55);
    const call = vi.mocked(generateText).mock.calls[0][0] as {
      providerOptions?: unknown;
    };
    expect(call.providerOptions).toEqual({
      anthropic: { effort: ReasoningEffort.XHigh },
    });
  });

  it("clamps none on Opus 5.5 to medium", async () => {
    vi.mocked(getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(getSettings).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      provider: Provider.Anthropic,
      model: AnthropicModelId.ClaudeOpus55,
      reasoningEffort: ReasoningEffort.None,
    });

    const result = await testAiConnection(
      AnthropicModelId.ClaudeOpus55,
      ReasoningEffort.None,
    );

    expect(result.model).toBe(AnthropicModelId.ClaudeOpus55);
    const call = vi.mocked(generateText).mock.calls[0][0] as {
      providerOptions?: unknown;
    };
    // None would hit Anthropic's 400 `thinking.type.disabled is not supported`.
    expect(call.providerOptions).toEqual({
      anthropic: { effort: ReasoningEffort.Medium },
    });
  });

  it("sends no provider options for Anthropic models without reasoning levels", async () => {
    vi.mocked(getApiKey).mockResolvedValue("sk-ant-test");
    vi.mocked(getSettings).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      provider: Provider.Anthropic,
      model: AnthropicModelId.ClaudeHaiku45,
      reasoningEffort: ReasoningEffort.High,
    });

    await testAiConnection(AnthropicModelId.ClaudeHaiku45, ReasoningEffort.High);

    const call = vi.mocked(generateText).mock.calls[0][0] as {
      providerOptions?: unknown;
    };
    expect(call.providerOptions).toBeUndefined();
  });
});
