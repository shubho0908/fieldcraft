const RELEASE_API_URL = "https://fieldcraft.shubhojeet.me/api/release";
const CHECK_INTERVAL_MINUTES = 60 * 24;

const STORAGE_KEY = "fieldcraft.lastSeenRelease";
const LAST_CHECKED_AT_KEY = "fieldcraft.releaseLastCheckedAt";
const NOTIFICATION_URLS_KEY = "fieldcraft.releaseNotificationUrls";

export interface RemoteRelease {
  tag: string;
  version: string;
  assetName: string;
  downloadUrl: string;
  publishedAt: string;
}

function normalizeVersion(version: string): string {
  return version.replace(/^v/i, "").trim();
}

/** Split a version like "0.1.0" or "0.1.0+build.123" into comparable segments. */
export function versionSegments(version: string): (string | number)[] {
  return normalizeVersion(version)
    .split(/[.+]/)
    .map((segment) => {
      const num = Number(segment);
      return Number.isNaN(num) ? segment : num;
    });
}

/**
 * Compare two Fieldcraft version strings.
 * Returns > 0 when `left` is newer, < 0 when `right` is newer, 0 when equal.
 */
export function compareVersions(left: string, right: string): number {
  const leftSegments = versionSegments(left);
  const rightSegments = versionSegments(right);
  const maxLength = Math.max(leftSegments.length, rightSegments.length);

  for (let i = 0; i < maxLength; i++) {
    const a = leftSegments[i];
    const b = rightSegments[i];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (typeof a === "number" && typeof b === "number") {
      if (a !== b) return a - b;
    } else {
      const aStr = String(a);
      const bStr = String(b);
      if (aStr !== bStr) return aStr.localeCompare(bStr);
    }
  }

  return 0;
}

export async function getLastSeenRelease(): Promise<RemoteRelease | null> {
  const stored = await chrome.storage.local.get([STORAGE_KEY, LAST_CHECKED_AT_KEY]);
  return (stored[STORAGE_KEY] as RemoteRelease | undefined) ?? null;
}

export async function setLastSeenRelease(release: RemoteRelease): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: release });
}

async function getLastCheckedAt(): Promise<number | null> {
  const stored = await chrome.storage.local.get(LAST_CHECKED_AT_KEY);
  const value = stored[LAST_CHECKED_AT_KEY];
  return typeof value === "number" ? value : null;
}

async function setLastCheckedAt(timestamp: number): Promise<void> {
  await chrome.storage.local.set({ [LAST_CHECKED_AT_KEY]: timestamp });
}

export async function shouldCheckRelease(): Promise<boolean> {
  const lastChecked = await getLastCheckedAt();
  if (!lastChecked) return true;
  return Date.now() - lastChecked >= CHECK_INTERVAL_MINUTES * 60 * 1000;
}

async function fetchLatestRelease(): Promise<RemoteRelease> {
  const response = await fetch(RELEASE_API_URL, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.text().catch(() => "unknown");
    throw new Error(`Release check failed: ${response.status} ${body}`);
  }
  return (await response.json()) as RemoteRelease;
}

/**
 * Check whether a newer Fieldcraft build is available.
 * Returns the remote release if it is newer than the currently running build
 * and newer than the last release we already notified about.
 */
export async function checkForUpdate(): Promise<RemoteRelease | null> {
  const remote = await fetchLatestRelease();
  const current = __FIELDCRAFT_VERSION__;

  if (compareVersions(remote.version, current) <= 0) {
    await setLastCheckedAt(Date.now());
    return null;
  }

  const lastSeen = await getLastSeenRelease();
  if (lastSeen && compareVersions(remote.version, lastSeen.version) <= 0) {
    await setLastCheckedAt(Date.now());
    return null;
  }

  await setLastSeenRelease(remote);
  await setLastCheckedAt(Date.now());
  return remote;
}

export async function runReleaseCheck(): Promise<RemoteRelease | null> {
  if (!(await shouldCheckRelease())) return null;

  try {
    return await checkForUpdate();
  } catch (error) {
    console.error("[Fieldcraft] release check failed:", error);
    return null;
  }
}

export function storeNotificationUrl(notificationId: string, url: string): void {
  void chrome.storage.local.set({ [`${NOTIFICATION_URLS_KEY}.${notificationId}`]: url });
}

export async function getNotificationUrl(notificationId: string): Promise<string | null> {
  const stored = await chrome.storage.local.get(`${NOTIFICATION_URLS_KEY}.${notificationId}`);
  const url = stored[`${NOTIFICATION_URLS_KEY}.${notificationId}`];
  return typeof url === "string" ? url : null;
}

async function clearNotificationUrl(notificationId: string): Promise<void> {
  await chrome.storage.local.remove(`${NOTIFICATION_URLS_KEY}.${notificationId}`);
}

export function showUpdateNotification(release: RemoteRelease): string {
  const id = `fieldcraft-update-${release.version}`;
  const title = `Fieldcraft ${release.version} is available`;

  // Safari WebExtensions do not support chrome.notifications.
  // Store the URL so the UI can show a release callout instead.
  if (typeof chrome !== "undefined" && "notifications" in chrome) {
    const message = "Click to download the zip, then load it unpacked in chrome://extensions.";
    void chrome.notifications.create(id, {
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title,
      message,
      isClickable: true,
    });
  }

  storeNotificationUrl(id, release.downloadUrl);
  return id;
}
