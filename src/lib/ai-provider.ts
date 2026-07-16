import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { Provider, type ModelOption } from "./models";

export function createAiModel(model: ModelOption, apiKey: string): LanguageModel {
  if (model.provider === Provider.Gemini) {
    const google = createGoogleGenerativeAI({ apiKey });
    return google(model.id);
  }

  const openai = createOpenAI({ apiKey });
  return openai.responses(model.id);
}
