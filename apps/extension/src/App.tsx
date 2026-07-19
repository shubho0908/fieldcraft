import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowLeft, Settings2 } from "lucide-react";
import BrandMark from "./components/BrandMark";
import { getBootData, hasExaApiKey } from "./lib/storage";
import type { CandidateProfile, ExtensionSettings } from "./types";

const Dashboard = lazy(() => import("./components/Dashboard"));
const ProfileEditor = lazy(() => import("./components/ProfileEditor"));

type View = "dashboard" | "profile";

interface BootState {
  profile: CandidateProfile;
  settings: ExtensionSettings;
  apiKeyExists: boolean;
  exaApiKeyExists: boolean;
}

export default function App() {
  const [boot, setBoot] = useState<BootState | null>(null);
  const [view, setView] = useState<View>("dashboard");

  useEffect(() => {
    const bootPromise = getBootData();
    // Preload lazy chunks during boot so Suspense never needs to show a
    // fallback when the main UI transitions in — the chunks arrive before
    // React attempts to render them.
    void import("./components/Dashboard");
    void import("./components/ProfileEditor");
    void bootPromise.then((data) => {
      setBoot({
        profile: data.profile,
        settings: data.settings,
        apiKeyExists: data.apiKeyExists,
        exaApiKeyExists: data.exaApiKeyExists,
      });
    });
  }, []);

  if (!boot) {
    return (
      <main className="boot-screen">
        <BrandMark />
        <div className="boot-line" />
      </main>
    );
  }

  const { profile, settings, apiKeyExists, exaApiKeyExists } = boot;
  const onboarding = !profile.onboardingComplete;

  return (
    <div className="app-shell">
      {!onboarding && (
        <header className="app-header">
          <button
            type="button"
            className="brand-button"
            onClick={() => setView("dashboard")}
            aria-label="Go to job analysis"
          >
            <BrandMark />
            <span>Fieldcraft</span>
          </button>
          {view === "profile" ? (
            <button type="button" className="icon-button" onClick={() => setView("dashboard")}>
              <ArrowLeft size={18} />
              <span className="sr-only">Back</span>
            </button>
          ) : (
            <button type="button" className="icon-button" onClick={() => setView("profile")}>
              <Settings2 size={18} />
              <span className="sr-only">Profile and settings</span>
            </button>
          )}
        </header>
      )}

      <Suspense
        fallback={
          <main className="boot-screen">
            <BrandMark />
            <div className="boot-line" />
          </main>
        }
      >
        {onboarding || view === "profile" ? (
          <ProfileEditor
            initialProfile={profile}
            initialSettings={settings}
            apiKeyExists={apiKeyExists}
            exaApiKeyExists={exaApiKeyExists}
            onboarding={onboarding}
            onCancel={onboarding ? undefined : () => setView("dashboard")}
            onSaved={(nextProfile, nextSettings, hasKey) => {
              setBoot((prev) =>
                prev
                  ? {
                      ...prev,
                      profile: nextProfile,
                      settings: nextSettings,
                      apiKeyExists: hasKey,
                    }
                  : prev,
              );
              void hasExaApiKey().then((exists) => {
                setBoot((prev) => (prev ? { ...prev, exaApiKeyExists: exists } : prev));
              });
              setView("dashboard");
            }}
          />
        ) : (
          <Dashboard
            apiKeyExists={apiKeyExists}
            settings={settings}
            setSettings={(nextSettings) => {
              setBoot((prev) =>
                prev ? { ...prev, settings: nextSettings } : prev,
              );
            }}
            onOpenSettings={() => setView("profile")}
          />
        )}
      </Suspense>
    </div>
  );
}
