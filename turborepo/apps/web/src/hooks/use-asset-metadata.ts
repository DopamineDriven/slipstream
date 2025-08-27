"use client";

import type { ImageSpecs } from "@/utils/img-extractor-client";
import { useCallback, useEffect, useState } from "react";
import { ImgMetadataExtractor } from "@/utils/img-extractor-client";

export interface AttachmentPreview {
  id: string;
  file: File;
  filename: string;
  mime: string;
  size: number;
  status: "pending" | "uploading" | "uploaded" | "error";
  progress?: number;
  thumbnail?: string;
  error?: string;
  width?: number;
  height?: number;
  metadata?: ImageSpecs;
}

export interface AttachmentPreviewProps {
  attachments: AttachmentPreview[];
}

export function useAssetMetadata({ attachments }: AttachmentPreviewProps) {
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [metadata, setMetadata] = useState<Record<string, ImageSpecs>>({});
  const [size, setSize] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!attachments || !Array.isArray(attachments)) {
      return;
    }
    attachments.forEach(attachment => {
      if (attachment.mime.startsWith("image/") && !thumbnails[attachment.id]) {
        const reader = new FileReader();
        reader.onload = e => {
          if (e.target?.result) {
            const dataUrl = e.target.result as string;
            setThumbnails(prev => ({
              ...prev,
              [attachment.id]: dataUrl
            }));

            (async () => {
              try {
                const arrayBuffer = await attachment.file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const extractor = new ImgMetadataExtractor();
                const imageSpecs = extractor.getImageSpecsWorkup(buffer);

                setMetadata(prev => ({
                  ...prev,
                  [attachment.id]: imageSpecs
                }));
                setSize(prev => ({
                  ...prev,
                  [attachment.id]: attachment.size
                }));
              } catch (error) {
                console.warn(
                  `Failed to extract advanced metadata for ${attachment.filename}: `,
                  error
                );
              }
            })();
          }
        };
        reader.readAsDataURL(attachment.file);
      }
    });
  }, [attachments, thumbnails]);

  const formatFileSize = useCallback((bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }, []);

  const getStatusColor = useCallback((status: AttachmentPreview["status"]) => {
    switch (status) {
      case "pending":
        return "text-muted-foreground";
      case "uploading":
        return "text-blue-500";
      case "uploaded":
        return "text-green-500";
      case "error":
        return "text-red-500";
      default:
        return "text-muted-foreground";
    }
  }, []);

  const getStatusText = useCallback(
    (attachment: AttachmentPreview) => {
      const meta = metadata[attachment.id];
      let baseStatus = "";

      switch (attachment.status) {
        case "pending":
          baseStatus = "Ready to upload";
          break;
        case "uploading":
          baseStatus = `Uploading... ${attachment.progress ?? 0}%`;
          break;
        case "uploaded":
          baseStatus = "Uploaded";
          break;
        case "error":
          baseStatus = attachment.error ?? "Upload failed";
          break;
        default:
          baseStatus = "Unknown";
      }

      if (meta?.animated && attachment.status === "pending") {
        baseStatus += ` • Animated (${meta.frames ?? "?"} frames)`;
      }

      return baseStatus;
    },
    [metadata]
  );

  return {
    size,
    attachments,
    thumbnails,
    metadata,
    getStatusText,
    getStatusColor,
    formatFileSize
  };
}
