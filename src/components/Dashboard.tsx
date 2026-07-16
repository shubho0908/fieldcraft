import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Copy,
  ExternalLink,
  FileSearch,
  Globe2,
  LoaderCircle,
  MapPin,
  PencilLine,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  SquareArrowOutUpRight,
  Target,
  X,
  Zap,
} from "lucide-react";
import { Confidence, SuggestionAction } from "../lib/enums";
import { saveCachedAnalysis } from "../lib/storage";
import type {
  CachedAnalysis,
  CandidateProfile,
  ExtensionSettings,
  FieldSuggestion,
  FillResult,
  JobAnalysis,
  PageSnapshot,
  RuntimeRequest,
} from "../types";

interface Props {
  profile: CandidateProfile;
  settings: ExtensionSettings;
  apiKeyExists: boolean;
  initialCache: CachedAnalysis | null;
  onCache: (cache: CachedAnalysis) => void;
  onOpenSettings: () => void;
}

type Tab = "fit" | "answers" | "research";
type Status = "idle" | "capturing" | "analyzing" | "done" | "filling" | "error";

export default function Dashboard({
  profile,
  settings,
  apiKeyExists,
  initialCache,
  onCache,
  onOpenSettings,
}: Props) {
  const [snapshot, setSnapshot] = useState<PageSnapshot | null>(null);
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [activeTab, setActiveTab] = useState<Tab>("fit");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fillResults, setFillResults] = useState<FillResult[]>([]);
  const [toast, setToast] = useState("");
  const cacheHydrated = useRef(false);

  useEffect(() => {
    if (cacheHydrated.current) return;
    cacheHydrated.current = true;
    void (async () => {
      const tab = await getActiveTab();
      if (!tab.url || initialCache?.url !== tab.url) return;
      try {
        const currentSnapshot = await captureActivePage();
        const remapped = remapCachedAnalysis(initialCache, currentSnapshot);
        if (!remapped) return;
        setSnapshot(currentSnapshot);
        setAnalysis(remapped);
        setSelected(defaultSelection(remapped.suggestions));
        setStatus("done");
      } catch {
        // A stale cache is never allowed to fill a page it cannot re-scan.
      }
    })();
  }, [initialCache]);

  const selectedSuggestions = useMemo(
    () => analysis?.suggestions.filter((item) => selected.has(item.fieldId)) ?? [],
    [analysis, selected],
  );

  async function analyze() {
    if (!apiKeyExists) {
      setError("Add an OpenAI API key before analyzing a role.");
      setStatus("error");
      return;
    }
    setError("");
    setFillResults([]);
    setStatus("capturing");
    try {
      const captured = await captureActivePage();
      setSnapshot(captured);
      setStatus("analyzing");
      const response = await chrome.runtime.sendMessage({
        type: "FIELDCRAFT_ANALYZE",
        snapshot: captured,
        profile,
        settings,
      } satisfies RuntimeRequest);
      if (!response?.ok) throw new Error(response?.error || "Analysis failed");
      const nextAnalysis = response.analysis as JobAnalysis;
      setAnalysis(nextAnalysis);
      setSelected(defaultSelection(nextAnalysis.suggestions));
      setActiveTab("fit");
      setStatus("done");
      const cache = { url: captured.url, snapshot: captured, analysis: nextAnalysis };
      await saveCachedAnalysis(cache);
      onCache(cache);
    } catch (cause) {
      setError(normalizeChromeError(cause));
      setStatus("error");
    }
  }

  async function fillSelected() {
    if (!selectedSuggestions.length) return;
    setStatus("filling");
    setError("");
    try {
      const tab = await getActiveTab();
      if (!tab.id) throw new Error("No active application tab found.");
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "FIELDCRAFT_FILL",
        suggestions: selectedSuggestions,
      } satisfies RuntimeRequest);
      if (!response?.ok) throw new Error(response?.error || "Could not fill page");
      const results = response.results as FillResult[];
      setFillResults(results);
      setStatus("done");
      const filled = results.filter((item) => item.status === "filled").length;
      const failed = results.filter((item) => item.status === "failed").length;
      setToast(`${filled} field${filled === 1 ? "" : "s"} filled${failed ? ` · ${failed} need attention` : ""}`);
      window.setTimeout(() => setToast(""), 4200);
    } catch (cause) {
      setError(normalizeChromeError(cause));
      setStatus("error");
    }
  }

  function updateSuggestion(fieldId: string, value: string) {
    if (!analysis) return;
    setAnalysis({
      ...analysis,
      suggestions: analysis.suggestions.map((item) =>
        item.fieldId === fieldId
          ? {
              ...item,
              value,
              action: value.trim() ? SuggestionAction.Review : item.action,
            }
          : item,
      ),
    });
  }

  function toggleSelected(fieldId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(fieldId)) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });
  }

  if (!analysis && status !== "analyzing" && status !== "capturing") {
    return (
      <main className="dashboard empty-dashboard">
        <section className="empty-hero">
          <div className="hero-orbit">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="hero-glyph"><FileSearch size={27} /></div>
          </div>
          <span className="eyebrow">Current tab → grounded application</span>
          <h1>Read the role.<br />Cut through the noise.</h1>
          <p>
            Fieldcraft reads the full job page, researches the company, checks the role against your actual work, then drafts only what the form needs.
          </p>
        </section>

        <section className="workflow-card">
          <WorkflowStep index="01" icon={<Search size={17} />} title="Read" body="JD, requirements, and every application field" />
          <WorkflowStep index="02" icon={<Target size={17} />} title="Judge" body="Fit, real gaps, company signals, and blockers" />
          <WorkflowStep index="03" icon={<Zap size={17} />} title="Fill" body="Review exact answers, then insert—never submit" />
        </section>

        {!apiKeyExists && (
          <button className="setup-callout" onClick={onOpenSettings}>
            <KeyStatus />
            <span><strong>Connect OpenAI first</strong><small>Add an API key to run private, on-demand analysis.</small></span>
            <ArrowRight size={17} />
          </button>
        )}
        {error && <ErrorBox message={error} onSettings={onOpenSettings} />}
        <button className="analyze-button" onClick={() => void analyze()} disabled={!apiKeyExists}>
          <Sparkles size={18} /> Analyze this job
        </button>
        <p className="microcopy">Nothing is filled or submitted automatically.</p>
      </main>
    );
  }

  if (status === "capturing" || status === "analyzing") {
    return <AnalysisLoader stage={status} />;
  }

  if (!analysis || !snapshot) {
    return (
      <main className="dashboard">
        <ErrorBox message={error || "Analysis unavailable"} onSettings={onOpenSettings} />
        <button className="analyze-button" onClick={() => void analyze()}><RefreshCw size={17} /> Try again</button>
      </main>
    );
  }

  return (
    <main className="dashboard results-dashboard">
      <section className="job-strip">
        <div className="company-avatar">{initials(analysis.job.company)}</div>
        <div className="job-strip-copy">
          <span>{analysis.job.company || snapshot.hostname}</span>
          <h1>{analysis.job.role || snapshot.title}</h1>
          <div>
            {analysis.job.location && <span><MapPin size={12} /> {analysis.job.location}</span>}
            <span><BriefcaseBusiness size={12} /> {snapshot.ats}</span>
          </div>
        </div>
        <button className="icon-button quiet" onClick={() => void analyze()} title="Re-analyze current page">
          <RefreshCw size={16} />
        </button>
      </section>

      <nav className="result-tabs">
        <TabButton active={activeTab === "fit"} onClick={() => setActiveTab("fit")}>Fit</TabButton>
        <TabButton active={activeTab === "answers"} onClick={() => setActiveTab("answers")} badge={analysis.suggestions.length}>Answers</TabButton>
        <TabButton active={activeTab === "research"} onClick={() => setActiveTab("research")}>Research</TabButton>
      </nav>

      {error && <ErrorBox message={error} onSettings={onOpenSettings} />}

      <div className="result-content">
        {activeTab === "fit" && <FitView analysis={analysis} />}
        {activeTab === "answers" && (
          <AnswersView
            suggestions={analysis.suggestions}
            selected={selected}
            fillResults={fillResults}
            onToggle={toggleSelected}
            onChange={updateSuggestion}
            onSelectSafe={() => setSelected(defaultSelection(analysis.suggestions))}
          />
        )}
        {activeTab === "research" && <ResearchView analysis={analysis} snapshot={snapshot} />}
      </div>

      <footer className="fill-footer">
        <div>
          <strong>{selectedSuggestions.length}</strong>
          <span>selected to fill</span>
        </div>
        <button
          className="primary-button"
          onClick={() => void fillSelected()}
          disabled={!selectedSuggestions.length || status === "filling"}
        >
          {status === "filling" ? <LoaderCircle className="spin" size={17} /> : <PencilLine size={17} />}
          {status === "filling" ? "Filling…" : "Fill selected"}
        </button>
      </footer>
      {toast && <div className="toast"><CheckCircle2 size={17} /> {toast}</div>}
    </main>
  );
}

