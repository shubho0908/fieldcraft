import "server-only";

export function getExtensionDownloadUrl(): string | undefined {
  return process.env.EXTENSION_DOWNLOAD_URL;
}
