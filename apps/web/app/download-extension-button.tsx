"use client";

import { useCallback, useEffect, useState } from "react";
import { Chrome, Loader2 } from "lucide-react";
import { getBrowserTarget, type BrowserTarget } from "./lib/detect-browser";
import { SafariIcon } from "./icons/safari-icon";

export interface DownloadExtensionButtonProps {
  className?: string;
  children?: React.ReactNode;
  href?: string;
}

function getAssetName(browser: BrowserTarget): string {
  return browser === "safari"
    ? "fieldcraft-extension-safari-latest.zip"
    : "fieldcraft-extension-latest.zip";
}

function getDownloadHref(browser: BrowserTarget): string {
  return `/api/download?asset=${encodeURIComponent(getAssetName(browser))}`;
}

function parseFilename(
  contentDisposition: string | null,
  fallback: string,
): string {
  if (!contentDisposition) return fallback;

  const quoted = contentDisposition.match(/filename="([^"]+)"/);
  if (quoted?.[1]) return quoted[1];

  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded?.[1]) return decodeURIComponent(encoded[1]);

  return fallback;
}

export function DownloadExtensionButton({
  className,
  children = "Download extension",
  href: hrefProp,
}: DownloadExtensionButtonProps) {
  const [browser, setBrowser] = useState<BrowserTarget>("chrome");

  useEffect(() => {
    setBrowser(getBrowserTarget());
  }, []);

  const href = hrefProp ?? getDownloadHref(browser);
  const defaultFilename = getAssetName(browser);
  const isInternal = href.startsWith("/");
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!isInternal || isLoading) return;

      event.preventDefault();
      setIsLoading(true);

      try {
        const response = await fetch(href, {
          method: "GET",
          credentials: "same-origin",
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "Download failed");
          throw new Error(`${response.status}: ${errorBody}`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const filename = parseFilename(response.headers.get("Content-Disposition"), defaultFilename);

        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Extension download failed:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [href, isInternal, isLoading, defaultFilename],
  );

  const Icon = browser === "safari" ? SafariIcon : Chrome;

  if (isInternal) {
    return (
      <button
        type="button"
        className={className}
        onClick={handleClick}
        disabled={isLoading}
        aria-disabled={isLoading}
        aria-busy={isLoading}
      >
        {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} style={{ verticalAlign: "middle" }} />}
        {children}
      </button>
    );
  }

  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      <Icon size={18} style={{ verticalAlign: "middle" }} />
      {children}
    </a>
  );
}