function FitView({ analysis }: { analysis: JobAnalysis }) {
  const { fit, job } = analysis;
  return (
    <div className="view-stack">
      <section className="fit-card">
        <div className="score-ring" style={{ "--score": `${fit.score * 3.6}deg` } as React.CSSProperties}>
          <div><strong>{fit.score}</strong><span>/ 100</span></div>
        </div>
        <div className="fit-copy">
          <span className={`verdict ${fit.verdict}`}>{fit.verdict} fit</span>
          <h2>{fit.recommendation}</h2>
        </div>
      </section>

      <section className="summary-card">
        <div className="card-kicker"><FileSearch size={15} /> Role, distilled</div>
        <p>{job.summary}</p>
        <div className="keyword-row">
          {job.keywords.slice(0, 7).map((keyword) => <span key={keyword}>{keyword}</span>)}
        </div>
      </section>

      <SignalList
        icon={<CheckCircle2 size={17} />}
        tone="positive"
        title="Where you match"
        items={fit.strongestMatches}
        empty="No strong evidence-backed matches found."
      />
      <SignalList
        icon={<CircleAlert size={17} />}
        tone="caution"
        title="Gaps to respect"
        items={fit.gaps}
        empty="No meaningful gaps identified."
      />
      {fit.hardBlockers.length > 0 && (
        <SignalList
          icon={<ShieldAlert size={17} />}
          tone="danger"
          title="Hard blockers"
          items={fit.hardBlockers}
          empty=""
        />
      )}
      <div className="facts-grid">
        <Fact label="Seniority" value={job.seniority} />
        <Fact label="Work mode" value={job.remotePolicy} />
        <Fact label="Type" value={job.employmentType} />
        <Fact label="Compensation" value={job.compensation} />
      </div>
    </div>
  );
}

