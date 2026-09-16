import { describe, expect, test } from "vitest";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from "./defaults";
import { AnthropicModelId, Provider } from "./models";
import type { CandidateProfile } from "../types";
import {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  backupFileName,
  buildBackup,
  parseBackup,
  sanitizeBackupApiKeys,
  serializeBackup,
} from "./profile-transfer";

function sampleProfile(): CandidateProfile {
  const profile = structuredClone(DEFAULT_PROFILE);
  profile.identity.fullName = "Shubhojeet Bera";
  profile.identity.email = "shubho@example.com";
  profile.defaults.yearsOfExperience = "4";
  profile.canonicalAnswers = [
    { id: "answer-1", question: "Why this company?", answer: "Because scope." },
  ];
  profile.resumeAttachment = {
    name: "resume.pdf",
    mimeType: "application/pdf",
    size: 12345,
    dataUrl: "data:application/pdf;base64,JVBERi0=",
  };
  profile.onboardingComplete = true;
  return profile;
}

describe("buildBackup", () => {
  test("stamps the envelope format, schema version, timestamps and app version", () => {
    const backup = buildBackup({
      profile: sampleProfile(),
      settings: { ...DEFAULT_SETTINGS },
      apiKeys: { openai: "sk-openai" },
      appVersion: "1.2.3",
      now: new Date("2026-08-21T10:00:00.000Z"),
    });

    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(backup.exportedAt).toBe("2026-08-21T10:00:00.000Z");
    expect(backup.appVersion).toBe("1.2.3");
    expect(backup.profile.identity.fullName).toBe("Shubhojeet Bera");
    expect(backup.settings.provider).toBe(Provider.OpenAI);
    expect(backup.apiKeys).toEqual({ openai: "sk-openai" });
  });
});

describe("parseBackup", () => {
  test("round-trips a serialized backup back to the same data", () => {
    const backup = buildBackup({
      profile: sampleProfile(),
      settings: { ...DEFAULT_SETTINGS, provider: Provider.Gemini },
      apiKeys: { gemini: " g-key ", exa: "exa-key" },
      appVersion: "1.2.3",
      now: new Date("2026-08-21T10:00:00.000Z"),
    });

    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.backup.exportedAt).toBe("2026-08-21T10:00:00.000Z");
    expect(parsed.backup.appVersion).toBe("1.2.3");
    expect(parsed.backup.profile.identity.email).toBe("shubho@example.com");
    expect(parsed.backup.profile.defaults.yearsOfExperience).toBe("4");
    expect(parsed.backup.profile.canonicalAnswers).toHaveLength(1);
    expect(parsed.backup.profile.resumeAttachment?.name).toBe("resume.pdf");
    expect(parsed.backup.settings.provider).toBe(Provider.Gemini);
    expect(parsed.backup.apiKeys.gemini).toBe("g-key");
    expect(parsed.backup.apiKeys.exa).toBe("exa-key");
    expect(parsed.backup.includesApiKeys).toBe(true);
  });

  test("rejects non-object input", () => {
    expect(parseBackup("not json").ok).toBe(false);
    expect(parseBackup(null).ok).toBe(false);
    expect(parseBackup(42).ok).toBe(false);
    expect(parseBackup([]).ok).toBe(false);
  });

  test("rejects payloads with the wrong format marker", () => {
    const parsed = parseBackup({ format: "other-app-backup", schemaVersion: 1 });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toMatch(/not a valid fieldcraft backup/i);
  });

  test("rejects backups with a missing schema version", () => {
    const parsed = parseBackup({ format: BACKUP_FORMAT });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toMatch(/not a valid fieldcraft backup/i);
  });

  test("rejects future schema versions with an update hint", () => {
    const parsed = parseBackup({ format: BACKUP_FORMAT, schemaVersion: 99 });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toMatch(/newer version of fieldcraft/i);
  });

  test("fills missing profile fields from defaults instead of failing", () => {
    const parsed = parseBackup({
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: "2026-01-01T00:00:00.000Z",
      profile: { identity: { fullName: "Only Name" }, canonicalAnswers: [{ question: "Q" }] },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.backup.profile.identity.fullName).toBe("Only Name");
    expect(parsed.backup.profile.identity.email).toBe("");
    expect(parsed.backup.profile.voice.maxShortWords).toBe(
      DEFAULT_PROFILE.voice.maxShortWords,
    );
    expect(parsed.backup.profile.canonicalAnswers[0].id).toBeTruthy();
    expect(parsed.backup.settings.provider).toBe(DEFAULT_SETTINGS.provider);
  });

  test("normalizes an invalid export timestamp to empty string", () => {
    const parsed = parseBackup({
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: "not-a-date",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.exportedAt).toBe("");
  });

  test("reports no API keys when the backup carries none", () => {
    const parsed = parseBackup({
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: "2026-01-01T00:00:00.000Z",
      apiKeys: {},
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.apiKeys).toEqual({});
    expect(parsed.backup.includesApiKeys).toBe(false);
  });
});

describe("Anthropic settings restore", () => {
  test("keeps Anthropic analyze and eval models on the same provider", () => {
    const parsed = parseBackup({
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: "2026-09-16T00:00:00.000Z",
      appVersion: "0.1.0",
      profile: DEFAULT_PROFILE,
      settings: {
        ...DEFAULT_SETTINGS,
        provider: Provider.Anthropic,
        model: AnthropicModelId.ClaudeSonnet5,
        evalModel: DEFAULT_SETTINGS.evalModel,
      },
      apiKeys: { anthropic: "sk-ant-test" },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.settings.provider).toBe(Provider.Anthropic);
    expect(parsed.backup.settings.model).toBe(AnthropicModelId.ClaudeSonnet5);
    expect(parsed.backup.settings.evalModel).toBe(AnthropicModelId.ClaudeOpus5);
    expect(parsed.backup.apiKeys.anthropic).toBe("sk-ant-test");
  });
});

describe("sanitizeBackupApiKeys", () => {
  test("trims values and drops empty or non-string entries", () => {
    expect(
      sanitizeBackupApiKeys({
        openai: "  sk-test  ",
        gemini: "",
        anthropic: "  sk-ant-test  ",
        custom: 42,
        exa: null,
        unknown: "ignored",
      }),
    ).toEqual({ openai: "sk-test", anthropic: "sk-ant-test" });
  });

  test("returns an empty object for garbage input", () => {
    expect(sanitizeBackupApiKeys(undefined)).toEqual({});
    expect(sanitizeBackupApiKeys("keys")).toEqual({});
    expect(sanitizeBackupApiKeys([["openai", "x"]])).toEqual({});
  });
});

describe("backupFileName", () => {
  test("derives a dated file name from the export timestamp", () => {
    expect(backupFileName("2026-08-21T10:00:00.000Z")).toBe(
      "fieldcraft-backup-2026-08-21.json",
    );
  });

  test("falls back to today's date when the timestamp is unusable", () => {
    const name = backupFileName("");
    expect(name).toMatch(/^fieldcraft-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
