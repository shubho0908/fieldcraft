import { readFile, stat } from "node:fs/promises";
import path from "node:path";
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

async function streamRemote(sourceUrl: URL): Promise<Response | null> {
  let source: Response;
  try {
    source = await fetch(sourceUrl, { cache: "no-store" });
  } catch {
    return null;
  }
  if (!source.ok || !source.body) {
    return null;
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

async function serveLocalZip(): Promise<Response> {
  const filePath = path.join(process.cwd(), "public", downloadFilename);
  let buffer: Buffer;
  let size: number;
  try {
    [buffer, { size }] = await Promise.all([readFile(filePath), stat(filePath)]);
  } catch {
    return errorResponse("Extension download is unavailable.", 503);
  }

  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="${downloadFilename}"`,
    "Content-Length": String(size),
    "Content-Type": "application/zip",
    "X-Content-Type-Options": "nosniff",
  });

  return new Response(new Uint8Array(buffer), { headers });
}

export async function GET() {
  const storageUrl = getExtensionDownloadUrl();

  if (storageUrl) {
    let sourceUrl: URL;
    try {
      sourceUrl = new URL(storageUrl);
    } catch {
      return errorResponse("Extension download is unavailable.", 503);
    }

    if (sourceUrl.protocol !== "https:") {
      return errorResponse("Extension download is unavailable.", 503);
    }

    const remote = await streamRemote(sourceUrl);
    if (remote) {
      return remote;
    }
  }

  return serveLocalZip();
}
