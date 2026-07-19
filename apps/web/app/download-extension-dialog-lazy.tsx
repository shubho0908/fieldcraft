"use client";

import * as React from "react";
import type { DownloadExtensionDialogProps } from "./download-extension-dialog";

const DownloadExtensionDialog = React.lazy(
  () => import("./download-extension-dialog").then((m) => ({ default: m.DownloadExtensionDialog })),
);

export function LazyDownloadExtensionDialog({
  triggerClassName,
  triggerLabel = "Download extension",
}: DownloadExtensionDialogProps) {
  return (
    <React.Suspense
      fallback={
        <button type="button" className={triggerClassName}>
          {triggerLabel}
        </button>
      }
    >
      <DownloadExtensionDialog triggerClassName={triggerClassName} triggerLabel={triggerLabel} />
    </React.Suspense>
  );
}
