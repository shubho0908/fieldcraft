import BrandMark from "./BrandMark";
import type { CandidateProfile, ExtensionSettings } from "../types";
import {
  AlignCenter,
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  ChevronsUp,
  Eye,
  EyeOff,
  FileText,
  FlaskConical,
  Gauge,
  MessagesSquare,
  Minus,
  Plus,
  Rocket,
  Server,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  CUSTOM_MODEL_PREFIX,
  CustomProtocol,
  Provider,
  customModelId,
  modelsForProvider,
  resolveMaxOutputTokens,
  resolveModel,
} from "../lib/models";
import { Select } from "./Select";
import { OpenAIIcon } from "./OpenAIIcon";
import { GeminiIcon } from "./GeminiIcon";
import { AnthropicIcon } from "./AnthropicIcon";
import { ExaIcon } from "./ExaIcon";
import type { ReasoningEffortSetting } from "../lib/enums";

type EffortOption = { id: ReasoningEffortSetting; label: string; description: string };

function providerIcon(provider: Provider): ReactNode {
  switch (provider) {
    case Provider.OpenAI:
      return <OpenAIIcon size={14} />;
    case Provider.Gemini:
      return <GeminiIcon size={14} />;
    case Provider.Custom:
      return <Server size={14} />;
  }
}

function protocolIcon(protocol: CustomProtocol): ReactNode {
  switch (protocol) {
    case CustomProtocol.OpenAI:
      return <MessagesSquare size={14} />;
    case CustomProtocol.Anthropic:
      return <AnthropicIcon size={14} />;
  }
}

function reasoningIcon(id: ReasoningEffortSetting): ReactNode {
  const icons: Record<ReasoningEffortSetting, ReactNode> = {
    auto: <Gauge size={14} />,
    none: <Minus size={14} />,
    low: <TrendingDown size={14} />,
    medium: <AlignCenter size={14} />,
    high: <TrendingUp size={14} />,
    xhigh: <ChevronsUp size={14} />,
    max: <Rocket size={14} />,
  };
  return icons[id];
}

export type ProfileEditorFormProps = {
  children?: ReactNode;
  onboarding: boolean;
  step: number;
  steps: string[];
  progress: number;
  profile: CandidateProfile;
  settings: ExtensionSettings;
  apiKey: string;
  showApiKey: boolean;
  customHeadersText: string;
  error: string;
  saving: boolean;
  testing: boolean;
  testStatus: string;
  apiKeyExists: boolean;
  exaApiKey: string;
  showExaApiKey: boolean;
  exaApiKeyExists: boolean;
  effortOptions: readonly EffortOption[];
  evalEffortOptions: readonly EffortOption[];
  onCancel?: () => void;
  setProfile: React.Dispatch<React.SetStateAction<CandidateProfile>>;
  setSettings: React.Dispatch<React.SetStateAction<ExtensionSettings>>;
  setApiKeyState: (v: string) => void;
  setShowApiKey: (v: boolean | ((c: boolean) => boolean)) => void;
  setExaApiKeyState: (v: string) => void;
  setShowExaApiKey: (v: boolean | ((c: boolean) => boolean)) => void;
  updateIdentity: (key: keyof CandidateProfile["identity"], value: string) => void;
  updateDefault: (key: keyof CandidateProfile["defaults"], value: string) => void;
  updateVoice: (key: keyof CandidateProfile["voice"], value: string | number) => void;
  updateModel: (modelId: string) => void;
  updateCustomModelId: (actualModelId: string) => void;
  updateCustomBaseUrl: (baseUrl: string) => void;
  updateCustomProtocol: (protocol: CustomProtocol) => void;
  updateCustomHeaders: (text: string) => void;
  updateEvalModel: (modelId: string) => void;
  updateProvider: (provider: Provider) => void;
  updateMaxOutputTokens: (value: string) => void;
  setResearchCompany: (researchCompany: boolean) => void;
  attachResume: (file?: File) => void;
  testConnection: () => void;
  removeApiKey: () => void;
  removeExaApiKey: () => void;
  next: () => void;
  setStep: (n: number | ((c: number) => number)) => void;
};

