import type {
  BackupApiKeys,
  CandidateProfile,
  ExtensionSettings,
  TabAnalysisSession,
} from "../types";
import { isSessionStorageSupported, sessionStorageApi } from "./ui-host";
import { normalizeSession } from "./tab-sessions";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from "./defaults";
import { ReasoningEffortSettingAuto, isAutofillMode } from "./enums";
import {
  CUSTOM_MODEL_PREFIX,
  CustomProtocol,
  Provider,
  customModelId,
  defaultModelForProvider,
  isCustomModelId,
  isCustomProtocol,
  isKnownModel,
  isProvider,
  isReasoningEffortSetting,
  resolveModel,
  sanitizeAnthropicBaseUrl,
  sanitizeCustomBaseUrl,
} from "./models";
import { sanitizeCustomHeaders } from "./custom-headers";

const KEYS = {
  profile: "fieldcraft.profile",
  settings: "fieldcraft.settings",
  /** Legacy OpenAI key name, retained for a safe one-time read migration. */
  apiKey: "fieldcraft.apiKey",
  openAiApiKey: "fieldcraft.openAiApiKey",
  geminiApiKey: "fieldcraft.geminiApiKey",
  anthropicApiKey: "fieldcraft.anthropicApiKey",
  customApiKey: "fieldcraft.customApiKey",
  exaApiKey: "fieldcraft.exaApiKey",
  tabSessions: "fieldcraft.tabAnalysisSessions",
  installId: "fieldcraft.installId",
};

const MAX_TAB_SESSIONS = 24;
let tabSessionMutation: Promise<void> = Promise.resolve();

/**
 * Returns the session storage area when available, otherwise falls back to
 * local storage. Safari supports `chrome.storage.session` from 16.4+; older
 * versions (and contexts without the API) fall back to local. Callers that
 * need strict session semantics should still prefer this over local directly.
 */
function getSessionStorage(): chrome.storage.StorageArea {
  return sessionStorageApi() ?? chrome.storage.local;
}

/**
 * Tab sessions are meant to be session-scoped. On browsers without
 * `chrome.storage.session` we fall back to `chrome.storage.local`, so clear
 * any stale tab sessions at browser startup to avoid showing old job results
 * when a tab ID is reused after a restart.
 */
export async function clearTabSessionsIfSessionStorageMissing(): Promise<void> {
  if (isSessionStorageSupported()) return;
  await chrome.storage.local.remove(KEYS.tabSessions);
}

const LEGACY_MODEL_ALIASES: Readonly<Record<string, string>> = {
  "gpt-5.6": "gpt-5.6-sol",
  "gpt-5.5": "gpt-6-sol",
  "gpt-5.5-pro": "gpt-6-sol",
};

/**
 * Single-shot boot loader — replaces the old pattern of 5 separate
 * chrome.storage IPC calls (getProfile + getSettings + hasExaApiKey +
 * getSettings→hasExaApiKey + hasApiKey) with 2 parallel multi-get reads.
 * Returns everything the App boot screen needs in ~one round-trip.
 */
export async function getBootData(): Promise<{
  profile: CandidateProfile;
  settings: ExtensionSettings;
  apiKeyExists: boolean;
  exaApiKeyExists: boolean;
}> {
  const sessionApi = sessionStorageApi();
  const [local, session] = await Promise.all([
    chrome.storage.local.get([
      KEYS.profile,
      KEYS.settings,
      KEYS.openAiApiKey,
      KEYS.geminiApiKey,
      KEYS.anthropicApiKey,
      KEYS.customApiKey,
      KEYS.apiKey,
      KEYS.exaApiKey,
    ]),
    sessionApi
      ? sessionApi.get([
          KEYS.openAiApiKey,
          KEYS.geminiApiKey,
          KEYS.anthropicApiKey,
          KEYS.customApiKey,
          KEYS.apiKey,
        ])
      : Promise.resolve({} as Record<string, unknown>),
  ]);

  const profile = mergeProfile(local[KEYS.profile] as Partial<CandidateProfile> | undefined);
  const settings = parseSettings(local[KEYS.settings] as Partial<ExtensionSettings> | undefined);
  const exaApiKeyExists = Boolean(local[KEYS.exaApiKey]);

  // Clamp researchCompany when the required Exa key is absent (same logic
  // that was previously duplicated inside getSettings).
  if (settings.researchCompany && !exaApiKeyExists) {
    settings.researchCompany = false;
  }

  // Mirrors getApiKey() lookup: session first, then local, then legacy key.
  const provider = settings.provider;
  const storageKey = apiKeyStorageKey(provider);
  const apiKeyExists = Boolean(
    session[storageKey] ?? local[storageKey] ?? local[KEYS.apiKey] ?? session[KEYS.apiKey],
  );

  return { profile, settings, apiKeyExists, exaApiKeyExists };
}

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
  const settings = parseSettings(stored[KEYS.settings] as Partial<ExtensionSettings> | undefined);

  // Exa is optional. Never leave research enabled when its separate key is
  // unavailable, otherwise a normal job analysis would fail after setup.
  if (settings.researchCompany && !(await hasExaApiKey())) {
    settings.researchCompany = false;
  }

  return settings;
}

