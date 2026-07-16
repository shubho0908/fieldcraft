import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowLeft, Settings2 } from "lucide-react";
import BrandMark from "./components/BrandMark";
import { getBootData, hasExaApiKey } from "./lib/storage";
import type { CandidateProfile, ExtensionSettings } from "./types";

const Dashboard = lazy(() => import("./components/Dashboard"));
const ProfileEditor = lazy(() => import("./components/ProfileEditor"));

type View = "dashboard" | "profile";

export default function App() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [apiKeyExists, setApiKeyExists] = useState(false);
  const [exaApiKeyExists, setExaApiKeyExists] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const boot = getBootData();
    // Preload lazy chunks during boot so Suspense never needs to show a
    // fallback when the main UI transitions in — the chunks arrive before
    // React attempts to render them.
    const preloadDashboard = import("./components/Dashboard");
    const preloadProfileEditor = import("./components/ProfileEditor");
    void boot.then((data) => {
      setProfile(data.profile);
      setSettings(data.settings);
      setApiKeyExists(data.apiKeyExists);
      setExaApiKeyExists(data.exaApiKeyExists);
      setLoading(false);
    });
  }, []);

  if (loading || !profile || !settings) {
    return (
      <main className="boot-screen">
        <BrandMark />
        <div className="boot-line" />
      </main>
    );
  }

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
              setProfile(nextProfile);
              setSettings(nextSettings);
              setApiKeyExists(hasKey);
              void hasExaApiKey().then(setExaApiKeyExists);
              setView("dashboard");
            }}
          />
        ) : (
          <Dashboard
            apiKeyExists={apiKeyExists}
            settings={settings}
            setSettings={setSettings}
            onOpenSettings={() => setView("profile")}
          />
        )}
      </Suspense>
    </div>
  );
}
