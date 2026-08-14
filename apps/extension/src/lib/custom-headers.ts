/**
 * Helpers for parsing and sanitizing user-supplied custom HTTP headers.
 * Used by the custom endpoint settings UI and any code that needs to inject
 * extra headers into OpenAI- or Anthropic-compatible SDK calls.
 */

const RFC7230_TOKEN_PATTERN = /^[\w!#$%&'*+\-.^_`|~]+$/u;

function sanitizeHeaderPair(
  key: string,
  value: unknown,
): { key: string; value: string } | null {
  if (typeof key !== "string" || typeof value !== "string") return null;
  const trimmedKey = key.trim();
  const trimmedValue = value.replace(/\r?\n|\r/g, " ").trim();
  if (!trimmedKey || !trimmedValue || !RFC7230_TOKEN_PATTERN.test(trimmedKey)) {
    return null;
  }
  return { key: trimmedKey, value: trimmedValue };
}

function addHeader(
  headers: Map<string, { key: string; value: string }>,
  key: string,
  value: unknown,
): void {
  const sanitized = sanitizeHeaderPair(key, value);
  if (!sanitized) return;
  const lower = sanitized.key.toLowerCase();
  const existing = headers.get(lower);
  if (existing) {
    // Same header name seen with different casing: last value wins and the
    // casing from the last occurrence is preserved.
    existing.key = sanitized.key;
    existing.value = sanitized.value;
  } else {
    headers.set(lower, sanitized);
  }
}

function headersFromMap(
  headers: Map<string, { key: string; value: string }>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { key, value } of headers.values()) {
    result[key] = value;
  }
  return result;
}

/**
 * Sanitize a raw header object (e.g. from storage or JSON). Keeps only valid
 * RFC 7230 token names, trims values, drops empty/bad entries, and collapses
 * any embedded newlines in values to spaces so they cannot break the HTTP
 * message framing. Header names are compared case-insensitively; duplicate
 * names collapse to a single entry where the last occurrence wins.
 */
export function sanitizeCustomHeaders(raw: unknown): Record<string, string> {
  const headers = new Map<string, { key: string; value: string }>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return headersFromMap(headers);
  }
  for (const [key, value] of Object.entries(raw)) {
    addHeader(headers, key, value);
  }
  return headersFromMap(headers);
}

/**
 * Parse a multiline string of headers into a sanitized header object.
 * Supports `Name: value` and `Name=value` separators, one header per line.
 * Header names are compared case-insensitively; duplicate names collapse to a
 * single entry where the last occurrence wins. If the input looks like a JSON
 * object, it is parsed and sanitized first.
 */
export function parseCustomHeaderLines(input: string): Record<string, string> {
  const text = input.trim();
  if (!text) return {};

  if (text.startsWith("{")) {
    try {
      return sanitizeCustomHeaders(JSON.parse(text));
    } catch {
      // Fall through to line parsing if JSON is malformed.
    }
  }

  const headers = new Map<string, { key: string; value: string }>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) continue;

    const colonIndex = trimmed.indexOf(":");
    const equalsIndex = trimmed.indexOf("=");
    let separator = -1;
    if (colonIndex !== -1 && equalsIndex !== -1) {
      separator = Math.min(colonIndex, equalsIndex);
    } else {
      separator = Math.max(colonIndex, equalsIndex);
    }
    if (separator <= 0) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    addHeader(headers, key, value);
  }
  return headersFromMap(headers);
}

/**
 * Convert a sanitized header object back into a `Name: value` multiline string.
 * Empty objects produce an empty string so the UI stays clean.
 */
export function serializeCustomHeaderLines(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}
