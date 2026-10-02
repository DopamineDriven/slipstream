"use client";

import type { ComponentPropsWithRef } from "react";
import { downloadAsset, fileDownloadName } from "@/lib/helpers";
import { BaseButton, Download } from "@slipstream/ui";

export type FileRef = {
  src: string;
  format: string;
  mime: string | undefined;
  downloadName: string;
};

type DownloadButtonProps = {
  file: FileRef;
  label?: string;
  variant?: ComponentPropsWithRef<typeof BaseButton>["variant"];
};

export function DownloadButton({
  file,
  label = "Download",
  variant = "default"
}: DownloadButtonProps) {
  const name = fileDownloadName(file.src);
  return (
    <BaseButton
      variant={variant}
      size="sm"
      aria-label={`${label} ${name}`}
      onClick={() => void downloadAsset(file.src, name)}>
      <Download className="size-3.5" aria-hidden="true" />
      {label}
    </BaseButton>
  );
}