function AnswersView({
  suggestions,
  selected,
  fillResults,
  onToggle,
  onChange,
  onSelectSafe,
}: {
  suggestions: FieldSuggestion[];
  selected: Set<string>;
  fillResults: FillResult[];
  onToggle: (fieldId: string) => void;
  onChange: (fieldId: string, value: string) => void;
  onSelectSafe: () => void;
}) {
  const resultMap = new Map(fillResults.map((result) => [result.fieldId, result]));
  const fillable = suggestions.filter((item) => item.action !== SuggestionAction.Skip);
  const skipped = suggestions.filter((item) => item.action === SuggestionAction.Skip);
  return (
    <div className="view-stack answers-view">
      <div className="answers-toolbar">
        <div><strong>{fillable.length} draft{fillable.length === 1 ? "" : "s"}</strong><span>{skipped.length} intentionally skipped</span></div>
        <button className="mini-button" onClick={onSelectSafe}><Check size={14} /> Select safe</button>
      </div>

      {fillable.map((suggestion) => {
        const result = resultMap.get(suggestion.fieldId);
        return (
          <article className={`answer-card ${selected.has(suggestion.fieldId) ? "selected" : ""}`} key={suggestion.fieldId}>
            <div className="answer-card-head">
              <button
                className={`select-box ${selected.has(suggestion.fieldId) ? "checked" : ""}`}
                onClick={() => onToggle(suggestion.fieldId)}
                aria-label={`${selected.has(suggestion.fieldId) ? "Deselect" : "Select"} ${suggestion.label}`}
              >
                {selected.has(suggestion.fieldId) && <Check size={13} />}
              </button>
              <div>
                <h3>{suggestion.label}</h3>
                <div className="answer-meta">
                  <span className={`confidence-dot ${suggestion.confidence}`} />
                  {suggestion.confidence} confidence
                  {suggestion.action === SuggestionAction.Review && (
                    <span className="review-pill">review</span>
                  )}
                </div>
              </div>
              {result && (
                <span className={`fill-result ${result.status}`} title={result.message}>
                  {result.status === "filled" ? <Check size={14} /> : <AlertCircle size={14} />}
                </span>
              )}
            </div>
            <textarea
              value={suggestion.value}
              onChange={(event) => onChange(suggestion.fieldId, event.target.value)}
              placeholder="Needs your input before filling"
              rows={Math.min(7, Math.max(2, Math.ceil((suggestion.value.length || 80) / 62)))}
            />
            <div className="answer-foot">
              <span>{suggestion.evidence || "No profile evidence found"}</span>
              <button
                onClick={() => void navigator.clipboard.writeText(suggestion.value)}
                title="Copy answer"
              ><Copy size={14} /></button>
            </div>
            {suggestion.warning && <div className="answer-warning"><AlertCircle size={14} /> {suggestion.warning}</div>}
          </article>
        );
      })}

      {skipped.length > 0 && (
        <details className="skipped-fields">
          <summary><span>{skipped.length} skipped fields</span><ChevronDown size={16} /></summary>
          {skipped.map((item) => (
            <div key={item.fieldId}><strong>{item.label}</strong><span>{item.warning || item.evidence || "Left unchanged"}</span></div>
          ))}
        </details>
      )}
    </div>
  );
}

