import { NextResponse } from "next/server";

export const GITHUB_API_BASE = "https://api.github.com";
export const DEFAULT_ASSET_NAME = "fieldcraft-extension-latest.zip";
export const DEFAULT_CACHE_SECONDS = "60";
export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 250;

export interface GitHubAsset {
  name: string;
  url: string;
  size: number;
  content_type: string;
  browser_download_url: string;
}

export interface GitHubRelease {
  tag_name: string;
  assets: GitHubAsset[];
  published_at?: string;
  created_at?: string;
}

export interface ReleaseInfo {
  tag: string;
  version: string;
  assetName: string;
  downloadUrl: string;
  publishedAt: string;
}

export function errorResponse(status: number, message: string, details?: string) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(input, init);
      if (res.ok || res.status < 500) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
    }
  }
  throw lastError;
}

export function pickAsset(assets: GitHubAsset[], preferredName: string): GitHubAsset | undefined {
  const exact = assets.find((a) => a.name === preferredName);
  if (exact) return exact;

  const fallback = assets.find(
    (a) => a.name.endsWith("-latest.zip") && !/source/i.test(a.name),
  );
  if (fallback) return fallback;

  return assets.find((a) => a.name.endsWith(".zip") && !/source/i.test(a.name));
}

const VERSIONED_ASSET_RE = /^fieldcraft-extension-(.+)\.zip$/i;

export function parseVersionFromAssets(assets: GitHubAsset[]): string | null {
  for (const asset of assets) {
    const match = VERSIONED_ASSET_RE.exec(asset.name);
    if (match && !/latest/i.test(asset.name)) {
      return match[1];
    }
  }
  return null;
}

export function buildReleaseInfo(
  release: GitHubRelease,
  asset: GitHubAsset,
  origin: string,
): ReleaseInfo {
  const version = parseVersionFromAssets(release.assets) ?? release.tag_name.replace(/^v/i, "");
  return {
    tag: release.tag_name,
    version,
    assetName: asset.name,
    downloadUrl: `${origin}/api/download?asset=${encodeURIComponent(asset.name)}`,
    publishedAt: release.published_at || new Date().toISOString(),
  };
}

export async function fetchLatestGitHubRelease(
  owner: string,
  name: string,
  token: string,
): Promise<GitHubRelease> {
  const releaseUrl = `${GITHUB_API_BASE}/repos/${owner}/${name}/releases/latest`;
  const res = await fetchWithRetry(releaseUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "fieldcraft-web/1.0",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "unknown");
    throw new Error(`GitHub API error ${res.status}: ${body}`);
  }

  return (await res.json()) as GitHubRelease;
}
