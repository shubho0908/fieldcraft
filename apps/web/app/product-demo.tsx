"use client";

import { useRef, useState, type CSSProperties } from "react";
import {
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileSearch,
  Globe2,
  LoaderCircle,
  MapPin,
  MousePointer2,
  PencilLine,
  RefreshCw,
  ScanSearch,
  Search,
  Settings2,
  SquareArrowOutUpRight,
  Target,
  Zap,
} from "lucide-react";
import "./product-demo.css";
import { useProductDemoAnimation, type ResultTab } from "./use-product-demo-animation";

const examples = [
  {
    company: "Latticework",
    role: "Product Engineer",
    location: "Remote India",
    ats: "Lever",
    initials: "L",
    score: "86",
    verdict: "strong",
    recommendation: "Strong practical match for a mid product-engineer seat.",
    summary: "Remote India product engineering role on React, TypeScript, and Node.",
    match: "React, Next.js, and TypeScript experience map directly to the role.",
    gap: "Limited explicit Postgres depth is worth validating.",
    candidate: "Asha Verma",
    email: "asha@example.com",
    years: "2.5 years",
    answer: "I shipped billing workflows at a B2B SaaS startup in TypeScript and Node, including idempotent payment retries that cut checkout failures by 18%.",
    formFields: [
      { label: "Full name", helper: "Required", kind: "text", placeholder: "Enter your full name", value: "Asha Verma", evidence: "identity.fullName" },
      { label: "Email", helper: "Required", kind: "text", placeholder: "Enter your email", value: "asha@example.com", evidence: "identity.email" },
      { label: "Years of experience", helper: "Required", kind: "text", placeholder: "Enter years of experience", value: "2.5 years", evidence: "defaults.yearsOfExperience" },
      { label: "Tell us about a product you shipped", helper: "Required", kind: "textarea", placeholder: "Share a concise example", value: "I shipped billing workflows at a B2B SaaS startup in TypeScript and Node, including idempotent payment retries that cut checkout failures by 18%.", evidence: "resumeText + proofPoints" },
    ],
    companySummary: "Builds workflow software.",
    researchFacts: [
      { label: "Product", value: "Workflow software" },
      { label: "Stack", value: "TypeScript" },
      { label: "Work mode", value: "Remote India" },
    ],
    engineeringSignal: "TypeScript stack",
    researchRisk: "No material risks found from the available sources.",
  },
  {
    company: "Northstar",
    role: "Staff Software Engineer",
    location: "San Francisco, CA",
    ats: "Ashby",
    initials: "N",
    score: "91",
    verdict: "excellent",
    recommendation: "Strong staff-level match on bar and authorization.",
    summary: "US staff role requiring authorization without sponsorship.",
    match: "Staff-level systems experience and authorization are both supported by the profile.",
    gap: "Company-specific domain depth is still worth validating.",
    candidate: "Jordan Lee",
    email: "jordan@example.com",
    years: "9 years",
    answer: "I want to keep doing staff-level product engineering on TypeScript systems with real customer impact, which matches this seat.",
    formFields: [
      { label: "Full name", helper: "Required", kind: "text", placeholder: "Enter your full name", value: "Jordan Lee", evidence: "identity.fullName" },
      { label: "Are you authorized to work in the US without sponsorship?", helper: "Required", kind: "select", placeholder: "Select an option", value: "Yes", evidence: "defaults.authorizedToWork", options: ["Yes", "No"] },
      { label: "Why do you want to work here?", helper: "Required", kind: "textarea", placeholder: "Share a concise answer", value: "I want to keep doing staff-level product engineering on TypeScript systems with real customer impact, which matches this seat.", evidence: "headline + resumeText" },
    ],
    companySummary: "US product company hiring for a staff engineering role.",
    researchFacts: [
      { label: "Role focus", value: "Distributed systems" },
      { label: "Stack", value: "TypeScript" },
      { label: "Work mode", value: "Hybrid San Francisco" },
    ],
    engineeringSignal: "TypeScript and distributed-systems requirements",
    researchRisk: "Company-specific domain depth is still shallow.",
  },
] as const;

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export default function ProductDemo() {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const browserBody = useRef<HTMLDivElement>(null);
  const jobPage = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const ready = useRef<HTMLElement>(null);
  const loader = useRef<HTMLElement>(null);
  const results = useRef<HTMLElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const analyzeButton = useRef<HTMLButtonElement>(null);
  const answersTab = useRef<HTMLButtonElement>(null);
  const researchTab = useRef<HTMLButtonElement>(null);
  const fillButton = useRef<HTMLButtonElement>(null);
  const formFields = useRef<Array<HTMLElement | null>>([]);
  const [exampleIndex, setExampleIndex] = useState(0);
  const [resultTab, setResultTab] = useState<ResultTab>("fit");
  const [filling, setFilling] = useState(false);
  const [filledFields, setFilledFields] = useState(0);
  const item = examples[exampleIndex];
  const applicationFields = item.formFields;
  const suggestions = applicationFields.map((field) => ({ ...field, confidence: "high" }));

  useProductDemoAnimation(
    { root, stage, browserBody, jobPage, panel, ready, loader, results, cursor, analyzeButton, answersTab, researchTab, fillButton, formFields },
    { setExampleIndex, setFilledFields, setFilling, setResultTab },
    examples.length,
  );

  return (
    <div className="demo-root" ref={root}>
      <div className="demo-desktop" aria-label="Animated Fieldcraft extension workflow">
        <div className="browser-stage" ref={stage}>
          <div className="browser-topbar">
            <span className="browser-dots"><i /><i /><i /></span>
            <span className="browser-address">jobs.{item.ats.toLowerCase()}.co/{item.company.toLowerCase()}</span>
          </div>
          <div className="browser-body" ref={browserBody}>
          <article className="job-page" ref={jobPage}>
            <span className="job-page-company">{item.company}</span>
            <h3>{item.role}</h3>
            <p>{item.location} · Full-time</p>
            <div className="job-page-line long" />
            <div className="job-page-line" />
            <div className="job-page-line mid" />
            <form className="job-page-section" noValidate>
              <span>Application</span>
              {applicationFields.map((field, index) => (
                <label
                  className={`application-field ${field.kind} ${filledFields > index ? "is-filled" : ""}`}
                  key={field.label}
                  ref={(node) => { formFields.current[index] = node; }}
                >
                  <span className="application-field-label"><strong>{field.label}</strong><small>{field.helper}</small></span>
                  {field.kind === "textarea" ? (
                    <textarea aria-label={field.label} placeholder={field.placeholder} readOnly rows={4} value={filledFields > index ? field.value : ""} />
                  ) : field.kind === "select" ? (
                    <select aria-label={field.label} disabled value={filledFields > index ? field.value : ""}>
                      <option value="">{field.placeholder}</option>
                      {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  ) : (
                    <input aria-label={field.label} placeholder={field.placeholder} readOnly type="text" value={filledFields > index ? field.value : ""} />
                  )}
                </label>
              ))}
            </form>
          </article>

          <div className="extension-replica app-shell" ref={panel}>
            <header className="app-header">
              <button type="button" className="brand-button" tabIndex={-1}>
                <BrandMark />
                <span>Fieldcraft</span>
              </button>
              <button type="button" className="icon-button quiet" tabIndex={-1} aria-label="Settings">
                <Settings2 size={18} />
              </button>
            </header>

            <main className="dashboard empty-dashboard demo-screen" ref={ready}>
              <section className="empty-hero">
                <div className="hero-orbit"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="hero-glyph"><FileSearch size={27} /></span></div>
                <span className="eyebrow">Current tab → grounded application</span>
                <h2>Read the role.<br />Cut through the noise.</h2>
                <p>Fieldcraft reads the full job page, researches the company, checks the role against your actual work, then drafts only what the form needs.</p>
              </section>
              <section className="workflow-card">
                <div className="workflow-step"><span>01</span><div className="workflow-icon"><Search size={17} /></div><div><strong>Read</strong><p>JD, requirements, and every application field</p></div></div>
                <div className="workflow-step"><span>02</span><div className="workflow-icon"><Target size={17} /></div><div><strong>Judge</strong><p>Fit, real gaps, company signals, and blockers</p></div></div>
                <div className="workflow-step"><span>03</span><div className="workflow-icon"><Zap size={17} /></div><div><strong>Fill</strong><p>Review exact answers, then insert</p></div></div>
              </section>
              <section className="mode-selector">
                <div className="mode-options">
                  <button type="button" className="selected" tabIndex={-1}><ScanSearch size={18} /><span><strong>Analyze with AI</strong><small>Research, fit score, and drafted answers</small></span></button>
                  <button type="button" tabIndex={-1}><PencilLine size={18} /><span><strong>Direct-fill</strong><small>Map profile fields to the form instantly</small></span></button>
                </div>
              </section>
              <button type="button" className="analyze-button" tabIndex={-1} ref={analyzeButton}><ScanSearch size={18} /> Analyze this job</button>
              <p className="microcopy">Nothing is filled or submitted automatically.</p>
            </main>

            <main className="analysis-loader demo-screen" ref={loader}>
              <div className="scanner"><div className="scanner-sheet"><span /><span /><span /><span /><span /><i /></div><div className="scanner-badge"><ScanSearch size={18} /></div></div>
              <span className="eyebrow">Building the application brief</span>
              <h2>Researching, matching, drafting…</h2>
              <p>This can take a minute when live company research is enabled.</p>
              <div className="loader-steps"><span className="done"><Check size={13} /> Candidate context</span><span className="done"><Check size={13} /> Page scan</span><span className="active"><LoaderCircle className="demo-spin" size={13} /> Judgment</span></div>
            </main>

            <main className="dashboard results-dashboard demo-screen" ref={results}>
              <section className="job-strip">
                <div className="company-avatar">{item.initials}</div>
                <div className="job-strip-copy"><span>{item.company}</span><h2>{item.role}</h2><div><span><MapPin size={12} /> {item.location}</span><span><BriefcaseBusiness size={12} /> {item.ats}</span></div></div>
                <button type="button" className="icon-button quiet" tabIndex={-1} aria-label="Re-analyze"><RefreshCw size={16} /></button>
              </section>
              <nav className="result-tabs">
                <button type="button" className={resultTab === "fit" ? "active" : ""} tabIndex={-1}>Fit</button>
                <button type="button" className={resultTab === "answers" ? "active" : ""} tabIndex={-1} ref={answersTab}>Answers <span>{suggestions.length}</span></button>
                <button type="button" className={resultTab === "research" ? "active" : ""} tabIndex={-1} ref={researchTab}>Research</button>
              </nav>
              <div className="result-content">
                {resultTab === "fit" && <div className="view-stack">
                  <section className="fit-card"><div className="score-ring" style={{ "--score": `${Number(item.score) * 3.6}deg` } as CSSProperties}><div><strong>{item.score}</strong><span>/ 100</span></div></div><div className="fit-copy"><span className={`verdict ${item.verdict}`}>{item.verdict} fit</span><h2>{item.recommendation}</h2></div></section>
                  <section className="summary-card"><div className="card-kicker"><FileSearch size={15} /> Role, distilled</div><p>{item.summary}</p><div className="keyword-row"><span>React</span><span>TypeScript</span><span>Product</span></div></section>
                  <section className="signal-card positive"><div className="card-kicker"><CheckCircle2 size={17} /> Where you match</div><ul><li>{item.match}</li></ul></section>
                  <section className="signal-card caution"><div className="card-kicker"><CircleAlert size={17} /> Gaps to respect</div><ul><li>{item.gap}</li></ul></section>
                </div>}
                {resultTab === "answers" && <div className="view-stack answers-view">
                  <div className="answers-toolbar"><div><strong>{suggestions.length} drafts</strong><span>0 intentionally skipped</span></div><button type="button" className="mini-button" tabIndex={-1}><Check size={14} /> Select safe</button></div>
                  {suggestions.map((suggestion) => <article className="answer-card selected" key={suggestion.label}>
                    <div className="answer-card-head"><span className="select-box checked"><Check size={12} strokeWidth={2.75} /></span><div><h3>{suggestion.label}</h3><div className="answer-meta"><span className={`confidence-dot ${suggestion.confidence}`} />{suggestion.confidence} confidence</div></div>{filledFields > 0 && <span className="fill-result filled"><Check size={14} /></span>}</div>
                    <textarea aria-label={suggestion.label} value={suggestion.value} readOnly rows={suggestion.label.length > 20 ? 4 : 2} />
                    <div className="answer-foot"><span>{suggestion.evidence}</span></div>
                  </article>)}
                </div>}
                {resultTab === "research" && <div className="view-stack research-view">
                  <section className="research-lead"><div className="research-icon"><Globe2 size={21} /></div><div><span className="eyebrow">Company brief</span><h2>{item.company}</h2></div></section>
                  <p className="research-summary">{item.companySummary}</p>
                  <div className="research-facts">{item.researchFacts.map((fact) => <div className="fact" key={fact.label}><span>{fact.label}</span><strong>{fact.value}</strong></div>)}</div>
                  <section className="signal-card neutral"><div className="card-kicker"><Zap size={17} /> Engineering signals</div><ul><li>{item.engineeringSignal}</li></ul></section>
                  <section className="signal-card caution"><div className="card-kicker"><CircleAlert size={17} /> Things to validate</div><ul><li>{item.researchRisk}</li></ul></section>
                  <section className="sources-card"><div className="card-kicker"><SquareArrowOutUpRight size={15} /> Sources</div><span><strong>Job application page</strong><small>jobs.{item.ats.toLowerCase()}.co</small><ExternalLink size={14} /></span></section>
                </div>}
              </div>
              <footer className="fill-footer"><div><strong>{suggestions.length}</strong><span>selected to fill</span></div><button type="button" className="primary-button" tabIndex={-1} ref={fillButton}>{filling ? <LoaderCircle className="demo-spin" size={17} /> : <PencilLine size={17} />}{filling ? "Filling…" : "Fill selected"}</button></footer>
              {filledFields === applicationFields.length && <div className="toast"><CheckCircle2 size={17} /> {applicationFields.length} fields filled</div>}
            </main>
          </div>
          </div>
          <span className="demo-cursor" ref={cursor} aria-hidden="true"><MousePointer2 size={27} fill="#fffefa" stroke="#1c1b20" strokeWidth={1.7} /></span>
        </div>
      </div>

      <div className="demo-mobile" aria-label="Static Fieldcraft extension preview">
        <div className="mobile-panel">
          <div className="mobile-panel-head"><BrandMark /><span>Fieldcraft</span></div>
          <div className="mobile-job"><b>{examples[0].company}</b><strong>{examples[0].role}</strong><small>{examples[0].location}</small></div>
          <div className="mobile-score"><strong>{examples[0].score}</strong><span>Strong fit</span></div>
          <p>{examples[0].recommendation}</p>
          <div className="mobile-answer"><span>Why are you interested?</span><p>{examples[0].answer}</p></div>
          <button type="button">Review 4 answers</button>
        </div>
      </div>
    </div>
  );
}
