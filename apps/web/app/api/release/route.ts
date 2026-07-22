import { type NextRequest } from "next/server";
import {
  DEFAULT_ASSET_NAME,
  type GitHubRelease,
  buildReleaseInfo,
  errorResponse,
  getCachedLatestRelease,
  pickAsset,
} from "../../../lib/extension-release";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || "shubho0908/fieldcraft";
  const assetName = process.env.EXTENSION_ASSET_NAME || DEFAULT_ASSET_NAME;

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

  const info = buildReleaseInfo(release, asset, request.nextUrl.origin);
  return Response.json(info);
}
