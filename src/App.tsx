import { useEffect, useState } from "react";
import { ArrowLeft, Settings2 } from "lucide-react";
import Dashboard from "./components/Dashboard";
import BrandMark from "./components/BrandMark";
import ProfileEditor from "./components/ProfileEditor";
import {
  getCachedAnalysis,
  getProfile,
  getSettings,
  hasApiKey,
} from "./lib/storage";
import type {
  CachedAnalysis,
  CandidateProfile,
  ExtensionSettings,
} from "./types";

type View = "dashboard" | "profile";

export default function App() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [apiKeyExists, setApiKeyExists] = useState(false);
  const [cached, setCached] = useState<CachedAnalysis | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      getProfile(),
      getSettings(),
      hasApiKey(),
      getCachedAnalysis(),
    ]).then(([nextProfile, nextSettings, hasKey, nextCached]) => {
      setProfile(nextProfile);
      setSettings(nextSettings);
      setApiKeyExists(hasKey);
      setCached(nextCached);
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
            className="brand-button"
            onClick={() => setView("dashboard")}
            aria-label="Go to job analysis"
          >
            <BrandMark />
            <span>Fieldcraft</span>
          </button>
          {view === "profile" ? (
            <button className="icon-button" onClick={() => setView("dashboard")}>
              <ArrowLeft size={18} />
              <span className="sr-only">Back</span>
            </button>
          ) : (
            <button className="icon-button" onClick={() => setView("profile")}>
              <Settings2 size={18} />
              <span className="sr-only">Profile and settings</span>
            </button>
          )}
        </header>
      )}

      {onboarding || view === "profile" ? (
        <ProfileEditor
          initialProfile={profile}
          initialSettings={settings}
          apiKeyExists={apiKeyExists}
          onboarding={onboarding}
          onCancel={onboarding ? undefined : () => setView("dashboard")}
          onSaved={(nextProfile, nextSettings, hasKey) => {
            setProfile(nextProfile);
            setSettings(nextSettings);
            setApiKeyExists(hasKey);
            setView("dashboard");
          }}
        />
      ) : (
        <Dashboard
          profile={profile}
          settings={settings}
          apiKeyExists={apiKeyExists}
          initialCache={cached}
          onCache={setCached}
          onOpenSettings={() => setView("profile")}
        />
      )}
    </div>
  );
}
