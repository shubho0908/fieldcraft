import { useRef, useState } from "react";
import { AlertTriangle, Check, Download, Upload } from "lucide-react";
import type { BackupApiKeys, CandidateProfile, ExtensionSettings } from "../types";
import {
  backupFileName,
  buildBackup,
  parseBackup,
  serializeBackup,
  type ParsedBackup,
} from "../lib/profile-transfer";
import {
  getDurableApiKeys,
  saveApiKey,
  saveExaApiKey,
  saveProfile,
  saveSettings,
} from "../lib/storage";
import { Provider, resolveModel } from "../lib/models";

/** A picked backup should be a small JSON envelope; anything larger is wrong. */
const MAX_BACKUP_BYTES = 30 * 1024 * 1024;

interface Props {
  profile: CandidateProfile;
  settings: ExtensionSettings;
  /** Called after the backup was persisted; lets the editor refresh boot state. */
  onRestored: (
    profile: CandidateProfile,
    settings: ExtensionSettings,
    hasKey: boolean,
  ) => void;
}

type Stage = "idle" | "confirm-export" | "preview";

export function DataTransferCard({ profile, settings, onRestored }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function downloadBackup() {
    setBusy(true);
    setError("");
    try {
      const apiKeys = await getDurableApiKeys();
      const backup = buildBackup({
        profile,
        settings,
        apiKeys,
        appVersion: typeof __FIELDCRAFT_VERSION__ === "string" ? __FIELDCRAFT_VERSION__ : "",
      });
      // Anchor download must run inside this click-initiated task; keep the
      // whole flow synchronous after the storage read.
      const blob = new Blob([serializeBackup(backup)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = backupFileName(backup.exportedAt);
      anchor.click();
      URL.revokeObjectURL(url);
      setStage("idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the backup file.");
    } finally {
      setBusy(false);
    }
  }

  async function pickFile(file?: File | null) {
    if (!file) return;
    setError("");
    if (file.size > MAX_BACKUP_BYTES) {
      setError("That file is too large to be a Fieldcraft backup.");
      return;
    }
    try {
      const result = parseBackup(await file.text());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFileName(file.name);
      setParsed(result.backup);
      setStage("preview");
    } catch {
      setError("Could not read that file.");
    }
  }

  async function restore() {
    if (!parsed) return;
    setBusy(true);
    setError("");
    try {
      const carriesAiKey = Boolean(
        parsed.apiKeys.openai ?? parsed.apiKeys.gemini ?? parsed.apiKeys.custom,
      );
      // Restored keys land in durable storage, so keep the "remember" toggle honest.
      const restoredSettings = carriesAiKey
        ? { ...parsed.settings, rememberApiKey: true }
        : parsed.settings;
      await saveProfile(parsed.profile);
      await saveSettings(restoredSettings);
      await restoreApiKeys(parsed.apiKeys);
      onRestored(parsed.profile, restoredSettings, carriesAiKey);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not restore the backup.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStage("idle");
    setParsed(null);
    setError("");
  }

  return (
    <section className="editor-card data-transfer">
      <div className="section-heading">
        <h2>Backup &amp; restore</h2>
        <p>
          Move your Fieldcraft profile, settings, and saved keys between machines with a single
          JSON file.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          void pickFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {stage === "idle" && (
        <div className="transfer-actions">
          <button
            type="button"
            className="secondary-button compact"
            onClick={() => setStage("confirm-export")}
          >
            <Download size={14} /> Export backup
          </button>
          <button
            type="button"
            className="secondary-button compact"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} /> Import backup
          </button>
        </div>
      )}

      {stage === "confirm-export" && (
        <div className="transfer-warning" role="alert">
          <AlertTriangle size={16} />
          <div>
            <p>
              The backup file includes your API keys in plain text. Store it somewhere safe, and
              never share or email it.
            </p>
            <div className="transfer-actions">
              <button
                type="button"
                className="primary-button compact"
                onClick={() => void downloadBackup()}
                disabled={busy}
              >
                {busy ? "Preparing…" : "Download backup"} {!busy && <Download size={14} />}
              </button>
              <button type="button" className="text-danger" onClick={reset}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === "preview" && parsed && (
        <div className="transfer-preview">
          <strong>Restore this backup?</strong>
          <span className="transfer-meta">
            {fileName}
            {parsed.exportedAt
              ? ` · exported ${formatTimestamp(parsed.exportedAt)}`
              : " · unknown export date"}
            {parsed.appVersion ? ` · v${parsed.appVersion}` : ""}
          </span>
          <ul>
            <li>{describeIdentity(parsed.profile)}</li>
            <li>{describeProfileContent(parsed.profile)}</li>
            <li>
              AI provider: {labelProvider(parsed.settings.provider)} ·{" "}
              {resolveModel(parsed.settings.model).label ?? parsed.settings.model}
            </li>
            <li>
              {parsed.includesApiKeys
                ? `Includes saved keys: ${keySlotList(parsed.apiKeys).join(", ")}`
                : "No API keys in this backup"}
            </li>
          </ul>
          <p className="transfer-replace-note">
            Restoring replaces your current profile, settings, and saved keys.
          </p>
          <div className="transfer-actions">
            <button
              type="button"
              className="primary-button compact"
              onClick={() => void restore()}
              disabled={busy}
            >
              {busy ? "Restoring…" : "Restore backup"} {!busy && <Check size={14} />}
            </button>
            <button type="button" className="text-danger" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="form-error transfer-error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

async function restoreApiKeys(keys: BackupApiKeys): Promise<void> {
  if (keys.openai) await saveApiKey(Provider.OpenAI, keys.openai, true);
  if (keys.gemini) await saveApiKey(Provider.Gemini, keys.gemini, true);
  if (keys.anthropic) await saveApiKey(Provider.Anthropic, keys.anthropic, true);
  if (keys.custom) await saveApiKey(Provider.Custom, keys.custom, true);
  if (keys.exa) await saveExaApiKey(keys.exa);
}

function describeIdentity(profile: CandidateProfile): string {
  const name = profile.identity.fullName.trim();
  const email = profile.identity.email.trim();
  if (name && email) return `${name} (${email})`;
  return name || email || "Empty identity";
}

function describeProfileContent(profile: CandidateProfile): string {
  const parts = [`${profile.canonicalAnswers.length} saved answer(s)`];
  parts.push(
    profile.resumeAttachment
      ? `resume "${profile.resumeAttachment.name}" (${formatBytes(profile.resumeAttachment.size)})`
      : "no resume attached",
  );
  return parts.join(" · ");
}

function labelProvider(provider: Provider): string {
  if (provider === Provider.Gemini) return "Gemini";
  if (provider === Provider.Anthropic) return "Anthropic";
  if (provider === Provider.Custom) return "Custom endpoint";
  return "OpenAI";
}

function keySlotList(keys: BackupApiKeys): string[] {
  const labels: Array<[keyof BackupApiKeys, string]> = [
    ["openai", "OpenAI"],
    ["gemini", "Gemini"],
    ["anthropic", "Anthropic"],
    ["custom", "Custom"],
    ["exa", "Exa"],
  ];
  const present: string[] = [];
  for (const [slot, label] of labels) {
    if (keys[slot]) present.push(label);
  }
  return present;
}

const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatTimestamp(iso: string): string {
  return timestampFormatter.format(new Date(iso));
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 KB";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
