"use client";

import { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  Chrome,
  DownloadCloud,
  FileArchive,
  FolderPlus,
  Globe,
  Settings,
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
              <strong>Open Developer Settings</strong>
              <p>In Safari, click Develop in the menu bar, then Developer Settings.</p>
              <Settings className="install-icon" aria-hidden="true" />
            </li>
            <li>
              <span>04</span>
              <strong>Add temporary extension</strong>
              <p>Click Add Temporary Extension and choose the extracted build folder.</p>
              <FolderPlus className="install-icon" aria-hidden="true" />
            </li>
            <li>
              <span>05</span>
              <strong>Enable and allow access</strong>
              <p>Go to Safari Settings → Extensions, turn Fieldcraft on, and allow access on every website.</p>
              <Globe className="install-icon" aria-hidden="true" />
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
            <li>
              <span>05</span>
              <strong>Open a job page</strong>
              <p>Pin the icon, visit a posting, and open the panel.</p>
              <BriefcaseBusiness className="install-icon" aria-hidden="true" />
            </li>
          </>
        )}
      </ol>
      {isSafari && (
        <p className="install-safari-note">
          On iOS / iPadOS, Safari extensions are only available through the App Store.
        </p>
      )}
    </section>
  );
}
