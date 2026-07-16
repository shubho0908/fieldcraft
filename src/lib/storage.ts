import type {
  CachedAnalysis,
  CandidateProfile,
  ExtensionSettings,
} from "../types";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from "./defaults";

const KEYS = {
  profile: "fieldcraft.profile",
  settings: "fieldcraft.settings",
  apiKey: "fieldcraft.apiKey",
  cache: "fieldcraft.lastAnalysis",
  installId: "fieldcraft.installId",
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
  return { ...DEFAULT_SETTINGS, ...(stored[KEYS.settings] ?? {}) };
}

export async function saveSettings(
  settings: ExtensionSettings,
): Promise<void> {
  await chrome.storage.local.set({ [KEYS.settings]: settings });
}

export async function saveApiKey(
  apiKey: string,
  remember: boolean,
): Promise<void> {
  const key = apiKey.trim();
  if (remember) {
    await chrome.storage.local.set({ [KEYS.apiKey]: key });
    await chrome.storage.session.remove(KEYS.apiKey);
  } else {
    await chrome.storage.session.set({ [KEYS.apiKey]: key });
    await chrome.storage.local.remove(KEYS.apiKey);
  }
}

export async function getApiKey(): Promise<string> {
  const session = await chrome.storage.session.get(KEYS.apiKey);
  if (session[KEYS.apiKey]) return String(session[KEYS.apiKey]);
  const local = await chrome.storage.local.get(KEYS.apiKey);
  return String(local[KEYS.apiKey] ?? "");
}

export async function hasApiKey(): Promise<boolean> {
  return Boolean(await getApiKey());
}

export async function clearApiKey(): Promise<void> {
  await Promise.all([
    chrome.storage.local.remove(KEYS.apiKey),
    chrome.storage.session.remove(KEYS.apiKey),
  ]);
}

export async function getCachedAnalysis(): Promise<CachedAnalysis | null> {
  const stored = await chrome.storage.local.get(KEYS.cache);
  return (stored[KEYS.cache] as CachedAnalysis | undefined) ?? null;
}

export async function saveCachedAnalysis(cache: CachedAnalysis): Promise<void> {
  await chrome.storage.local.set({ [KEYS.cache]: cache });
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
    canonicalAnswers: raw.canonicalAnswers ?? [],
  };
}
