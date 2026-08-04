import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(process.cwd(), "dist", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

// Safari WebExtensions do not recognize the chrome.sidePanel manifest key.
// We keep it during the Vite/CRXJS build so sidepanel.html is processed as an
// HTML entry and bundled correctly, then strip it from the final artifact.
delete manifest.side_panel;

// Chrome-only permissions that Safari does not implement.
const chromeOnlyPermissions = new Set(["sidePanel"]);
if (Array.isArray(manifest.permissions)) {
  manifest.permissions = manifest.permissions.filter((p) => !chromeOnlyPermissions.has(p));
}

// The overlay iframe needs sidepanel.html exposed as a web-accessible resource.
const overlayMatch = ["http://*/*", "https://*/*"];
const war = manifest.web_accessible_resources?.find((r) =>
  r.matches?.some((m) => overlayMatch.includes(m)),
);
if (war && Array.isArray(war.resources)) {
  if (!war.resources.includes("sidepanel.html")) {
    war.resources.unshift("sidepanel.html");
  }
} else {
  manifest.web_accessible_resources = [
    ...(manifest.web_accessible_resources || []),
    {
      matches: overlayMatch,
      resources: ["sidepanel.html"],
      use_dynamic_url: false,
    },
  ];
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("[safari] Post-processed manifest for Safari build.");
