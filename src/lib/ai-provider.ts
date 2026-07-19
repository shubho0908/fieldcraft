import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import {
  Provider,
  customModelId,
  isCustomModelId,
  type ModelOption,
} from "./models";

export interface CreateAiModelOptions {
  model: ModelOption;
  apiKey: string;
  /** Required for {@link Provider.Custom}; ignored for built-in providers. */
  baseURL?: string;
}

export function createAiModel(options: CreateAiModelOptions): LanguageModel {
  const { model, apiKey, baseURL } = options;
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
    const openai = createOpenAI({ apiKey, baseURL: baseURL.trim() });
    return openai.chat(actualModelId);
  }

  const openai = createOpenAI({ apiKey });
  return openai.responses(model.id);
}
