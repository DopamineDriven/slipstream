"use client";

import type { AttachmentPreview } from "@/hooks/use-asset-metadata";
import type { ImageSpecs } from "@slipstream/types";
import { default as NextImage } from "next/image";
import { useAssetMetadata } from "@/hooks/use-asset-metadata";
import { cn } from "@/lib/utils";
import {
  Button,
  Card,
  CardContent,
  FileText,
  ImageIcon,
  X
} from "@slipstream/ui";

interface AttachmentPreviewProps {
  attachments: AttachmentPreview[];
  onRemove: (id: string) => void;
  className?: string;
  // Optional: if provided, component won't run useAssetMetadata
  thumbnails?: Record<string, string>;
  metadata?: Record<string, ImageSpecs>;
  getStatusText?: (attachment: AttachmentPreview) => string;
  getStatusColor?: (status: AttachmentPreview["status"]) => string;
  formatFileSize?: (bytes: number) => string;
}

export function AttachmentPreviewComponent({
  attachments,
  onRemove,
  className,
  thumbnails: externalThumbnails,
  metadata: externalMetadata,
  getStatusText: externalGetStatusText,
  getStatusColor: externalGetStatusColor,
  formatFileSize: externalFormatFileSize
}: AttachmentPreviewProps) {
  // Always call hook (React rules) but only use if external props not provided
  const internalData = useAssetMetadata({ attachments });

  // Use external props if provided, otherwise fall back to hook data
  const thumbnails = externalThumbnails ?? internalData.thumbnails;
  const metadata = externalMetadata ?? internalData.metadata;
  const getStatusText = externalGetStatusText ?? internalData.getStatusText;
  const getStatusColor = externalGetStatusColor ?? internalData.getStatusColor;
  const formatFileSize = externalFormatFileSize ?? internalData.formatFileSize;

  if (attachments.length === 0) return null;

  return (
    <div
      className={cn(
        "scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent max-h-32 space-y-2 overflow-y-auto",
        className
      )}>
      {attachments.map(attachment => {
        const meta = metadata[attachment.id];
        const thumbnail = thumbnails[attachment.id];
        return (
          <Card key={attachment.id} className="border-border/50 bg-muted/30">
            <CardContent className="flex items-center gap-3 p-1.5">
              <div className="flex-shrink-0">
                {attachment.mime.startsWith("image/") && thumbnail ? (
                  <div className="relative">
                    <NextImage
                      src={thumbnail || "/dd-logo.svg"}
                      alt={attachment.filename}
                      width={attachment.width}
                      height={attachment.height}
                      className="h-10 w-10 rounded-md object-cover md:h-12 md:w-12"
                    />
                    {meta?.animated && (
                      <div className="absolute -top-1 -right-1 rounded-full bg-blue-500 px-1 text-xs text-white">
                        {meta.format.toUpperCase()}
                      </div>
                    )}
                    {attachment.status === "uploading" &&
                      attachment.progress !== undefined && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/50">
                          <div className="text-xs font-medium text-white">
                            {attachment.progress}%
                          </div>
                        </div>
                      )}
                  </div>
                ) : attachment.mime.startsWith("image/") ? (
                  <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-md md:h-12 md:w-12">
                    <ImageIcon className="text-muted-foreground h-5 w-5 md:h-6 md:w-6" />
                  </div>
                ) : (
                  <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-md md:h-12 md:w-12">
                    <FileText className="text-muted-foreground h-5 w-5 md:h-6 md:w-6" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-foreground truncate text-sm font-medium">
                  {attachment.filename}
                </div>
                <div className="hidden items-center gap-2 text-xs md:flex">
                  <span className={getStatusColor(attachment.status)}>
                    {getStatusText(attachment)}
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">
                    {formatFileSize(attachment.size)}
                  </span>
                  {attachment.mime.startsWith("image/") && meta && (
                    <>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-muted-foreground">
                        {meta.width} × {meta.height}
                      </span>
                      {meta.hasAlpha && (
                        <>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-muted-foreground">Alpha</span>
                        </>
                      )}
                      {meta.format && meta.format !== "unknown" && (
                        <>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-muted-foreground">
                            {meta.format.toUpperCase()}
                          </span>
                        </>
                      )}
                      {meta.colorSpace && meta.colorSpace !== "unknown" && (
                        <>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-muted-foreground">
                            {meta.colorSpace.toUpperCase()}
                          </span>
                        </>
                      )}
                      {meta.iccProfile && (
                        <>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-muted-foreground">ICC</span>
                        </>
                      )}
                    </>
                  )}
                </div>
                <div className="text-xs md:hidden">
                  <span className={getStatusColor(attachment.status)}>
                    {getStatusText(attachment)}
                  </span>
                </div>
                {attachment.status === "uploading" &&
                  attachment.progress !== undefined && (
                    <div className="bg-muted mt-1 h-1 w-full overflow-hidden rounded-full">
                      <div
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${attachment.progress}%` }}
                      />
                    </div>
                  )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemove(attachment.id)}
                className="text-muted-foreground hover:text-foreground h-6 w-6 md:h-8 md:w-8"
                disabled={attachment.status === "uploading"}>
                <X className="h-3 w-3 md:h-4 md:w-4" />
                <span className="sr-only">Remove attachment</span>
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
