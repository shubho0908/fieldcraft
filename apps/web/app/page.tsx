import { DownloadExtensionButton } from "./download-extension-button";
import { InstallStepVisual } from "./install-step-visual";
import ProductDemo from "./product-demo-lazy";

function BrandMark() {
  return (
    <span className="site-brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export default function Home() {
  return (
    <>
      <main className="desktop-required" aria-labelledby="desktop-required-heading">
        <div className="desktop-required-content">
          <BrandMark />
          <p>Desktop view</p>
          <p id="desktop-required-heading" className="desktop-required-heading" role="heading" aria-level={2}>
            Open this website on a desktop.
          </p>
          <p className="desktop-required-description">
            Fieldcraft&apos;s product walkthrough is designed for a larger screen.
          </p>
        </div>
      </main>

      <div className="site-shell">
        <header className="site-header">
          <a className="site-brand" href="#top" aria-label="Fieldcraft home">
            <BrandMark />
            <span>Fieldcraft</span>
          </a>
          <nav aria-label="Primary navigation">
            <a href="#demo">Product</a>
            <a href="#workflow">How it works</a>
            <a href="#install">Install</a>
          </nav>
          <DownloadExtensionButton className="nav-action" />
        </header>

        <main id="top">
          <section className="hero" aria-labelledby="hero-heading">
            <div className="hero-copy">
              <span className="eyebrow">A careful copilot for job applications</span>
              <h1 id="hero-heading">
                Read clearly.
                <br />
                Apply truthfully.
              </h1>
              <p className="hero-summary">
                Fieldcraft reads the open job tab, checks it against your real experience, and leaves every decision with you.
              </p>
              <div className="hero-actions">
                <DownloadExtensionButton className="button button-primary" />
                <a className="button button-secondary" href="#demo">
                  Watch the workflow
                </a>
              </div>
            </div>
            <div className="hero-visual" aria-hidden="true">
              <div className="hero-glyph">
                <BrandMark />
              </div>
            </div>
          </section>

          <section className="demo-section" id="demo" aria-labelledby="demo-heading">
            <div className="section-heading reveal">
              <h2 id="demo-heading">Inside the side panel</h2>
              <p>One tab. A clearer next move.</p>
            </div>
            <div className="reveal">
              <ProductDemo />
            </div>
          </section>

          <section className="workflow-section" id="workflow" aria-labelledby="workflow-heading">
            <div className="section-heading workflow-heading reveal">
              <h2 id="workflow-heading">Built around review</h2>
              <p>Useful context, kept honest.</p>
            </div>
            <div className="workflow-grid reveal">
              <article className="workflow-card">
                <span className="workflow-step">01</span>
                <strong>Read</strong>
                <p>Fieldcraft maps the job description, requirements, and visible form fields from the page you opened.</p>
              </article>
              <article className="workflow-card">
                <span className="workflow-step">02</span>
                <strong>Judge</strong>
                <p>It grounds the fit in your real experience, surfaces gaps, and gathers a concise company brief.</p>
              </article>
              <article className="workflow-card">
                <span className="workflow-step">03</span>
                <strong>Fill</strong>
                <p>You review each drafted answer and choose what to insert. Fieldcraft never submits an application.</p>
              </article>
            </div>
          </section>

          <section className="install-section" id="install" aria-labelledby="install-heading">
            <div className="section-heading reveal">
              <h2 id="install-heading">Load it in Chrome</h2>
              <p>Five steps to get going.</p>
            </div>
            <ol className="install-grid reveal">
              <li>
                <span>01</span>
                <strong>Download the build</strong>
                <p>Get the latest ZIP from this page.</p>
                <InstallStepVisual step={1} />
              </li>
              <li>
                <span>02</span>
                <strong>Unzip the archive</strong>
                <p>Extract the folder so it can be selected.</p>
                <InstallStepVisual step={2} />
              </li>
              <li>
                <span>03</span>
                <strong>Enable developer mode</strong>
                <p>Open chrome://extensions and flip the toggle.</p>
                <InstallStepVisual step={3} />
              </li>
              <li>
                <span>04</span>
                <strong>Load unpacked</strong>
                <p>Choose the extracted folder in the dialog.</p>
                <InstallStepVisual step={4} />
              </li>
              <li>
                <span>05</span>
                <strong>Open a job page</strong>
                <p>Pin the icon, visit a posting, and open the panel.</p>
                <InstallStepVisual step={5} />
              </li>
            </ol>
          </section>

          <section className="closing-section" id="get-fieldcraft">
            <h2 className="reveal">The decision stays with you.</h2>
            <p className="reveal">Apply with the full picture.</p>
            <div className="reveal">
              <DownloadExtensionButton className="button button-primary" />
            </div>
          </section>
        </main>

        <footer className="site-footer">
          <a className="site-brand" href="#top" aria-label="Fieldcraft home">
            <BrandMark />
            <span>Fieldcraft</span>
          </a>
          <span className="site-footer-credit">
            Created by{" "}
            <a href="https://shubhojeet.me" target="_blank" rel="noopener noreferrer">
              Shubhojeet
            </a>
          </span>
        </footer>
      </div>
    </>
  );
}
