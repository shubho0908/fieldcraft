import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "./lib/defaults";
import { GeminiModelId, OpenAiModelId, ReasoningEffort } from "./lib/enums";
import { Provider } from "./lib/models";

vi.mock("./lib/storage", () => ({
  clearTabSessionsIfSessionStorageMissing: vi.fn().mockResolvedValue(undefined),
  getExaApiKey: vi.fn(),
  getProfile: vi.fn(),
  getSettings: vi.fn(),
  getTabAnalysisSession: vi.fn(),
  mutateTabAnalysisSessions: vi.fn().mockResolvedValue(undefined),
  removeTabAnalysisSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./lib/openai", () => ({
  analyzeJob: vi.fn(),
  testAiConnection: vi.fn(),
}));

vi.mock("./lib/exa", () => ({
  testExaConnection: vi.fn(),
}));

vi.mock("./lib/release-check", () => ({}));

import { getExaApiKey, getSettings } from "./lib/storage";
import { testAiConnection } from "./lib/openai";

type MessageListener = (
  request: { type: string; model?: string; reasoningEffort?: string },
  sender: chrome.runtime.MessageSender,
  respond: (response: unknown) => void,
) => boolean | void;

async function loadMessageListener() {
  const onMessage = { addListener: vi.fn() };
  const event = () => ({ addListener: vi.fn() });
  vi.stubGlobal("chrome", {
    runtime: { onMessage, onInstalled: event(), onStartup: event(), onConnect: event() },
    alarms: { onAlarm: event(), get: vi.fn(), create: vi.fn() },
    commands: { onCommand: event() },
    action: { onClicked: event() },
    tabs: { onRemoved: event(), onUpdated: event() },
    storage: { session: undefined, local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() } },
  });
  await import("./background");
  return onMessage.addListener.mock.calls[0][0] as MessageListener;
}

function send(
  listener: MessageListener,
  request: { type: string; model?: string; reasoningEffort?: string },
): Promise<{ ok: boolean; model?: string; error?: string }> {
  return new Promise((resolve) => listener(request, {}, resolve as (r: unknown) => void));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("background FIELDCRAFT_TEST_API model alignment", () => {
  it("probes the stored Gemini model and reports its id", async () => {
    const listener = await loadMessageListener();
    vi.mocked(getSettings).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      provider: Provider.Gemini,
      model: GeminiModelId.Gemini38Flash,
    });
    vi.mocked(getExaApiKey).mockResolvedValue("");
    vi.mocked(testAiConnection).mockResolvedValue({ model: GeminiModelId.Gemini38Flash });

    const response = await send(listener, {
      type: "FIELDCRAFT_TEST_API",
      model: GeminiModelId.Gemini38Flash,
      reasoningEffort: ReasoningEffort.High,
    });

    expect(response).toMatchObject({ ok: true, model: GeminiModelId.Gemini38Flash });
    expect(testAiConnection).toHaveBeenCalledWith(GeminiModelId.Gemini38Flash, ReasoningEffort.High);
  });

  it("rejects a stale request instead of reporting the wrong model", async () => {
    const listener = await loadMessageListener();
    vi.mocked(getSettings).mockResolvedValue({
      ...DEFAULT_SETTINGS,
      provider: Provider.Gemini,
      model: GeminiModelId.Gemini38Flash,
    });
    vi.mocked(getExaApiKey).mockResolvedValue("");
    vi.mocked(testAiConnection).mockClear();

    const response = await send(listener, {
      type: "FIELDCRAFT_TEST_API",
      model: OpenAiModelId.Gpt56Terra,
    });

    expect(response.ok).toBe(false);
    expect(String(response.error)).toMatch(/Model mismatch/);
    expect(testAiConnection).not.toHaveBeenCalled();
  });
});
