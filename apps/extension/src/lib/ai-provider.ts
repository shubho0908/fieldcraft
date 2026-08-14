import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import {
  CustomProtocol,
  Provider,
  customModelId,
  isCustomModelId,
  sanitizeAnthropicBaseUrl,
  sanitizeCustomBaseUrl,
  type ModelOption,
} from "./models";

export interface CreateAiModelOptions {
  model: ModelOption;
  apiKey: string;
  /** Required for {@link Provider.Custom}; ignored for built-in providers. */
  baseURL?: string;
  /** Which protocol a custom endpoint speaks. Ignored for built-in providers. */
  protocol?: CustomProtocol;
  /** Optional extra headers for a custom endpoint. Ignored for built-in providers. */
  headers?: Record<string, string>;
}

export function createAiModel(options: CreateAiModelOptions): LanguageModel {
  const { model, apiKey, baseURL, protocol, headers } = options;
  const customHeaders =
    headers && Object.keys(headers).length > 0 ? headers : undefined;

  if (model.provider === Provider.Gemini) {
    const google = createGoogleGenerativeAI({ apiKey });
    return google(model.id);
  }

  if (model.provider === Provider.Custom) {
    const actualModelId = isCustomModelId(model.id)
      ? customModelId(model.id)
      : model.id;
    if (!actualModelId) {
      throw new Error("Enter a custom model ID before analyzing.");
    }
    if (!baseURL?.trim()) {
      throw new Error("Enter a custom base URL before analyzing.");
    }

    if (protocol === CustomProtocol.Anthropic) {
      const trimmedBaseURL = sanitizeAnthropicBaseUrl(baseURL);
      console.info(
        `[fieldcraft ai-provider] anthropic provider: baseURL=${trimmedBaseURL} model=${actualModelId}`,
      );
      // Anthropic's official API uses x-api-key; most third-party
      // Anthropic-compatible gateways (MiniMax, DashScope, etc.) expect Bearer.
      const isAnthropicHost = new URL(trimmedBaseURL).hostname.endsWith(
        "anthropic.com",
      );
      const anthropic = createAnthropic(
        isAnthropicHost
          ? { apiKey, baseURL: trimmedBaseURL, headers: customHeaders }
          : { authToken: apiKey, baseURL: trimmedBaseURL, headers: customHeaders },
      );
      return anthropic(actualModelId);
    }

    const trimmedBaseURL = sanitizeCustomBaseUrl(baseURL);
    console.info(
      `[fieldcraft ai-provider] openai provider: baseURL=${trimmedBaseURL} model=${actualModelId}`,
    );
    const openai = createOpenAI({
      apiKey,
      baseURL: trimmedBaseURL,
      headers: customHeaders,
    });
    return openai.chat(actualModelId);
  }

  const openai = createOpenAI({ apiKey });
  return openai.responses(model.id);
}
