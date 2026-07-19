"use client";

import * as React from "react";

const DownloadExtensionDialog = React.lazy(
  () => import("./download-extension-dialog").then((m) => ({ default: m.DownloadExtensionDialog })),
);

export interface DownloadExtensionDialogProps {
  triggerClassName: string;
  triggerLabel?: string;
}

export function LazyDownloadExtensionDialog({
  triggerClassName,
  triggerLabel = "Download extension",
}: DownloadExtensionDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [downloadStarted, setDownloadStarted] = React.useState(false);

  const startDownload = () => {
    const link = document.createElement("a");
    link.href = "/api/extension/download";
    link.download = "fieldcraft-extension.zip";
    document.body.append(link);
    link.click();
    link.remove();
    setDownloadStarted(true);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setDownloadStarted(false);
  };

  const handleClick = () => {
    startDownload();
    setOpen(true);
  };

  return (
    <>
      <button type="button" className={triggerClassName} onClick={handleClick}>
        {triggerLabel}
      </button>
      {open && (
        <React.Suspense fallback={null}>
          <DownloadExtensionDialog
            open={open}
            onOpenChange={handleOpenChange}
            downloadStarted={downloadStarted}
            startDownload={startDownload}
          />
        </React.Suspense>
      )}
    </>
  );
}