function ResearchView({ analysis, snapshot }: { analysis: JobAnalysis; snapshot: PageSnapshot }) {
  const company = analysis.company;
  const researchThin = analysis.research?.thin;
  return (
    <div className="view-stack research-view">
      <section className="research-lead">
        <div className="research-icon"><Globe2 size={21} /></div>
        <div><span className="eyebrow">Company brief</span><h2>{analysis.job.company}</h2></div>
      </section>
      {researchThin && (
        <div className="answer-warning" role="status">
          <AlertCircle size={14} />
          Live research returned little public signal. Treat company facts as incomplete.
        </div>
      )}
      <p className="research-summary">{company.summary}</p>
      <div className="research-facts">
        <Fact label="Product" value={company.product} />
        <Fact label="Stage" value={company.stage} />
        <Fact label="Team size" value={company.size} />
        <Fact label="Funding" value={company.funding} />
      </div>
      <SignalList
        icon={<Zap size={17} />}
        tone="neutral"
        title="Engineering signals"
        items={company.engineeringSignals}
        empty="No strong engineering signals found in public sources."
      />
      <SignalList
        icon={<CircleAlert size={17} />}
        tone="caution"
        title="Things to validate"
        items={company.risks}
        empty="No material risks found from the available sources."
      />
      <section className="sources-card">
        <div className="card-kicker"><SquareArrowOutUpRight size={15} /> Sources</div>
        <a href={snapshot.url} target="_blank" rel="noreferrer">
          <span><strong>Job application page</strong><small>{snapshot.hostname}</small></span><ExternalLink size={14} />
        </a>
        {company.sources.map((source, index) => (
          <a href={source.url} target="_blank" rel="noreferrer" key={`${source.url}-${index}`}>
            <span><strong>{source.title}</strong><small>{safeHostname(source.url)}</small></span><ExternalLink size={14} />
          </a>
        ))}
      </section>
      {analysis.missingFacts.length > 0 && (
        <SignalList
          icon={<AlertCircle size={17} />}
          tone="danger"
          title="Candidate facts still needed"
          items={analysis.missingFacts}
          empty=""
        />
      )}
    </div>
  );
}

function AnalysisLoader({ stage }: { stage: "capturing" | "analyzing" }) {
  return (
    <main className="analysis-loader">
      <div className="scanner">
        <div className="scanner-sheet">
          <span /><span /><span /><span /><span />
          <i />
        </div>
        <div className="scanner-badge"><Sparkles size={18} /></div>
      </div>
      <span className="eyebrow">{stage === "capturing" ? "Reading the page" : "Building the application brief"}</span>
      <h1>{stage === "capturing" ? "Finding the real questions…" : "Researching, matching, drafting…"}</h1>
      <p>{stage === "capturing" ? "Mapping the JD and visible form fields." : "This can take a minute when live company research is enabled."}</p>
      <div className="loader-steps">
        <span className="done"><Check size={13} /> Candidate context</span>
        <span className={stage === "analyzing" ? "done" : "active"}><LoaderCircle size={13} /> Page scan</span>
        <span className={stage === "analyzing" ? "active" : ""}><LoaderCircle size={13} /> Judgment</span>
      </div>
    </main>
  );
}

