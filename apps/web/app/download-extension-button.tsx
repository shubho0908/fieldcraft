import { Chrome } from "lucide-react";

export interface DownloadExtensionButtonProps {
  className?: string;
  children?: React.ReactNode;
}

const RELEASES_URL = "https://github.com/shubho0908/fieldcraft/releases/tag/latest";

export function DownloadExtensionButton({
  className,
  children = "Download extension",
}: DownloadExtensionButtonProps) {
  return (
    <a
      className={className}
      href={RELEASES_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      <Chrome size={18} style={{ verticalAlign: "middle" }} />
      {children}
    </a>
  );
}
