import { DownloadExtensionButton } from "./download-extension-button";
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
          <section className="hero">
            <div className="hero-copy">
              <p className="hero-kicker">
                <span className="kicker-mark">
                  <BrandMark />
                  A careful copilot for job applications
                </span>
              </p>
              <h1>
                Read it clearly.
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
          </section>

          <section className="demo-section" id="demo" aria-labelledby="demo-heading">
            <div className="section-heading">
              <p>
                <span className="kicker-mark">
                  <BrandMark />
                  Inside the side panel
                </span>
              </p>
              <h2 id="demo-heading">One tab. Clearer next move.</h2>
            </div>
            <ProductDemo />
          </section>

          <section className="workflow-section" id="workflow" aria-labelledby="workflow-heading">
            <div className="section-heading workflow-heading">
              <p>
                <span className="kicker-mark">
                  <BrandMark />
                  Built around review
                </span>
              </p>
              <h2 id="workflow-heading">Useful context, kept honest.</h2>
            </div>
            <ol className="workflow-list">
              <li>
                <strong>Read</strong>
                <p>Fieldcraft maps the job description, requirements, and visible form fields from the page you opened.</p>
              </li>
              <li>
                <strong>Judge</strong>
                <p>It grounds the fit in your saved profile, surfaces real gaps, and gathers a concise company brief.</p>
              </li>
              <li>
                <strong>Fill</strong>
                <p>You review each drafted answer and choose what to insert. Fieldcraft never submits an application.</p>
              </li>
            </ol>
          </section>

          <section className="closing-section" id="get-fieldcraft">
            <p>
              <span className="kicker-mark">
                <BrandMark />
                Apply with the full picture.
              </span>
            </p>
            <h2>The decision stays with you.</h2>
            <DownloadExtensionButton className="button button-primary" />
          </section>

          <section className="install-section" id="install" aria-labelledby="install-heading">
            <div className="section-heading">
              <p>
                <span className="kicker-mark">
                  <BrandMark />
                  Get it running
                </span>
              </p>
              <h2 id="install-heading">Load the extension in Chrome.</h2>
            </div>
            <ol className="install-list">
              <li>
                <strong>Download the build</strong>
                <p>Click the Download button to get the latest <code>fieldcraft-extension-latest.zip</code>.</p>
              </li>
              <li>
                <strong>Unzip the archive</strong>
                <p>Extract the folder so you can select it in the next step.</p>
              </li>
              <li>
                <strong>Enable developer mode</strong>
                <p>Open <code>chrome://extensions</code> and toggle Developer mode in the top right.</p>
              </li>
              <li>
                <strong>Load unpacked</strong>
                <p>Click Load unpacked and choose the unzipped extension folder.</p>
              </li>
              <li>
                <strong>Open a job page</strong>
                <p>Pin the Fieldcraft icon, visit any job post, and click it to open the side panel.</p>
              </li>
            </ol>
          </section>
        </main>

        <footer className="site-footer">
          <a className="site-brand" href="#top">
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
