import "server-only";

const defaultExtensionDownloadUrl =
  "https://github.com/shubho0908/fieldcraft/releases/download/latest/fieldcraft-extension-latest.zip";

export function getExtensionDownloadUrl() {
  return process.env.EXTENSION_DOWNLOAD_URL || defaultExtensionDownloadUrl;
}
