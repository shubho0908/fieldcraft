import type {
  CandidateProfile,
  ExtensionSettings,
  TabAnalysisSession,
} from "../types";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from "./defaults";
import { ReasoningEffortSettingAuto, isAutofillMode } from "./enums";
import {
  defaultModelForProvider,
  isProvider,
  isKnownModel,
  Provider,
  isReasoningEffortSetting,
  resolveModel,
} from "./models";

const KEYS = {
  profile: "fieldcraft.profile",
  settings: "fieldcraft.settings",
  /** Legacy OpenAI key name, retained for a safe one-time read migration. */
  apiKey: "fieldcraft.apiKey",
  openAiApiKey: "fieldcraft.openAiApiKey",
  geminiApiKey: "fieldcraft.geminiApiKey",
  exaApiKey: "fieldcraft.exaApiKey",
  tabSessions: "fieldcraft.tabAnalysisSessions",
  installId: "fieldcraft.installId",
};

const MAX_TAB_SESSIONS = 24;
let tabSessionMutation: Promise<void> = Promise.resolve();

// OpenAI documents gpt-5.6 as an alias for the canonical GPT-5.6 Sol ID.
// Preserve an existing user's intentional Sol choice while keeping the catalog
// itself on stable, explicit model IDs.
const LEGACY_MODEL_ALIASES: Readonly<Record<string, string>> = {
  "gpt-5.6": "gpt-5.6-sol",
};

export async function getProfile(): Promise<CandidateProfile> {
  const stored = await chrome.storage.local.get(KEYS.profile);
  return mergeProfile(stored[KEYS.profile] as Partial<CandidateProfile> | undefined);
}

export async function saveProfile(profile: CandidateProfile): Promise<void> {
  await chrome.storage.local.set({
    [KEYS.profile]: { ...profile, updatedAt: new Date().toISOString() },
  });
}

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(KEYS.settings);
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(stored[KEYS.settings] ?? {}),
  } as ExtensionSettings;

  settings.model = LEGACY_MODEL_ALIASES[settings.model] ?? settings.model;
  settings.evalModel = LEGACY_MODEL_ALIASES[settings.evalModel] ?? settings.evalModel;

  if (!isProvider(settings.provider)) {
    settings.provider = isKnownModel(settings.model)
      ? resolveModel(settings.model).provider
      : DEFAULT_SETTINGS.provider;
  }
  if (!isKnownModel(settings.model) || resolveModel(settings.model).provider !== settings.provider) {
    settings.model = defaultModelForProvider(settings.provider).id;
  }
  if (!isReasoningEffortSetting(settings.reasoningEffort)) {
    settings.reasoningEffort = DEFAULT_SETTINGS.reasoningEffort;
  }
  if (!isKnownModel(settings.evalModel)) {
    settings.evalModel = DEFAULT_SETTINGS.evalModel;
  }
  if (!isReasoningEffortSetting(settings.evalReasoningEffort)) {
    settings.evalReasoningEffort = DEFAULT_SETTINGS.evalReasoningEffort;
  }
  if (!isAutofillMode(settings.autofillMode)) {
    settings.autofillMode = DEFAULT_SETTINGS.autofillMode;
  }

  // Exa is optional. Never leave research enabled when its separate key is
  // unavailable, otherwise a normal job analysis would fail after setup.
  if (settings.researchCompany && !(await hasExaApiKey())) {
    settings.researchCompany = false;
  }

  // Clamp stored effort if the current model cannot accept it.
  if (settings.reasoningEffort !== ReasoningEffortSettingAuto) {
    const model = resolveModel(settings.model);
    if (!model.supportedReasoningEfforts.includes(settings.reasoningEffort)) {
      settings.reasoningEffort = DEFAULT_SETTINGS.reasoningEffort;
    }
  }
  if (settings.evalReasoningEffort !== ReasoningEffortSettingAuto) {
    const evalModel = resolveModel(settings.evalModel);
    if (!evalModel.supportedReasoningEfforts.includes(settings.evalReasoningEffort)) {
      settings.evalReasoningEffort = DEFAULT_SETTINGS.evalReasoningEffort;
    }
  }

  return settings;
}

export async function saveSettings(
  settings: ExtensionSettings,
): Promise<void> {
  await chrome.storage.local.set({ [KEYS.settings]: settings });
}

export async function saveApiKey(
  provider: Provider,
  apiKey: string,
  remember: boolean,
): Promise<void> {
  const key = apiKey.trim();
  const storageKey = apiKeyStorageKey(provider);
  if (remember) {
    await chrome.storage.local.set({ [storageKey]: key });
    await chrome.storage.session.remove(storageKey);
  } else {
    await chrome.storage.session.set({ [storageKey]: key });
    await chrome.storage.local.remove(storageKey);
  }
}