export function ProfileEditorForm(props: ProfileEditorFormProps) {
  const {
    children,
    onboarding,
    step,
    steps: STEPS,
    progress,
    profile,
    settings,
    apiKey,
    showApiKey,
    customHeadersText,
    error,
    saving,
    testing,
    testStatus,
    apiKeyExists,
    exaApiKey,
    showExaApiKey,
    exaApiKeyExists,
    effortOptions,
    evalEffortOptions,
    onCancel,
    setProfile,
    setSettings,
    setApiKeyState,
    setShowApiKey,
    setExaApiKeyState,
    setShowExaApiKey,
    updateIdentity,
    updateDefault,
    updateVoice,
    updateModel,
    updateCustomModelId,
    updateCustomBaseUrl,
    updateCustomProtocol,
    updateCustomHeaders,
    updateEvalModel,
    updateProvider,
    updateMaxOutputTokens,
    setResearchCompany,
    attachResume,
    testConnection,
    removeApiKey,
    removeExaApiKey,
    next,
    setStep,
  } = props;
  const providerModels = modelsForProvider(settings.provider);
  const isCustom = settings.provider === Provider.Custom;
  const providerName = isCustom
    ? "Custom"
    : settings.provider === Provider.Gemini
      ? "Gemini"
      : "OpenAI";
  const resolvedMaxOutputTokens = resolveMaxOutputTokens(
    settings.model,
    settings.maxOutputTokens,
  );
  const maxOutputTokensCeiling = resolveModel(settings.model).maxOutputTokens;
  // Only providers whose reasoning we actually forward get a selector: OpenAI
  // sends `reasoningEffort`, Gemini sends `thinkingConfig.thinkingLevel`. Custom
  // endpoints stay hidden because their protocol may support neither, and a
  // model that exposes no level beyond Auto (3.7 Flash and older) has nothing
  // meaningful to pick.
  const forwardsReasoning =
    settings.provider === Provider.OpenAI || settings.provider === Provider.Gemini;
  const showReasoningEffort = forwardsReasoning && effortOptions.length > 1;
  const showEvalReasoningEffort =
    forwardsReasoning && evalEffortOptions.length > 1;

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
                type="button"
                className="mini-button"
                onClick={() =>
                  setProfile({
                    ...profile,
                    canonicalAnswers: [
                      ...profile.canonicalAnswers,
                      { id: crypto.randomUUID(), question: "", answer: "" },
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
              <div className="canonical-row" key={item.id}>
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
                  type="button"
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
              <div className="api-icon"><Brain size={18} /></div>
              <div>
                <h3>AI provider connection</h3>
                <p>Used for analysis, company research, and answer drafting.</p>
              </div>
            </div>
            <Field label="AI provider">
              <Select
                value={settings.provider}
                options={[
                  { value: Provider.OpenAI, label: "OpenAI", icon: providerIcon(Provider.OpenAI) },
                  { value: Provider.Gemini, label: "Gemini", icon: providerIcon(Provider.Gemini) },
                  { value: Provider.Custom, label: "Custom endpoint", icon: providerIcon(Provider.Custom) },
                ]}
                onChange={(value) => updateProvider(value as Provider)}
              />
            </Field>
            <Field
              label={`${providerName} API key`}
              hint={apiKeyExists ? `A ${providerName} key is already saved` : "Required"}
            >
              <div className="secret-input">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(event) => setApiKeyState(event.target.value)}
                  placeholder={apiKeyExists ? "•••••••••••••••• (replace key)" : `${providerName} API key`}
                  autoComplete="off"
                />
                <button type="button" onClick={() => setShowApiKey(!showApiKey)}>
                  {showApiKey ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </Field>
            {isCustom ? (
              <>
                <Field label="Endpoint protocol" hint="The API format your custom endpoint expects">
                  <Select
                    value={settings.customProtocol}
                    options={[
                      { value: CustomProtocol.OpenAI, label: "OpenAI-compatible · /v1/chat/completions", icon: protocolIcon(CustomProtocol.OpenAI) },
                      { value: CustomProtocol.Anthropic, label: "Anthropic-compatible · /v1/messages", icon: protocolIcon(CustomProtocol.Anthropic) },
                    ]}
                    onChange={(value) => updateCustomProtocol(value as CustomProtocol)}
                  />
                </Field>
                <Field
                  label="Custom model ID"
                  hint={
                    settings.customProtocol === CustomProtocol.Anthropic
                      ? "e.g. claude-sonnet-4-5 or MiniMax-M3"
                      : "The provider-specific model string"
                  }
                >
                  <input
                    value={customModelId(settings.model)}
                    onChange={(event) => updateCustomModelId(event.target.value)}
                    placeholder={
                      settings.customProtocol === CustomProtocol.Anthropic
                        ? "claude-sonnet-4-5"
                        : "accounts/fireworks/models/llama-v3p1-405b-instruct"
                    }
                    autoComplete="off"
                  />
                </Field>
                <Field label="Custom base URL" hint="API root ending in /v1">
                  <input
                    type="url"
                    value={settings.customBaseUrl}
                    onChange={(event) => updateCustomBaseUrl(event.target.value)}
                    placeholder={
                      settings.customProtocol === CustomProtocol.Anthropic
                        ? "https://api.anthropic.com/v1"
                        : "https://api.fireworks.ai/inference/v1"
                    }
                    autoComplete="off"
                  />
                </Field>
                <Field label="Custom headers" hint="Optional · one per line: Header-Name: value">
                  <textarea
                    className="custom-headers-textarea"
                    value={customHeadersText}
                    onChange={(event) => updateCustomHeaders(event.target.value)}
                    placeholder={`X-Title: My App\nHTTP-Referer: https://fieldcraft.shubhojeet.me`}
                    autoComplete="off"
                  />
                </Field>
              </>
            ) : (
              <Field label="Model">
                <Select
                  value={settings.model}
                  options={providerModels.map((model) => ({
                    value: model.id,
                    label: `${model.label} · ${model.description}`,
                    icon: providerIcon(model.provider),
                  }))}
                  onChange={(value) => updateModel(value)}
                />
              </Field>
            )}
            <Field
              label="Max output tokens"
              hint={`Default for this model: ${resolvedMaxOutputTokens.toLocaleString()}. Lower values reduce cost; higher values allow longer outputs, up to ${maxOutputTokensCeiling.toLocaleString()}.`}
            >
              <input
                type="number"
                min={1}
                step={1}
                value={settings.maxOutputTokens ?? ""}
                placeholder={String(resolvedMaxOutputTokens)}
                onChange={(event) => updateMaxOutputTokens(event.target.value)}
              />
            </Field>
            {showReasoningEffort && <Field
              label="Reasoning effort"
              hint="Reasoning effort · Auto uses the model default"
            >
              <Select
                value={settings.reasoningEffort}
                options={effortOptions.map((option) => ({
                  value: option.id,
                  label: `${option.label} · ${option.description}`,
                  icon: reasoningIcon(option.id),
                }))}
                onChange={(value) =>
                  setSettings({
                    ...settings,
                    reasoningEffort: value as ExtensionSettings["reasoningEffort"],
                  })
                }
              />
            </Field>}

            <div className="divider" />
            <div className="api-heading">
              <div className="api-icon">
                <FlaskConical size={18} />
              </div>
              <div>
                <h3>Live fixture evals</h3>
                <p>Verifies that job evaluations are accurate during automated testing. Uses deeper thinking by default.</p>
              </div>
            </div>
            {!isCustom && (
              <Field label="Eval model" hint="Separate from Analyze model above">
                <Select
                  value={settings.evalModel}
                  options={providerModels.map((model) => ({
                    value: model.id,
                    label: `${model.label} · ${model.description}`,
                    icon: providerIcon(model.provider),
                  }))}
                  onChange={(value) => updateEvalModel(value)}
                />
              </Field>
            )}
            {showEvalReasoningEffort && <Field
              label="Eval reasoning"
              hint="Default high · clamped if the model cannot use that effort"
            >
              <Select
                value={settings.evalReasoningEffort}
                options={evalEffortOptions.map((option) => ({
                  value: option.id,
                  label: `${option.label} · ${option.description}`,
                  icon: reasoningIcon(option.id),
                }))}
                onChange={(value) =>
                  setSettings({
                    ...settings,
                    evalReasoningEffort: value as ExtensionSettings["evalReasoningEffort"],
                  })
                }
              />
            </Field>}

            <div className="divider" />
            <div className="api-heading">
              <div className="api-icon"><ExaIcon size={18} /></div>
              <div>
                <h3>Exa company research</h3>
                <p>Looks up company background (funding, size, products) so job fit recommendations are more accurate.</p>
              </div>
            </div>
            <Field
              label="Exa API key"
              hint={exaApiKeyExists ? "A key is already saved" : "Optional · required only for company research"}
            >
              <div className="secret-input">
                <input
                  type={showExaApiKey ? "text" : "password"}
                  value={exaApiKey}
                  onChange={(event) => setExaApiKeyState(event.target.value)}
                  placeholder={exaApiKeyExists ? "•••••••••••••••• (replace key)" : "exa-…"}
                  autoComplete="off"
                />
                <button type="button" onClick={() => setShowExaApiKey(!showExaApiKey)}>
                  {showExaApiKey ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </Field>
            {exaApiKeyExists && !onboarding && (
              <div className="api-actions">
                <button className="text-danger" type="button" onClick={() => void removeExaApiKey()}>
                  Remove Exa key
                </button>
              </div>
            )}
            <label className="toggle-row">
              <span>
                <strong>Research the company</strong>
                <small>Optional. Enable only after adding an Exa key; job analysis works without it.</small>
              </span>
              <input
                type="checkbox"
                checked={settings.researchCompany}
                onChange={(event) => setResearchCompany(event.target.checked)}
              />
              <i />
            </label>
            <label className="toggle-row">
              <span>
                <strong>Remember {providerName} API key</strong>
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
                Your profile is stored in this extension. Profile and job context are sent to your selected AI provider only when you press Analyze. OpenAI requests disable response storage.
              </p>
            </div>
          </div>
        )}
      </section>

      {error && <div className="form-error" role="alert">{error}</div>}

      {children}

      <footer className="editor-footer">
        <button
          type="button"
          className="secondary-button"
          onClick={() => (step > 0 ? setStep(step - 1) : onCancel?.())}
          disabled={step === 0 && !onCancel}
        >
          <ArrowLeft size={17} /> {step > 0 ? "Back" : "Cancel"}
        </button>
        <button type="button" className="primary-button" onClick={() => void next()} disabled={saving}>
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
