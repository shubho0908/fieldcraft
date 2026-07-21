import Image from "next/image";
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
            <a href="#product">Product</a>
            <a href="#workflow">How it works</a>
          </nav>
          <DownloadExtensionButton className="nav-action" />
        </header>

        <main id="top">
          <section className="hero" aria-labelledby="hero-heading">
            <div className="hero-copy">
              <span className="eyebrow">A careful copilot for job applications</span>
              <h1 id="hero-heading">
                Read it clearly.
                <br />
                Apply truthfully.
              </h1>
              <p className="hero-summary">
                Fieldcraft reads the open job tab, checks it against your real experience, and leaves every decision with you.
              </p>
              <div className="hero-actions">
                <DownloadExtensionButton className="button button-primary" />
                <a className="button button-secondary" href="#product">
                  Watch the workflow
                </a>
              </div>
            </div>
            <figure className="hero-media">
              <Image
                src="/hero.jpg"
                alt="A calm, focused workspace bathed in natural light"
                fill
                priority
                sizes="(max-width: 1100px) 100vw, 50vw"
                className="hero-image"
              />
            </figure>
          </section>

          <section className="demo-section" id="product" aria-labelledby="demo-heading">
            <div className="section-heading reveal">
              <h2 id="demo-heading">One tab. Clearer next move.</h2>
              <p className="section-lead">
                The side panel opens beside the job you&apos;re looking at. Fieldcraft reads the page, researches the company, and drafts answers you review before anything is filled.
              </p>
            </div>
            <ProductDemo />
          </section>

          <section className="workflow-section" id="workflow" aria-labelledby="workflow-heading">
            <div className="section-heading reveal">
              <h2 id="workflow-heading">Three steps. Your call every time.</h2>
              <p className="section-lead">
                Fieldcraft does the busywork. You keep the judgment.
              </p>
            </div>
            <div className="workflow-grid reveal">
              <article className="workflow-card workflow-card-read">
                <div className="workflow-card-text">
                  <span className="step-number">01</span>
                  <h3>Read</h3>
                  <p>Maps the job description, requirements, and every visible application field from the page you opened.</p>
                </div>
                <div className="workflow-card-media">
                  <Image
                    src="/process.jpg"
                    alt="Hands capturing the details of a role in a notebook"
                    fill
                    sizes="(max-width: 1100px) 100vw, 35vw"
                    className="workflow-image"
                  />
                </div>
              </article>

              <article className="workflow-card workflow-card-judge">
                <span className="step-number">02</span>
                <h3>Judge</h3>
                <p>Grounds the fit in your saved profile, surfaces real gaps, and gathers a concise company brief.</p>
              </article>

              <article className="workflow-card workflow-card-fill">
                <span className="step-number">03</span>
                <h3>Fill</h3>
                <p>You review each drafted answer and choose what to insert. Fieldcraft never submits an application.</p>
                <div className="workflow-card-media workflow-card-media-fill">
                  <Image
                    src="/fill.jpg"
                    alt="A hand ready to edit the final answer on a laptop"
                    fill
                    sizes="(max-width: 1100px) 100vw, 25vw"
                    className="workflow-image"
                  />
                </div>
              </article>
            </div>
          </section>

          <section className="closing-section" id="get-fieldcraft" aria-labelledby="closing-heading">
            <div className="closing-content reveal">
              <h2 id="closing-heading">The decision stays with you.</h2>
              <p>Free for Chrome. No account required. Your data stays local.</p>
              <DownloadExtensionButton className="button button-primary" />
            </div>
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
