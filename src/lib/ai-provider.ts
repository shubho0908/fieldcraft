import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { Provider, type ModelOption } from "./models";

export function createAiModel(model: ModelOption, apiKey: string): LanguageModel {
  if (model.provider === Provider.Anthropic) {
    const anthropic = createAnthropic({ apiKey });
    return anthropic(model.id);
  }

  const openai = createOpenAI({ apiKey });
  return openai.responses(model.id);
}
