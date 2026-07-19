"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Check, Download, FolderOpen, Puzzle, X } from "lucide-react";
import { useState } from "react";

const DOWNLOAD_ENDPOINT = "/api/extension/download";

const installationSteps = [
  {
    icon: Download,
    title: "Save the extension ZIP",
    body: "Your download starts now. Keep the file somewhere easy to find, such as Downloads.",
  },
  {
    icon: FolderOpen,
    title: "Unzip the file",
    body: "Open the ZIP so it becomes a normal folder. Chrome needs the folder, not the compressed file.",
  },
  {
    icon: Puzzle,
    title: "Load it in Chrome",
    body: "Open chrome://extensions, enable Developer mode, choose Load unpacked, then select the unzipped folder containing manifest.json.",
  },
] as const;

export type DownloadExtensionDialogProps = {
  triggerClassName: string;
  triggerLabel?: string;
};

export function DownloadExtensionDialog({
  triggerClassName,
  triggerLabel = "Download extension",
}: DownloadExtensionDialogProps) {
  const [open, setOpen] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);

  const startDownload = () => {
    const link = document.createElement("a");
    link.href = DOWNLOAD_ENDPOINT;
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

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button type="button" className={triggerClassName} onClick={startDownload}>
          {triggerLabel}
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="download-dialog-overlay" />
        <Dialog.Content className="download-dialog-content">
          <div className="download-dialog-header">
            <div className="download-dialog-heading">
              <span className="download-dialog-icon" aria-hidden="true"><Download size={20} /></span>
              <div>
                <p>Developer install</p>
                <Dialog.Title>Install Fieldcraft in Chrome</Dialog.Title>
              </div>
            </div>
            <Dialog.Close className="download-dialog-close" aria-label="Close installation guide">
              <X size={18} />
            </Dialog.Close>
          </div>

          <Dialog.Description className="download-dialog-description">
            Fieldcraft is downloaded as a ZIP so you stay in control of the installation. It takes less than a minute.
          </Dialog.Description>

          <ol className="download-dialog-steps">
            {installationSteps.map(({ icon: Icon, title, body }, index) => (
              <li key={title}>
                <span className="download-dialog-step-number">0{index + 1}</span>
                <Icon className="download-dialog-step-icon" size={18} aria-hidden="true" />
                <div>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="download-dialog-footer">
            <p aria-live="polite">
              {downloadStarted ? <><Check size={15} /> Download started - follow the steps above.</> : "Need the ZIP again?"}
            </p>
            <button type="button" className="download-dialog-retry" onClick={startDownload}>
              <Download size={16} /> Download again
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
