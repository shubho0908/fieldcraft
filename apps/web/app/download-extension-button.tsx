import { Chrome } from "lucide-react";

export interface DownloadExtensionButtonProps {
  className?: string;
  children?: React.ReactNode;
  href?: string;
}

const DEFAULT_DOWNLOAD_HREF = "/api/download";
const FILENAME = "fieldcraft-extension-latest.zip";

export function DownloadExtensionButton({
  className,
  children = "Download extension",
  href = DEFAULT_DOWNLOAD_HREF,
}: DownloadExtensionButtonProps) {
  const isInternal = href.startsWith("/");

  return (
    <a
      className={className}
      href={href}
      download={isInternal ? FILENAME : undefined}
      {...(!isInternal && { target: "_blank", rel: "noopener noreferrer" })}
    >
      <Chrome size={18} style={{ verticalAlign: "middle" }} />
      {children}
    </a>
  );
}
