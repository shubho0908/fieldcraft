import type { ManifestV3Export } from "@crxjs/vite-plugin";

type ExtensionTarget = "chrome" | "safari";

const baseManifest = {
  manifest_version: 3,
  name: "Fieldcraft — Job Application Copilot",
  short_name: "Fieldcraft",
  version: "0.1.0",
  description:
    "Research a role, evaluate fit, draft truthful senior-quality answers, and fill job applications after your review.",
  icons: {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png",
  },
  action: {
    default_title: "Open Fieldcraft",
    default_icon: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    },
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
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["src/content.ts"],
      run_at: "document_idle",
    },
  ],
  host_permissions: ["https://api.openai.com/*", "https://api.exa.ai/*", "http://*/*", "https://*/*"],
  background: {
    service_worker: "src/background.ts",
    type: "module",
  } as const,
};

export default function getManifest(target: ExtensionTarget): ManifestV3Export {
  const isSafari = target === "safari";

  const manifest: Record<string, unknown> = { ...baseManifest };

  if (isSafari) {
    // Safari WebExtensions do not support the chrome.sidePanel API, so the UI is
    // rendered by a content-script overlay iframe that loads the same
    // sidepanel.html. The side_panel manifest key is kept here only so CRXJS
    // processes sidepanel.html as an HTML entry; a post-build step strips it.
    manifest.permissions = ["activeTab", "alarms", "storage", "tabs"];
    manifest.side_panel = { default_path: "sidepanel.html" };
    manifest.content_scripts = [
      ...(manifest.content_scripts as typeof baseManifest.content_scripts),
      {
        matches: ["http://*/*", "https://*/*"],
        js: ["src/overlay.ts"],
        run_at: "document_idle",
      },
    ];
    // The sidepanel.html web-accessible resource is added in a post-build
    // step; adding it here would make CRXJS treat it as a static asset instead
    // of an HTML entry and skip script bundling.
  } else {
    // Chrome/Chromium path: native side panel, notifications, and unlimitedStorage.
    manifest.permissions = ["activeTab", "alarms", "notifications", "sidePanel", "storage", "tabs", "unlimitedStorage"];
    manifest.side_panel = { default_path: "sidepanel.html" };
  }

  return manifest as unknown as ManifestV3Export;
}