function WorkflowStep({ index, icon, title, body }: { index: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="workflow-step">
      <span>{index}</span><div className="workflow-icon">{icon}</div><div><strong>{title}</strong><p>{body}</p></div>
    </div>
  );
}

function SignalList({ icon, tone, title, items, empty }: { icon: React.ReactNode; tone: string; title: string; items: string[]; empty: string }) {
  return (
    <section className={`signal-card ${tone}`}>
      <div className="card-kicker">{icon} {title}</div>
      <ul>
        {items.length ? items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>) : <li className="muted">{empty}</li>}
      </ul>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="fact"><span>{label}</span><strong>{value || "Unknown"}</strong></div>;
}

function TabButton({ active, onClick, badge, children }: { active: boolean; onClick: () => void; badge?: number; children: React.ReactNode }) {
  return <button className={active ? "active" : ""} onClick={onClick}>{children}{badge !== undefined && <span>{badge}</span>}</button>;
}

function ErrorBox({ message, onSettings }: { message: string; onSettings: () => void }) {
  const keyRelated = /api key|model|openai|quota|billing|401|403/i.test(message);
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={17} />
      <span>{message}</span>
      {keyRelated && <button onClick={onSettings}><Settings2 size={14} /> Settings</button>}
    </div>
  );
}

function KeyStatus() {
  return <div className="setup-callout-icon"><Settings2 size={18} /></div>;
}

function defaultSelection(suggestions: FieldSuggestion[]): Set<string> {
  return new Set(
    suggestions
      .filter(
        (item) =>
          item.action === SuggestionAction.Fill &&
          item.confidence !== Confidence.Low &&
          !item.warning &&
          Boolean(item.value.trim()),
      )
      .map((item) => item.fieldId),
  );
}

function remapCachedAnalysis(
  cache: CachedAnalysis,
  current: PageSnapshot,
): JobAnalysis | null {
  const usedIds = new Set<string>();
  let matched = 0;
  const suggestions = cache.analysis.suggestions.flatMap((suggestion) => {
    const oldField = cache.snapshot.fields.find((field) => field.id === suggestion.fieldId);
    if (!oldField) return [];
    const replacement = current.fields.find((candidate) => {
      if (usedIds.has(candidate.id) || candidate.kind !== oldField.kind) return false;
      if (oldField.name && candidate.name) return candidate.name === oldField.name;
      return normalizeLabel(candidate.label) === normalizeLabel(oldField.label);
    });
    if (!replacement) return [];
    usedIds.add(replacement.id);
    matched += 1;
    return [{ ...suggestion, fieldId: replacement.id, label: replacement.label }];
  });

  const oldFieldCount = cache.snapshot.fields.length;
  const currentFieldCount = current.fields.length;
  if (oldFieldCount === 0 && currentFieldCount === 0) {
    return cache.analysis;
  }
  const denominator = Math.max(oldFieldCount, currentFieldCount, 1);
  if (Math.abs(oldFieldCount - currentFieldCount) > 3 || matched / denominator < 0.8) {
    return null;
  }

  return { ...cache.analysis, suggestions };
}

function normalizeLabel(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function captureActivePage(): Promise<PageSnapshot> {
  const tab = await getActiveTab();
  if (!tab.id || !tab.url || !/^https?:/i.test(tab.url)) {
    throw new Error("Open a public job or application page, then try again.");
  }
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "FIELDCRAFT_CAPTURE",
    } satisfies RuntimeRequest);
    if (!response?.ok) throw new Error(response?.error || "Could not read this page");
    return response.snapshot as PageSnapshot;
  } catch (cause) {
    throw new Error(normalizeChromeError(cause));
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? {};
}

function normalizeChromeError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/receiving end does not exist|could not establish connection/i.test(message)) {
    return "Reload the job page once so Fieldcraft can read it, then try again.";
  }
  return message || "Something went wrong.";
}

function initials(value: string): string {
  return (value || "Job")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}
