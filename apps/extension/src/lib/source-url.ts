/** Compare retrieved citations without changing case-sensitive paths or query values. */
export function normalizeSourceUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!/^https?:$/u.test(url.protocol)) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.*|fbclid|gclid|ref)$/iu.test(key)) url.searchParams.delete(key);
    }
    return url.href.replace(/\/$/u, "");
  } catch {
    return "";
  }
}
