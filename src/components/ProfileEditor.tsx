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

  const progress = useMemo(() => ((step + 1) / STEPS.length) * 100, [step]);

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
      setTestStatus("Connected");
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
    <main className={`profile-editor ${onboarding ? "onboarding" : "editing"}`}>
      {onboarding && (
        <div className="onboarding-brand">
          <BrandMark />
          <span>Fieldcraft</span>
        </div>
      )}

      <div className="editor-intro">
        <span className="eyebrow">{onboarding ? "Set up once" : "Candidate context"}</span>
        <h1>{onboarding ? "Your work, in every answer." : "Keep the source of truth sharp."}</h1>
        <p>
          {onboarding
            ? "Fieldcraft uses this context for every role. Nothing gets invented, and nothing is filled without your review."
            : "Update anything that should change how Fieldcraft evaluates roles or writes applications."}
        </p>
      </div>

      <div className="step-progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        <div className="step-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="step-meta">
        <span>0{step + 1}</span>
        <strong>{STEPS[step]}</strong>
        <span>0{STEPS.length}</span>
      </div>

      <section className="editor-card">
        {step === 0 && (
          <div className="form-stack">
            <SectionHeading
              title="The basics"
              body="Used for factual fields only. Links also help ground project-specific answers."
            />
            <Field label="Full name" required>
              <input
                value={profile.identity.fullName}
                onChange={(event) => updateIdentity("fullName", event.target.value)}
                placeholder="Shubhojeet Bera"
                autoComplete="name"
              />
            </Field>
            <div className="field-grid">
              <Field label="Email" required>
                <input
                  type="email"
                  value={profile.identity.email}
                  onChange={(event) => updateIdentity("email", event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </Field>
              <Field label="Phone">
                <input
                  value={profile.identity.phone}
                  onChange={(event) => updateIdentity("phone", event.target.value)}
                  placeholder="+91 …"
                  autoComplete="tel"
                />
              </Field>
            </div>
            <Field label="Current location">
              <input
                value={profile.identity.location}
                onChange={(event) => updateIdentity("location", event.target.value)}
                placeholder="Bengaluru, India"
                autoComplete="address-level2"
              />
            </Field>
            <Field label="LinkedIn">
              <input
                value={profile.identity.linkedin}
                onChange={(event) => updateIdentity("linkedin", event.target.value)}
                placeholder="https://linkedin.com/in/…"
              />
            </Field>
            <Field label="GitHub">
              <input
                value={profile.identity.github}
                onChange={(event) => updateIdentity("github", event.target.value)}
                placeholder="https://github.com/…"
              />
            </Field>
            <Field label="Portfolio">
              <input
                value={profile.identity.portfolio}
                onChange={(event) => updateIdentity("portfolio", event.target.value)}
                placeholder="https://your-site.com"
              />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="form-stack">
            <SectionHeading
              title="What you have actually done"
              body="Paste plain text, including dates, outcomes, stacks, and project details. This is the hard boundary for every candidate claim."
            />
            <Field label="Professional headline">
              <input
                value={profile.headline}
                onChange={(event) => setProfile({ ...profile, headline: event.target.value })}
                placeholder="Full-stack engineer building AI products end-to-end"
              />
            </Field>
            <Field label="Target roles">
              <input
                value={profile.targetRoles}
                onChange={(event) => setProfile({ ...profile, targetRoles: event.target.value })}
                placeholder="Product Engineer, Full-stack AI Engineer"
              />
            </Field>
            <Field label="Resume text" required hint={`${profile.resumeText.length.toLocaleString()} characters`}>
              <textarea
                className="resume-textarea"
                value={profile.resumeText}
                onChange={(event) => setProfile({ ...profile, resumeText: event.target.value })}
                placeholder="Paste the complete text version of your resume…"
              />
            </Field>
            <Field label="Extra proof points" hint="Optional">
              <textarea
                value={profile.proofPoints}
                onChange={(event) => setProfile({ ...profile, proofPoints: event.target.value })}
                placeholder="Useful details not on the resume: architecture decisions, metrics, customer context, demos, public links…"
              />
            </Field>
            <div className="attachment-card">
              <div className="attachment-icon"><FileText size={19} /></div>
              <div className="attachment-copy">
                <strong>{profile.resumeAttachment?.name || "Attach resume for upload fields"}</strong>
                <span>
                  {profile.resumeAttachment
                    ? `${Math.ceil(profile.resumeAttachment.size / 1024)} KB · saved locally`
                    : "PDF, DOC, or DOCX · max 8 MB"}
                </span>
              </div>
              <label className="mini-button">
                <Upload size={15} />
                {profile.resumeAttachment ? "Replace" : "Choose"}
                <input
                  className="visually-hidden"
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf"
                  onChange={(event) => void attachResume(event.target.files?.[0])}
                />
              </label>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="form-stack">
            <SectionHeading
              title="Answers the model must never guess"
              body="Leave a field blank when you want Fieldcraft to stop and ask during review."
            />
            <div className="field-grid">
              <Field label="Years of experience">
                <input
                  value={profile.defaults.yearsOfExperience}
                  onChange={(event) => updateDefault("yearsOfExperience", event.target.value)}
                  placeholder="e.g. 2 years"
                />
              </Field>
              <Field label="Notice period">
                <input
                  value={profile.defaults.noticePeriod}
                  onChange={(event) => updateDefault("noticePeriod", event.target.value)}
                  placeholder="e.g. 30 days"
                />
              </Field>
              <Field label="Authorized to work">
                <input
                  value={profile.defaults.authorizedToWork}
                  onChange={(event) => updateDefault("authorizedToWork", event.target.value)}
                  placeholder="Country + yes/no"
                />
              </Field>
              <Field label="Need sponsorship">
                <input
                  value={profile.defaults.needsSponsorship}
                  onChange={(event) => updateDefault("needsSponsorship", event.target.value)}
                  placeholder="Yes / No / context"
                />
              </Field>
              <Field label="Current compensation">
                <input
                  value={profile.defaults.currentCompensation}
                  onChange={(event) => updateDefault("currentCompensation", event.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Expected compensation">
                <input
                  value={profile.defaults.expectedCompensation}
                  onChange={(event) => updateDefault("expectedCompensation", event.target.value)}
                  placeholder="Optional"
                />
              </Field>
            </div>
            <Field label="Work-mode preference">
              <input
                value={profile.defaults.remotePreference}
                onChange={(event) => updateDefault("remotePreference", event.target.value)}
                placeholder="Remote India preferred; Bengaluru hybrid is okay"
              />
            </Field>
            <div className="field-grid">
              <Field label="Willing to relocate">
                <input
                  value={profile.defaults.willingToRelocate}
                  onChange={(event) => updateDefault("willingToRelocate", event.target.value)}
                  placeholder="Yes / No / where"
                />
              </Field>
              <Field label="How you found the role">
                <input
                  value={profile.defaults.referralSource}
                  onChange={(event) => updateDefault("referralSource", event.target.value)}
                  placeholder="LinkedIn, referral…"
                />
              </Field>
            </div>

            <div className="subsection-row">
              <div>
                <h3>Canonical answers</h3>
                <p>Exact reusable answers for recurring questions.</p>
              </div>
              <button
                className="mini-button"
                type="button"
                onClick={() =>
                  setProfile({
                    ...profile,
                    canonicalAnswers: [
                      ...profile.canonicalAnswers,
                      { question: "", answer: "" },
                    ],
                  })
                }
              >
                <Plus size={15} /> Add
              </button>
            </div>
            {profile.canonicalAnswers.length === 0 && (
              <div className="empty-inline">No canonical answers yet.</div>
            )}
            {profile.canonicalAnswers.map((item, index) => (
              <div className="canonical-row" key={index}>
                <input
                  value={item.question}
                  onChange={(event) => {
                    const next = [...profile.canonicalAnswers];
                    next[index] = { ...next[index], question: event.target.value };
                    setProfile({ ...profile, canonicalAnswers: next });
                  }}
                  placeholder="Question or topic"
                />
                <textarea
                  value={item.answer}
                  onChange={(event) => {
                    const next = [...profile.canonicalAnswers];
                    next[index] = { ...next[index], answer: event.target.value };
                    setProfile({ ...profile, canonicalAnswers: next });
                  }}
                  placeholder="Exact truthful answer"
                />
                <button
                  className="row-delete"
                  aria-label="Remove canonical answer"
                  onClick={() =>
                    setProfile({
                      ...profile,
                      canonicalAnswers: profile.canonicalAnswers.filter((_, itemIndex) => itemIndex !== index),
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="form-stack">
            <SectionHeading
              title="Make it sound like you"
              body="The defaults are aggressively concise. Add your own rules without teaching it to exaggerate."
            />
            <Field label="Writing instruction">
              <textarea
                value={profile.voice.customInstruction}
                onChange={(event) => updateVoice("customInstruction", event.target.value)}
              />
            </Field>
            <Field label="Phrases to never use">
              <textarea
                value={profile.voice.bannedPhrases}
                onChange={(event) => updateVoice("bannedPhrases", event.target.value)}
              />
            </Field>
            <div className="field-grid">
              <Field label="Short-answer word cap">
                <input
                  type="number"
                  min={15}
                  max={120}
                  value={profile.voice.maxShortWords}
                  onChange={(event) => updateVoice("maxShortWords", Number(event.target.value))}
                />
              </Field>
              <Field label="Long-answer word cap">
                <input
                  type="number"
                  min={50}
                  max={300}
                  value={profile.voice.maxLongWords}
                  onChange={(event) => updateVoice("maxLongWords", Number(event.target.value))}
                />
              </Field>
            </div>

            <div className="divider" />
            <div className="api-heading">
              <div className="api-icon"><KeyRound size={18} /></div>
              <div>
                <h3>OpenAI connection</h3>
                <p>Used for analysis, company research, and answer drafting.</p>
              </div>
            </div>
            <Field label="API key" hint={apiKeyExists ? "A key is already saved" : "Required"}>
              <div className="secret-input">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(event) => setApiKeyState(event.target.value)}
                  placeholder={apiKeyExists ? "•••••••••••••••• (replace key)" : "sk-proj-…"}
                  autoComplete="off"
                />
                <button type="button" onClick={() => setShowApiKey(!showApiKey)}>
                  {showApiKey ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </Field>
            <Field label="Model">
              <select
                value={settings.model}
                onChange={(event) => setSettings({ ...settings, model: event.target.value })}
              >
                <option value="gpt-5.6-terra">GPT-5.6 Terra · balanced</option>
                <option value="gpt-5.6">GPT-5.6 Sol · best quality</option>
                <option value="gpt-5.6-luna">GPT-5.6 Luna · lowest cost</option>
              </select>
            </Field>
            <label className="toggle-row">
              <span>
                <strong>Research the company</strong>
                <small>Use live web search and show the sources used.</small>
              </span>
              <input
                type="checkbox"
                checked={settings.researchCompany}
                onChange={(event) => setSettings({ ...settings, researchCompany: event.target.checked })}
              />
              <i />
            </label>
            <label className="toggle-row">
              <span>
                <strong>Remember API key</strong>
                <small>
                  Off keeps it only for this browser session. On stores it in Chrome local extension storage.
                </small>
              </span>
              <input
                type="checkbox"
                checked={settings.rememberApiKey}
                onChange={(event) => setSettings({ ...settings, rememberApiKey: event.target.checked })}
              />
              <i />
            </label>
            <div className="api-actions">
              <button className="secondary-button compact" type="button" onClick={() => void testConnection()} disabled={testing}>
                {testing ? "Testing…" : "Test connection"}
              </button>
              {apiKeyExists && !onboarding && (
                <button className="text-danger" type="button" onClick={() => void removeApiKey()}>
                  Remove key
                </button>
              )}
              {testStatus && <span className="success-label"><Check size={14} /> {testStatus}</span>}
            </div>
            <div className="privacy-note">
              <ShieldCheck size={17} />
              <p>
                Your profile is stored in this extension. Profile and job context are sent to OpenAI only when you press Analyze, with API response storage disabled.
              </p>
            </div>
          </div>
        )}
      </section>

      {error && <div className="form-error" role="alert">{error}</div>}

      <footer className="editor-footer">
        <button
          className="secondary-button"
          onClick={() => (step > 0 ? setStep(step - 1) : onCancel?.())}
          disabled={step === 0 && !onCancel}
        >
          <ArrowLeft size={17} /> {step > 0 ? "Back" : "Cancel"}
        </button>
        <button className="primary-button" onClick={() => void next()} disabled={saving}>
          {saving ? "Saving…" : step === STEPS.length - 1 ? (onboarding ? "Finish setup" : "Save changes") : "Continue"}
          {!saving && (step === STEPS.length - 1 ? <Check size={17} /> : <ArrowRight size={17} />)}
        </button>
      </footer>
    </main>
  );
}

function SectionHeading({ title, body }: { title: string; body: string }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="form-field">
      <span>
        {label} {required && <b>*</b>}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </label>
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
