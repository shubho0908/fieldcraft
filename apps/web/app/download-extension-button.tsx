"use client";

import { useCallback, useState } from "react";
import { Chrome, Loader2 } from "lucide-react";

export interface DownloadExtensionButtonProps {
  className?: string;
  children?: React.ReactNode;
  href?: string;
}

const DEFAULT_DOWNLOAD_HREF = "/api/download";
const DEFAULT_FILENAME = "fieldcraft-extension-latest.zip";

function parseFilename(contentDisposition: string | null): string {
  if (!contentDisposition) return DEFAULT_FILENAME;

  const quoted = contentDisposition.match(/filename="([^"]+)"/);
  if (quoted?.[1]) return quoted[1];

  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded?.[1]) return decodeURIComponent(encoded[1]);

  return DEFAULT_FILENAME;
}

export function DownloadExtensionButton({
  className,
  children = "Download extension",
  href = DEFAULT_DOWNLOAD_HREF,
}: DownloadExtensionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const isInternal = href.startsWith("/");

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
        const filename = parseFilename(response.headers.get("Content-Disposition"));

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
    [href, isInternal, isLoading],
  );

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
        {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Chrome size={18} style={{ verticalAlign: "middle" }} />}
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
      <Chrome size={18} style={{ verticalAlign: "middle" }} />
      {children}
    </a>
  );
}