export async function getApiKey(provider: Provider): Promise<string> {
  const storageKey = apiKeyStorageKey(provider);
  const session = await chrome.storage.session.get(storageKey);
  if (session[storageKey]) return String(session[storageKey]);
  const local = await chrome.storage.local.get(storageKey);
  if (local[storageKey]) return String(local[storageKey]);

  // Existing installs only had one key and supported OpenAI. Never reuse that
  // key for Gemini, where it would be both misleading and invalid.
  if (provider !== Provider.OpenAI) return "";
  const legacySession = await chrome.storage.session.get(KEYS.apiKey);
  if (legacySession[KEYS.apiKey]) return String(legacySession[KEYS.apiKey]);
  const legacyLocal = await chrome.storage.local.get(KEYS.apiKey);
  return String(legacyLocal[KEYS.apiKey] ?? "");
}

export async function hasApiKey(provider: Provider): Promise<boolean> {
  return Boolean(await getApiKey(provider));
}

export async function clearApiKey(provider: Provider): Promise<void> {
  const storageKey = apiKeyStorageKey(provider);
  await Promise.all([
    chrome.storage.local.remove(storageKey),
    chrome.storage.session.remove(storageKey),
    ...(provider === Provider.OpenAI
      ? [
          chrome.storage.local.remove(KEYS.apiKey),
          chrome.storage.session.remove(KEYS.apiKey),
        ]
      : []),
  ]);
}

function apiKeyStorageKey(provider: Provider): string {
  return provider === Provider.Gemini ? KEYS.geminiApiKey : KEYS.openAiApiKey;
}

export async function saveExaApiKey(apiKey: string): Promise<void> {
  const key = apiKey.trim();
  if (key) {
    await chrome.storage.local.set({ [KEYS.exaApiKey]: key });
  } else {
    await chrome.storage.local.remove(KEYS.exaApiKey);
  }
}

export async function getExaApiKey(): Promise<string> {
  const stored = await chrome.storage.local.get(KEYS.exaApiKey);
  return String(stored[KEYS.exaApiKey] ?? "");
}

export async function hasExaApiKey(): Promise<boolean> {
  return Boolean(await getExaApiKey());
}

export async function clearExaApiKey(): Promise<void> {
  await chrome.storage.local.remove(KEYS.exaApiKey);
}

/**
 * Tab sessions are intentionally session-scoped: they survive service-worker
 * suspension, but never become a misleading global "last analysis" next time
 * the browser is opened.
 */
export async function getTabAnalysisSession(
  tabId: number,
): Promise<TabAnalysisSession | null> {
  await tabSessionMutation;
  const sessions = await readTabAnalysisSessions();
  return sessions[String(tabId)] ?? null;
}

export async function mutateTabAnalysisSessions<T>(
  mutator: (sessions: Record<string, TabAnalysisSession>) => T,
): Promise<T> {
  const operation = tabSessionMutation.then(async () => {
    const sessions = await readTabAnalysisSessions();
    const value = mutator(sessions);
    await chrome.storage.session.set({
      [KEYS.tabSessions]: pruneTabAnalysisSessions(sessions),
    });
    return value;
  });

  tabSessionMutation = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

export async function removeTabAnalysisSession(tabId: number): Promise<void> {
  await mutateTabAnalysisSessions((sessions) => {
    delete sessions[String(tabId)];
  });
}

export async function getInstallId(): Promise<string> {
  const stored = await chrome.storage.local.get(KEYS.installId);
  if (stored[KEYS.installId]) return String(stored[KEYS.installId]);
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [KEYS.installId]: id });
  return id;
}

function mergeProfile(raw?: Partial<CandidateProfile>): CandidateProfile {
  if (!raw) return structuredClone(DEFAULT_PROFILE);
  return {
    ...DEFAULT_PROFILE,
    ...raw,
    identity: { ...DEFAULT_PROFILE.identity, ...(raw.identity ?? {}) },
    defaults: { ...DEFAULT_PROFILE.defaults, ...(raw.defaults ?? {}) },
    voice: { ...DEFAULT_PROFILE.voice, ...(raw.voice ?? {}) },
    canonicalAnswers: (raw.canonicalAnswers ?? []).map((item) => ({
      id: typeof item.id === "string" && item.id ? item.id : crypto.randomUUID(),
      question: item.question ?? "",
      answer: item.answer ?? "",
    })),
  };
}

async function readTabAnalysisSessions(): Promise<Record<string, TabAnalysisSession>> {
  const stored = await chrome.storage.session.get(KEYS.tabSessions);
  const raw = stored[KEYS.tabSessions];
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, TabAnalysisSession>).filter(
      ([tabId, session]) =>
        Number.isInteger(Number(tabId)) &&
        session &&
        typeof session === "object" &&
        typeof session.tabId === "number" &&
        typeof session.url === "string" &&
        typeof session.runId === "string",
    ),
  );
}

function pruneTabAnalysisSessions(
  sessions: Record<string, TabAnalysisSession>,
): Record<string, TabAnalysisSession> {
  const entries = Object.entries(sessions).sort(
    ([, left], [, right]) => right.updatedAt.localeCompare(left.updatedAt),
  );
  return Object.fromEntries(entries.slice(0, MAX_TAB_SESSIONS));
}