function normalizeCustomModelId(
  provider: Provider,
  modelId: string,
): string {
  if (provider !== Provider.Custom) return modelId;
  const actual = modelId.startsWith(CUSTOM_MODEL_PREFIX)
    ? customModelId(modelId)
    : modelId;
  return `${CUSTOM_MODEL_PREFIX}${actual.trim()}`;
}

function isValidCustomSettings(settings: ExtensionSettings): boolean {
  return (
    settings.provider === Provider.Custom &&
    settings.customBaseUrl.trim().length > 0 &&
    customModelId(settings.model).trim().length > 0 &&
    customModelId(settings.evalModel).trim().length > 0
  );
}

/** Synchronous settings validation — shared by getSettings(), getBootData(), and profile transfer. */
export function parseSettings(raw: Partial<ExtensionSettings> | undefined): ExtensionSettings {
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(raw ?? {}),
  } as ExtensionSettings;

  // Retired model IDs map to their replacements only for built-in providers.
  // A custom endpoint may legitimately serve a model with the same ID (e.g.
  // `gpt-5.5`), so rewriting it here would corrupt the custom model request.
  const aliasRetiredModelId = (modelId: string): string =>
    settings.provider === Provider.Custom
      ? modelId
      : LEGACY_MODEL_ALIASES[modelId] ?? modelId;

  settings.model = aliasRetiredModelId(settings.model);
  settings.evalModel = aliasRetiredModelId(settings.evalModel);

  if (!isCustomProtocol(settings.customProtocol)) {
    settings.customProtocol = DEFAULT_SETTINGS.customProtocol;
  }

  if (typeof settings.customBaseUrl !== "string") {
    settings.customBaseUrl = DEFAULT_SETTINGS.customBaseUrl;
  } else if (settings.customProtocol === CustomProtocol.Anthropic) {
    settings.customBaseUrl = sanitizeAnthropicBaseUrl(settings.customBaseUrl);
  } else {
    settings.customBaseUrl = sanitizeCustomBaseUrl(settings.customBaseUrl);
  }

  settings.customHeaders = sanitizeCustomHeaders(settings.customHeaders);

  // Any stored `custom:` model id forces the provider to Custom so the model
  // is not silently dropped/replaced with a built-in default.
  if (isCustomModelId(settings.model) || isCustomModelId(settings.evalModel)) {
    settings.provider = Provider.Custom;
  }

  if (!isProvider(settings.provider)) {
    settings.provider = isKnownModel(settings.model)
      ? resolveModel(settings.model).provider
      : DEFAULT_SETTINGS.provider;
  }

  // Custom models encode the real model id after `custom:`; normalize and keep it.
  // The UI only exposes one custom model ID, so analyze/eval stay in sync.
  if (settings.provider === Provider.Custom) {
    settings.model = normalizeCustomModelId(settings.provider, settings.model);
    settings.evalModel = settings.model;
    if (!isValidCustomSettings(settings)) {
      settings.model = defaultModelForProvider(Provider.Custom).id;
      settings.evalModel = settings.model;
      settings.customBaseUrl = DEFAULT_SETTINGS.customBaseUrl;
    }
  } else if (
    !isKnownModel(settings.model) ||
    resolveModel(settings.model).provider !== settings.provider
  ) {
    settings.model = defaultModelForProvider(settings.provider).id;
  }

  if (
    !isKnownModel(settings.evalModel) ||
    (settings.provider !== Provider.Custom &&
      resolveModel(settings.evalModel).provider !== settings.provider)
  ) {
    settings.evalModel = defaultModelForProvider(settings.provider).id;
  }

  if (!isReasoningEffortSetting(settings.reasoningEffort)) {
    settings.reasoningEffort = DEFAULT_SETTINGS.reasoningEffort;
  }
  if (!isReasoningEffortSetting(settings.evalReasoningEffort)) {
    settings.evalReasoningEffort = DEFAULT_SETTINGS.evalReasoningEffort;
  }
  if (!isAutofillMode(settings.autofillMode)) {
    settings.autofillMode = DEFAULT_SETTINGS.autofillMode;
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

  // Drop bogus maxOutputTokens overrides; the call site resolves a safe default.
  if (
    typeof settings.maxOutputTokens !== "undefined" &&
    (typeof settings.maxOutputTokens !== "number" ||
      !Number.isFinite(settings.maxOutputTokens) ||
      settings.maxOutputTokens <= 0)
  ) {
    settings.maxOutputTokens = undefined;
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
  const sessionApi = sessionStorageApi();

  if (remember) {
    await chrome.storage.local.set({ [storageKey]: key });
    if (sessionApi) await sessionApi.remove(storageKey);
  } else if (sessionApi) {
    await sessionApi.set({ [storageKey]: key });
    await chrome.storage.local.remove(storageKey);
  } else {
    // Safari <16.4 has no session storage area. Keep the key in local as a
    // pragmatic fallback so the extension remains usable, even though the user's
    // "don't remember" preference cannot be honored in that runtime.
    await chrome.storage.local.set({ [storageKey]: key });
  }
}

export async function getApiKey(provider: Provider): Promise<string> {
  const storageKey = apiKeyStorageKey(provider);
  const sessionApi = sessionStorageApi();
  const session = sessionApi ? await sessionApi.get(storageKey) : {};
  if (session[storageKey]) return String(session[storageKey]);
  const local = await chrome.storage.local.get(storageKey);
  if (local[storageKey]) return String(local[storageKey]);

  // Existing installs only had one key and supported OpenAI. Never reuse that
  // key for Gemini, where it would be both misleading and invalid.
  if (provider !== Provider.OpenAI) return "";
  const legacySession = sessionApi ? await sessionApi.get(KEYS.apiKey) : {};
  if (legacySession[KEYS.apiKey]) return String(legacySession[KEYS.apiKey]);
  const legacyLocal = await chrome.storage.local.get(KEYS.apiKey);
  return String(legacyLocal[KEYS.apiKey] ?? "");
}

export async function hasApiKey(provider: Provider): Promise<boolean> {
  return Boolean(await getApiKey(provider));
}

export async function clearApiKey(provider: Provider): Promise<void> {
  const storageKey = apiKeyStorageKey(provider);
  const sessionApi = sessionStorageApi();
  await Promise.all([
    chrome.storage.local.remove(storageKey),
    ...(sessionApi ? [sessionApi.remove(storageKey)] : []),
    ...(provider === Provider.OpenAI
      ? [
          chrome.storage.local.remove(KEYS.apiKey),
          ...(sessionApi ? [sessionApi.remove(KEYS.apiKey)] : []),
        ]
      : []),
  ]);
}

function apiKeyStorageKey(provider: Provider): string {
  if (provider === Provider.Gemini) return KEYS.geminiApiKey;
  if (provider === Provider.Anthropic) return KEYS.anthropicApiKey;
  if (provider === Provider.Custom) return KEYS.customApiKey;
  return KEYS.openAiApiKey;
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

/**
 * Reads every durably remembered key (local storage only). Session-scoped keys
 * are ephemeral by design and intentionally excluded, e.g. from backups.
 */
export async function getDurableApiKeys(): Promise<BackupApiKeys> {
  const local = await chrome.storage.local.get([
    KEYS.openAiApiKey,
    KEYS.geminiApiKey,
    KEYS.anthropicApiKey,
    KEYS.customApiKey,
    // Legacy single-key name; migrate it into the OpenAI slot when present.
    KEYS.apiKey,
    KEYS.exaApiKey,
  ]);
  const keys: BackupApiKeys = {};
  const openai = String(local[KEYS.openAiApiKey] ?? local[KEYS.apiKey] ?? "").trim();
  if (openai) keys.openai = openai;
  const gemini = String(local[KEYS.geminiApiKey] ?? "").trim();
  if (gemini) keys.gemini = gemini;
  const anthropic = String(local[KEYS.anthropicApiKey] ?? "").trim();
  if (anthropic) keys.anthropic = anthropic;
  const custom = String(local[KEYS.customApiKey] ?? "").trim();
  if (custom) keys.custom = custom;
  const exa = String(local[KEYS.exaApiKey] ?? "").trim();
  if (exa) keys.exa = exa;
  return keys;
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
  return normalizeSession(sessions[String(tabId)] ?? null);
}

export async function mutateTabAnalysisSessions<T>(
  mutator: (sessions: Record<string, TabAnalysisSession>) => T,
): Promise<T> {
  const operation = tabSessionMutation.then(async () => {
    const sessions = await readTabAnalysisSessions();
    const value = mutator(sessions);
    await getSessionStorage().set({
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

/** Shared with lib/profile-transfer so backups sanitize through the same path. */
export function mergeProfile(raw?: Partial<CandidateProfile>): CandidateProfile {
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
  const stored = await getSessionStorage().get(KEYS.tabSessions);
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
