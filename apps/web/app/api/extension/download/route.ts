import { getExtensionDownloadUrl } from "../../../extension-download";

export const dynamic = "force-dynamic";

const downloadFilename = "fieldcraft-extension.zip";

function errorResponse(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function GET() {
  const storageUrl = getExtensionDownloadUrl();

  if (!storageUrl) {
    return errorResponse("Extension download is not configured.", 503);
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(storageUrl);
  } catch {
    return errorResponse("Extension download is unavailable.", 503);
  }

  if (sourceUrl.protocol !== "https:") {
    return errorResponse("Extension download is unavailable.", 503);
  }

  let source: Response;
  try {
    source = await fetch(sourceUrl, { cache: "no-store" });
  } catch {
    return errorResponse("Extension download is temporarily unavailable.", 502);
  }

  if (!source.ok || !source.body) {
    return errorResponse("Extension download is temporarily unavailable.", 502);
  }

  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="${downloadFilename}"`,
    "Content-Type": "application/zip",
    "X-Content-Type-Options": "nosniff",
  });
  const contentLength = source.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength)) {
    headers.set("Content-Length", contentLength);
  }

  return new Response(source.body, { headers });
}
