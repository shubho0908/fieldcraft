import { type NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_ASSET_NAME,
  DEFAULT_CACHE_SECONDS,
  type GitHubAsset,
  type GitHubRelease,
  errorResponse,
  fetchWithRetry,
  getCachedLatestRelease,
  pickAsset,
} from "../../../lib/extension-release";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || "shubho0908/fieldcraft";
  const assetName =
    request.nextUrl.searchParams.get("asset") ||
    process.env.EXTENSION_ASSET_NAME ||
    DEFAULT_ASSET_NAME;
  const cacheSeconds = Number(process.env.EXTENSION_DOWNLOAD_CACHE_SECONDS ?? DEFAULT_CACHE_SECONDS);

  const [owner, name] = repo.split("/");
  if (!owner || !name || repo.split("/").length !== 2) {
    return errorResponse(500, "Invalid GITHUB_REPO format", `Expected owner/name, got: ${repo}`);
  }

  if (!token) {
    return errorResponse(
      500,
      "Server configuration error",
      "GITHUB_TOKEN is required to fetch releases from a private repository",
    );
  }

  let release: GitHubRelease;
  try {
    release = await getCachedLatestRelease(owner, name, token);
  } catch (err) {
    console.error("Failed to reach GitHub releases API:", err);
    return errorResponse(502, "Failed to reach GitHub", String(err));
  }

  if (!release.assets?.length) {
    return errorResponse(404, "Latest release has no downloadable assets");
  }

  const asset = pickAsset(release.assets, assetName);
  if (!asset) {
    return errorResponse(
      404,
      `No extension asset found in release ${release.tag_name}`,
      `Searched for: ${assetName}`,
    );
  }

  let assetRes: Response;
  try {
    // Use the asset API URL (not browser_download_url) so private assets return a signed redirect.
    assetRes = await fetchWithRetry(asset.url, {
      method: "GET",
      headers: {
        Accept: "application/octet-stream",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "fieldcraft-web/1.0",
      },
      redirect: "manual",
    });
  } catch (err) {
    console.error("Failed to fetch release asset:", err);
    return errorResponse(502, "Failed to fetch release asset", String(err));
  }

  // GitHub private assets redirect to a short-lived signed URL.
  if (assetRes.status === 302 || assetRes.status === 307) {
    const signedUrl = assetRes.headers.get("Location");
    if (!signedUrl) {
      return errorResponse(502, "GitHub returned a redirect without a Location header");
    }
    try {
      assetRes = await fetchWithRetry(signedUrl, {
        headers: { Accept: "application/octet-stream" },
      });
    } catch (err) {
      console.error("Failed to follow signed asset URL:", err);
      return errorResponse(502, "Failed to download asset from signed URL", String(err));
    }
  }

  if (!assetRes.ok) {
    const body = await assetRes.text().catch(() => "unknown");
    console.error("Asset download error:", assetRes.status, body);
    return errorResponse(assetRes.status, "Failed to download asset from GitHub", body);
  }

  const headers = new Headers();
  const contentType = asset.content_type || assetRes.headers.get("content-type") || "application/octet-stream";
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", `attachment; filename="${asset.name}"`);
  headers.set("X-Release-Tag", release.tag_name);
  headers.set("Cache-Control", `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`);

  const contentLength = assetRes.headers.get("content-length") || String(asset.size);
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  return new Response(assetRes.body, { status: 200, headers });
}
