import type { BackupApiKeys, CandidateProfile, ExtensionSettings } from "../types";
import { mergeProfile, parseSettings } from "./storage";

export type { BackupApiKeys };

export const BACKUP_FORMAT = "fieldcraft-backup";
export const BACKUP_SCHEMA_VERSION = 1;

export interface FieldcraftBackup {
  format: string;
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  profile: CandidateProfile;
  settings: ExtensionSettings;
  apiKeys: BackupApiKeys;
}

export interface ParsedBackup {
  profile: CandidateProfile;
  settings: ExtensionSettings;
  apiKeys: BackupApiKeys;
  exportedAt: string;
  appVersion: string;
  includesApiKeys: boolean;
}

export type ParseBackupResult =
  | { ok: true; backup: ParsedBackup }
  | { ok: false; error: string };

const API_KEY_SLOTS = ["openai", "gemini", "custom", "exa"] as const;

export interface BuildBackupInput {
  profile: CandidateProfile;
  settings: ExtensionSettings;
  apiKeys: BackupApiKeys;
  appVersion?: string;
  now?: Date;
}

export function buildBackup(input: BuildBackupInput): FieldcraftBackup {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: (input.now ?? new Date()).toISOString(),
    appVersion: typeof input.appVersion === "string" ? input.appVersion : "",
    // Sanitize on the way out too — a backup should always be a valid restore.
    profile: mergeProfile(input.profile),
    settings: parseSettings(input.settings),
    apiKeys: sanitizeBackupApiKeys(input.apiKeys),
  };
}

export function serializeBackup(backup: FieldcraftBackup): string {
  return JSON.stringify(backup, null, 2);
}

export function parseBackup(raw: unknown): ParseBackupResult {
  // Accept pre-parsed objects or raw JSON text (what a picked file yields).
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { ok: false, error: NOT_A_BACKUP };
    }
  }
  if (!isPlainObject(value)) {
    return { ok: false, error: NOT_A_BACKUP };
  }
  if (value.format !== BACKUP_FORMAT) {
    return { ok: false, error: NOT_A_BACKUP };
  }

  const version = value.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: NOT_A_BACKUP };
  }
  if (version > BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      error:
        "This backup was created by a newer version of Fieldcraft. Update the extension and try again.",
    };
  }

  const apiKeys = sanitizeBackupApiKeys(value.apiKeys);
  return {
    ok: true,
    backup: {
      profile: mergeProfile(value.profile as Partial<CandidateProfile> | undefined),
      settings: parseSettings(value.settings as Partial<ExtensionSettings> | undefined),
      apiKeys,
      exportedAt: normalizeTimestamp(value.exportedAt),
      appVersion: typeof value.appVersion === "string" ? value.appVersion : "",
      includesApiKeys: Object.values(apiKeys).some((entry) => Boolean(entry)),
    },
  };
}

export function sanitizeBackupApiKeys(raw: unknown): BackupApiKeys {
  if (!isPlainObject(raw)) return {};
  const keys: BackupApiKeys = {};
  for (const slot of API_KEY_SLOTS) {
    const value = raw[slot];
    if (typeof value === "string" && value.trim()) {
      keys[slot] = value.trim();
    }
  }
  return keys;
}

export function backupFileName(exportedAt: string): string {
  const stamp =
    typeof exportedAt === "string" && !Number.isNaN(Date.parse(exportedAt))
      ? new Date(exportedAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  return `fieldcraft-backup-${stamp}.json`;
}

const NOT_A_BACKUP = "This file is not a valid Fieldcraft backup.";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value !== "string") return "";
  return Number.isNaN(Date.parse(value)) ? "" : value;
}
