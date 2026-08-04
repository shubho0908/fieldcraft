import { useEffect, useState } from "react";
import { getLastSeenRelease, compareVersions } from "../lib/release-check";
import type { RemoteRelease } from "../lib/release-check";

export function ReleaseBanner() {
  const [release, setRelease] = useState<RemoteRelease | null>(null);

  useEffect(() => {
    const current = __FIELDCRAFT_VERSION__;
    void getLastSeenRelease().then((last) => {
      if (last && compareVersions(last.version, current) > 0) {
        setRelease(last);
      }
    });
  }, []);

  if (!release) return null;

  return (
    <a
      href={release.downloadUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="release-banner"
      aria-label={`Fieldcraft ${release.version} is available. Download update.`}
    >
      <span>Fieldcraft {release.version} is available</span>
      <span className="release-banner-cta">Download update</span>
    </a>
  );
}
