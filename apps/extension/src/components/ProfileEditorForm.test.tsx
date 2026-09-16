import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from "../lib/defaults";
import {
  AnthropicModelId,
  Provider,
  modelsForProvider,
  reasoningEffortsForModel,
} from "../lib/models";
import { ProfileEditorForm, type ProfileEditorFormProps } from "./ProfileEditorForm";

function renderAnthropicForm() {
  const settings = {
    ...DEFAULT_SETTINGS,
    provider: Provider.Anthropic,
    model: AnthropicModelId.ClaudeOpus5,
    evalModel: AnthropicModelId.ClaudeOpus5,
  };
  const noop = vi.fn();
  const props: ProfileEditorFormProps = {
    onboarding: false,
    step: 3,
    steps: ["Identity", "Experience", "Defaults", "Writing + AI"],
    progress: 100,
    profile: structuredClone(DEFAULT_PROFILE),
    settings,
    apiKey: "",
    showApiKey: false,
    customHeadersText: "",
    error: "",
    saving: false,
    testing: false,
    testStatus: "",
    apiKeyExists: false,
    exaApiKey: "",
    showExaApiKey: false,
    exaApiKeyExists: false,
    effortOptions: reasoningEffortsForModel(settings.model),
    evalEffortOptions: reasoningEffortsForModel(settings.evalModel),
    setProfile: noop,
    setSettings: noop,
    setApiKeyState: noop,
    setShowApiKey: noop,
    setExaApiKeyState: noop,
    setShowExaApiKey: noop,
    updateIdentity: noop,
    updateDefault: noop,
    updateVoice: noop,
    updateModel: noop,
    updateCustomModelId: noop,
    updateCustomBaseUrl: noop,
    updateCustomProtocol: noop,
    updateCustomHeaders: noop,
    updateEvalModel: noop,
    updateProvider: noop,
    updateMaxOutputTokens: noop,
    setResearchCompany: noop,
    attachResume: noop,
    testConnection: noop,
    removeApiKey: noop,
    removeExaApiKey: noop,
    next: noop,
    setStep: noop,
  };
  return renderToStaticMarkup(<ProfileEditorForm {...props} />);
}

describe("ProfileEditorForm Anthropic provider", () => {
  it("renders Anthropic as a first-class provider with its Claude catalog", () => {
    const html = renderAnthropicForm();
    expect(html).toContain("Anthropic");
    expect(html).toContain("Claude Opus 5");
    expect(modelsForProvider(Provider.Anthropic).map((model) => model.label)).toEqual([
      "Claude Opus 5",
      "Claude Sonnet 5",
      "Claude Haiku 4.5",
    ]);
    expect(html).toContain("Anthropic API key");
  });

  it("keeps custom endpoint controls hidden for the built-in Anthropic provider", () => {
    const html = renderAnthropicForm();
    expect(html).not.toContain("Custom base URL");
    expect(html).not.toContain("Endpoint protocol");
  });
});
