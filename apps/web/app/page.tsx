import { DownloadExtensionDialog } from "./download-extension-dialog";
import ProductDemo from "./product-demo";

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
          <h1 id="desktop-required-heading">Open this website on a desktop.</h1>
          <p className="desktop-required-description">Fieldcraft’s product walkthrough is designed for a larger screen.</p>
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
          </nav>
          <DownloadExtensionDialog
            triggerClassName="nav-action"
          />
        </header>

        <main id="top">
          <section className="hero">
            <div className="hero-copy">
              <p className="hero-kicker">A careful copilot for job applications</p>
              <h1>Read it clearly.<br />Apply truthfully.</h1>
              <p className="hero-summary">
                Fieldcraft reads the open job tab, checks it against your real experience, and leaves every decision with you.
              </p>
              <div className="hero-actions">
                <DownloadExtensionDialog
                  triggerClassName="button button-primary"
                />
                <a className="button button-secondary" href="#demo">Watch the workflow</a>
              </div>
            </div>
          </section>

          <section className="demo-section" id="demo" aria-labelledby="demo-heading">
            <div className="section-heading">
              <p>Inside the side panel</p>
              <h2 id="demo-heading">One tab. Clearer next move.</h2>
            </div>
            <ProductDemo />
          </section>

          <section className="workflow-section" id="workflow" aria-labelledby="workflow-heading">
            <div className="section-heading workflow-heading">
              <p>Built around review</p>
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
            <p>Apply with the full picture.</p>
            <h2>The decision stays with you.</h2>
            <DownloadExtensionDialog
              triggerClassName="button button-primary"
            />
          </section>
        </main>

        <footer className="site-footer">
          <a className="site-brand" href="#top">
            <BrandMark />
            <span>Fieldcraft</span>
          </a>
          <span>Local-first job application copilot</span>
        </footer>
      </div>
    </>
  );
}
