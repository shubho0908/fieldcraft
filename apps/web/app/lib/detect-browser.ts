export type BrowserTarget = "chrome" | "safari" | "other";

export function getBrowserTarget(): BrowserTarget {
  if (typeof navigator === "undefined") return "chrome";
  const ua = navigator.userAgent;
  // Chromium-based browsers (Chrome, Edge, Brave, Opera, Arc, Chrome on iOS).
  if (/Chrome\/|Chromium\/|CriOS\/|Edg\/|Edge\//i.test(ua)) return "chrome";
  // Safari on macOS and iOS.
  if (/Safari\//i.test(ua)) return "safari";
  return "other";
}
