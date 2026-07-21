"use client";

export function InstallStepVisual({ step }: { step: number }) {
  return (
    <div className="install-step-visual" aria-hidden="true">
      <div className={`step-scene step-scene--${step}`}>
        {step === 1 && <DownloadScene />}
        {step === 2 && <UnzipScene />}
        {step === 3 && <ToggleScene />}
        {step === 4 && <LoadScene />}
        {step === 5 && <JobPageScene />}
      </div>
    </div>
  );
}

function BrowserChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="scene-browser">
      <div className="scene-browser-top">
        <span className="scene-dot" />
        <span className="scene-dot" />
        <span className="scene-dot" />
      </div>
      <div className="scene-browser-body">{children}</div>
    </div>
  );
}

function DownloadScene() {
  return (
    <BrowserChrome>
      <div className="scene-arrow" />
      <div className="scene-progress" />
    </BrowserChrome>
  );
}

function UnzipScene() {
  return (
    <div className="scene-unzip">
      <div className="scene-box">
        <div className="scene-lid" />
        <div className="scene-paper" />
        <div className="scene-paper scene-paper--two" />
      </div>
    </div>
  );
}

function ToggleScene() {
  return (
    <div className="scene-toggle">
      <span className="scene-toggle-label">Developer</span>
      <div className="scene-toggle-track">
        <div className="scene-toggle-knob" />
      </div>
    </div>
  );
}

function LoadScene() {
  return (
    <div className="scene-load">
      <div className="scene-folder">
        <div className="scene-folder-tab" />
        <div className="scene-folder-body" />
      </div>
      <div className="scene-plus" />
    </div>
  );
}

function JobPageScene() {
  return (
    <BrowserChrome>
      <div className="scene-page">
        <div className="scene-page-content">
          <div className="scene-line scene-line--long" />
          <div className="scene-line scene-line--mid" />
          <div className="scene-line scene-line--short" />
        </div>
        <div className="scene-panel" />
      </div>
    </BrowserChrome>
  );
}
