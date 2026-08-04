"use client";

import { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  Chrome,
  DownloadCloud,
  FileArchive,
  FolderPlus,
  Settings,
  Terminal,
  ToggleRight,
} from "lucide-react";
import { getBrowserTarget, type BrowserTarget } from "./lib/detect-browser";
import { SafariIcon } from "./icons/safari-icon";

export function InstallSection() {
  const [browser, setBrowser] = useState<BrowserTarget>("chrome");

  useEffect(() => {
    setBrowser(getBrowserTarget());
  }, []);

  const isSafari = browser === "safari";

  const HeadingIcon = isSafari ? SafariIcon : Chrome;

  return (
    <section className="install-section" id="install" aria-labelledby="install-heading">
      <div className="section-heading reveal">
        <h2 id="install-heading" className="install-heading">
          <HeadingIcon size={24} />
          {isSafari ? "Load it in Safari" : "Load it in Chrome"}
        </h2>
        <p>Five steps to get going.</p>
      </div>
      <ol className="install-grid reveal">
        <li>
          <span>01</span>
          <strong>Download the build</strong>
          <p>Get the latest ZIP from this page.</p>
          <DownloadCloud className="install-icon" aria-hidden="true" />
        </li>
        <li>
          <span>02</span>
          <strong>Unzip the archive</strong>
          <p>Extract the folder so it can be selected.</p>
          <FileArchive className="install-icon" aria-hidden="true" />
        </li>
        {isSafari ? (
          <>
            <li>
              <span>03</span>
              <strong>Convert with Xcode</strong>
              <p>Run xcrun safari-web-extension-converter on the extracted folder.</p>
              <Terminal className="install-icon" aria-hidden="true" />
            </li>
            <li>
              <span>04</span>
              <strong>Enable the extension</strong>
              <p>Open Safari Settings → Extensions and turn Fieldcraft on.</p>
              <Settings className="install-icon" aria-hidden="true" />
            </li>
          </>
        ) : (
          <>
            <li>
              <span>03</span>
              <strong>Enable developer mode</strong>
              <p>Open chrome://extensions and flip the toggle.</p>
              <ToggleRight className="install-icon" aria-hidden="true" />
            </li>
            <li>
              <span>04</span>
              <strong>Load unpacked</strong>
              <p>Choose the extracted folder in the dialog.</p>
              <FolderPlus className="install-icon" aria-hidden="true" />
            </li>
          </>
        )}
        <li>
          <span>05</span>
          <strong>Open a job page</strong>
          <p>{isSafari ? "Visit a posting and click the Fieldcraft toolbar icon." : "Pin the icon, visit a posting, and open the panel."}</p>
          <BriefcaseBusiness className="install-icon" aria-hidden="true" />
        </li>
      </ol>
      {isSafari && (
        <p className="install-safari-note">
          On iOS / iPadOS, Safari extensions are only available through the App Store.
        </p>
      )}
    </section>
  );
}
