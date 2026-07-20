import type { ManifestV3Export } from "@crxjs/vite-plugin";

const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: "Fieldcraft — Job Application Copilot",
  short_name: "Fieldcraft",
  version: "0.1.0",
  description:
    "Research a role, evaluate fit, draft truthful senior-quality answers, and fill job applications after your review.",
  permissions: [
    "activeTab",
    "sidePanel",
    "storage",
    "tabs",
    "unlimitedStorage",
  ],
  // Job-page host access is required so chrome.tabs can expose tab.url to the
  // side panel. Without it, Analyze stays disabled because binding never resolves.
  host_permissions: ["https://api.openai.com/*", "https://api.exa.ai/*", "http://*/*", "https://*/*"],
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  action: {
    default_title: "Open Fieldcraft side panel",
    default_icon: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    },
  },
  icons: {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png",
  },
  // Ctrl+Shift+F on Windows; Option+F (Alt+F) on macOS.
  commands: {
    "toggle-side-panel": {
      suggested_key: {
        default: "Alt+F",
        windows: "Ctrl+Shift+F",
        mac: "Alt+F",
      },
      description: "Toggle the Fieldcraft side panel",
    },
  },
  side_panel: {
    default_path: "sidepanel.html",
  },
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["src/content.ts"],
      run_at: "document_idle",
    },
  ],
};

export default manifest;
