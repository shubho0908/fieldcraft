import { describe, expect, it, vi } from "vitest";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAiModel } from "./ai-provider";
import { CustomProtocol, Provider } from "./models";

const openaiChat = vi.fn(() => ({ id: "openai-chat" }));
const openaiResponses = vi.fn(() => ({ id: "openai-responses" }));
const googleModel = vi.fn(() => ({ id: "google-model" }));
const anthropicModel = vi.fn(() => ({ id: "anthropic-model" }));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => ({
    chat: openaiChat,
    responses: openaiResponses,
  })),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => googleModel),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => anthropicModel),
}));

describe("createAiModel", () => {
  it("throws when a custom model id is empty", () => {
    expect(() =>
      createAiModel({
        model: { provider: Provider.Custom, id: "custom:" } as any,
        apiKey: "sk-test",
        baseURL: "https://api.example.com/v1",
      }),
    ).toThrow("Enter a custom model ID before analyzing.");
  });

  it("throws when a custom base URL is empty", () => {
    expect(() =>
      createAiModel({
        model: { provider: Provider.Custom, id: "custom:claude-test" } as any,
        apiKey: "sk-test",
      }),
    ).toThrow("Enter a custom base URL before analyzing.");
  });

  it("routes OpenAI-compatible custom endpoints through createOpenAI", () => {
    createAiModel({
      model: { provider: Provider.Custom, id: "custom:test-model" } as any,
      apiKey: "sk-test",
      baseURL: "https://api.fireworks.ai/inference/v1",
      protocol: CustomProtocol.OpenAI,
    });
    expect(openaiChat).toHaveBeenCalledWith("test-model");
  });

  it("routes Anthropic-compatible endpoints through createAnthropic", () => {
    createAiModel({
      model: { provider: Provider.Custom, id: "custom:claude-sonnet-4-5" } as any,
      apiKey: "sk-test",
      baseURL: "https://api.anthropic.com/v1",
      protocol: CustomProtocol.Anthropic,
    });
    expect(anthropicModel).toHaveBeenCalledWith("claude-sonnet-4-5");
  });

  it("normalizes Anthropic base URLs to the /v1 root", () => {
    createAiModel({
      model: { provider: Provider.Custom, id: "custom:claude-test" } as any,
      apiKey: "sk-test",
      baseURL: "https://api.anthropic.com/v1/messages",
      protocol: CustomProtocol.Anthropic,
    });
    expect(createAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "https://api.anthropic.com/v1" }),
    );
  });

  it("uses x-api-key for anthropic.com and Bearer for other hosts", () => {
    createAiModel({
      model: { provider: Provider.Custom, id: "custom:claude-test" } as any,
      apiKey: "sk-anthropic",
      baseURL: "https://api.anthropic.com/v1",
      protocol: CustomProtocol.Anthropic,
    });
    expect(createAnthropic).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiKey: "sk-anthropic" }),
    );

    createAiModel({
      model: { provider: Provider.Custom, id: "custom:minimax-test" } as any,
      apiKey: "sk-minimax",
      baseURL: "https://api.minimax.io/anthropic/v1",
      protocol: CustomProtocol.Anthropic,
    });
    expect(createAnthropic).toHaveBeenLastCalledWith(
      expect.objectContaining({ authToken: "sk-minimax" }),
    );
  });

  it("passes custom headers through to custom OpenAI and Anthropic endpoints", () => {
    const headers = { "X-Title": "Fieldcraft", "HTTP-Referer": "https://fieldcraft.shubhojeet.me" };
    createAiModel({
      model: { provider: Provider.Custom, id: "custom:test-model" } as any,
      apiKey: "sk-test",
      baseURL: "https://api.openrouter.ai/api/v1",
      protocol: CustomProtocol.OpenAI,
      headers,
    });
    expect(createOpenAI).toHaveBeenLastCalledWith(
      expect.objectContaining({
        apiKey: "sk-test",
        baseURL: "https://api.openrouter.ai/api/v1",
        headers,
      }),
    );

    createAiModel({
      model: { provider: Provider.Custom, id: "custom:claude-test" } as any,
      apiKey: "sk-test",
      baseURL: "https://api.anthropic.com/v1",
      protocol: CustomProtocol.Anthropic,
      headers,
    });
    expect(createAnthropic).toHaveBeenLastCalledWith(
      expect.objectContaining({
        apiKey: "sk-test",
        baseURL: "https://api.anthropic.com/v1",
        headers,
      }),
    );
  });

  it("ignores empty custom header objects", () => {
    createAiModel({
      model: { provider: Provider.Custom, id: "custom:test-model" } as any,
      apiKey: "sk-test",
      baseURL: "https://api.example.com/v1",
      protocol: CustomProtocol.OpenAI,
      headers: {},
    });
    expect(createOpenAI).toHaveBeenLastCalledWith(
      expect.objectContaining({
        apiKey: "sk-test",
        baseURL: "https://api.example.com/v1",
      }),
    );
    // Empty headers should not appear as an explicit empty object, because the
    // provider factory treats undefined more consistently.
    expect(createOpenAI).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ headers: {} }),
    );
  });

  it("routes built-in providers through their respective factories", () => {
    createAiModel({
      model: { provider: Provider.Gemini, id: "gemini-3.5-flash" } as any,
      apiKey: "sk-gemini",
    });
    expect(createGoogleGenerativeAI).toHaveBeenCalledWith({ apiKey: "sk-gemini" });

    createAiModel({
      model: { provider: Provider.OpenAI, id: "gpt-5.6-terra" } as any,
      apiKey: "sk-openai",
    });
    expect(createOpenAI).toHaveBeenLastCalledWith({ apiKey: "sk-openai" });
    expect(openaiResponses).toHaveBeenCalledWith("gpt-5.6-terra");

    createAiModel({
      model: { provider: Provider.Anthropic, id: "claude-opus-5" } as any,
      apiKey: "sk-ant-test",
    });
    expect(createAnthropic).toHaveBeenLastCalledWith({ apiKey: "sk-ant-test" });
    expect(anthropicModel).toHaveBeenCalledWith("claude-opus-5");
  });
});
