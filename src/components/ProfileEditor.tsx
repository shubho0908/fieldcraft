import { ProfileEditorForm } from "./ProfileEditorForm";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import BrandMark from "./BrandMark";
import {
  clearApiKey,
  getApiKey,
  hasApiKey,
  saveApiKey,
  saveProfile,
  saveSettings,
} from "../lib/storage";
import { ReasoningEffortSettingAuto } from "../lib/enums";
import {
  preferredEvalReasoningEffort,
  resolveModel,
  reasoningEffortsForModel,
} from "../lib/models";
import type { CandidateProfile, ExtensionSettings } from "../types";

interface Props {
  initialProfile: CandidateProfile;
  initialSettings: ExtensionSettings;
  apiKeyExists: boolean;
  onboarding: boolean;
  onCancel?: () => void;
  onSaved: (
    profile: CandidateProfile,
    settings: ExtensionSettings,
    hasKey: boolean,
  ) => void;
}

const STEPS = ["Identity", "Experience", "Defaults", "Writing + AI"];

export default function ProfileEditor({
  initialProfile,
  initialSettings,
  apiKeyExists,
  onboarding,
  onCancel,
  onSaved,
}: Props) {
  const [profile, setProfile] = useState(() => structuredClone(initialProfile));
  const [settings, setSettings] = useState(() => ({ ...initialSettings }));
  const [apiKey, setApiKeyState] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState("");

  const progress = ((step + 1) / STEPS.length) * 100;
  const effortOptions = useMemo(
    () => reasoningEffortsForModel(settings.model),
    [settings.model],
  );
  const evalEffortOptions = useMemo(
    () => reasoningEffortsForModel(settings.evalModel),
    [settings.evalModel],
  );

  function updateModel(modelId: string) {
    const model = resolveModel(modelId);
    setSettings((current) => {
      const next = { ...current, model: model.id };
      if (
        next.reasoningEffort !== ReasoningEffortSettingAuto &&
        !model.supportedReasoningEfforts.includes(next.reasoningEffort)
      ) {
        next.reasoningEffort = ReasoningEffortSettingAuto;
      }
      return next;
    });
  }

  function updateEvalModel(modelId: string) {
    const model = resolveModel(modelId);
    setSettings((current) => {
      const next = { ...current, evalModel: model.id };
      if (
        next.evalReasoningEffort !== ReasoningEffortSettingAuto &&
        !model.supportedReasoningEfforts.includes(next.evalReasoningEffort)
      ) {
        next.evalReasoningEffort = preferredEvalReasoningEffort(model.id);
      }
      return next;
    });
  }

  function updateIdentity(key: keyof CandidateProfile["identity"], value: string) {
    setProfile((current) => ({
      ...current,
      identity: { ...current.identity, [key]: value },
    }));
  }

  function updateDefault(key: keyof CandidateProfile["defaults"], value: string) {
    setProfile((current) => ({
      ...current,
      defaults: { ...current.defaults, [key]: value },
    }));
  }

  function updateVoice(key: keyof CandidateProfile["voice"], value: string | number) {
    setProfile((current) => ({
      ...current,
      voice: { ...current.voice, [key]: value },
    }));
  }

  function validateStep(): boolean {
    setError("");
    if (step === 0 && (!profile.identity.fullName.trim() || !profile.identity.email.trim())) {
      setError("Your name and email are required.");
      return false;
    }
    if (step === 1 && profile.resumeText.trim().length < 100) {
      setError("Paste the full text of your resume so answers can stay grounded.");
      return false;
    }
    if (step === 3 && !apiKeyExists && !apiKey.trim()) {
      setError("An OpenAI API key is required to analyze jobs and draft answers.");
      return false;
    }
    return true;
  }

  async function next() {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) {
      setStep((value) => value + 1);
      return;
    }
    await persist();
  }

  async function persist() {
    if (!validateStep()) return;
    setSaving(true);
    setError("");
    try {
      const nextProfile = {
        ...profile,
        onboardingComplete: true,
        updatedAt: new Date().toISOString(),
      };
      await saveProfile(nextProfile);
      await saveSettings(settings);
      if (apiKey.trim()) {
        await saveApiKey(apiKey, settings.rememberApiKey);
      } else if (apiKeyExists) {
        const existingKey = await getApiKey();
        if (existingKey) await saveApiKey(existingKey, settings.rememberApiKey);
      }
      onSaved(nextProfile, settings, await hasApiKey());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setError("");
    setTestStatus("");
    // Persist current model/effort settings so the probe matches what Analyze will use.
    await saveSettings(settings);
    if (apiKey.trim()) await saveApiKey(apiKey, settings.rememberApiKey);
    if (!apiKey.trim() && !apiKeyExists) {
      setError("Enter an API key first.");
      return;
    }
    setTesting(true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "FIELDCRAFT_TEST_API",
        model: settings.model,
      });
      if (!response?.ok) throw new Error(response?.error || "Connection failed");
      // Background performs a real OpenAI Responses API call; surface the model used.
      setTestStatus(
        response.model
          ? `Live API OK · ${response.model}`
          : "Live API OK",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Connection failed");
    } finally {
      setTesting(false);
    }
  }

  async function removeApiKey() {
    await clearApiKey();
    setApiKeyState("");
    setTestStatus("Key removed");
  }

  async function attachResume(file?: File) {
    if (!file) return;
    setError("");
    if (file.size > 8 * 1024 * 1024) {
      setError("Keep the resume file under 8 MB.");
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    setProfile((current) => ({
      ...current,
      resumeAttachment: {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        dataUrl,
      },
    }));
  }

  return (
    <ProfileEditorForm
      onboarding={onboarding}
      step={step}
      steps={STEPS}
      progress={progress}
      profile={profile}
      settings={settings}
      apiKey={apiKey}
      showApiKey={showApiKey}
      error={error}
      saving={saving}
      testing={testing}
      testStatus={testStatus}
      apiKeyExists={apiKeyExists}
      effortOptions={effortOptions}
      evalEffortOptions={evalEffortOptions}
      onCancel={onCancel}
      setProfile={setProfile}
      setSettings={setSettings}
      setApiKeyState={setApiKeyState}
      setShowApiKey={setShowApiKey}
      updateIdentity={updateIdentity}
      updateDefault={updateDefault}
      updateVoice={updateVoice}
      updateModel={updateModel}
      updateEvalModel={updateEvalModel}
      attachResume={(file) => void attachResume(file)}
      testConnection={() => void testConnection()}
      removeApiKey={() => void removeApiKey()}
      next={() => void next()}
      setStep={setStep}
    />
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}
