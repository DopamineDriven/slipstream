"use client";

import { useCallback, useEffect, useState } from "react";
import type { DocSpecs, ImageSpecs } from "@slipstream/metadata";
import {
  DocMetadataExtractor,
  ImgMetadataExtractor
} from "@slipstream/metadata";

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
  const [metadata, setMetadata] = useState<
    Record<string, ImageSpecs | DocSpecs>
  >({});
  const [size, setSize] = useState<Record<string, number>>({});

  // Helper: produce document specs using the client-side extractor
  const getDocumentSpecsWorkup = useCallback(
    async (file: File): Promise<DocSpecs | null> => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const extractor = new DocMetadataExtractor();
        const specs = extractor.getDocumentSpecsWorkup(
          buffer,
          file.type || "application/octet-stream",
          file.name
        );
        return specs;
      } catch (err) {
        console.warn("Failed to extract document metadata:", err);
        return null;
      }
    },
    []
  );

  useEffect(() => {
    if (!attachments || !Array.isArray(attachments)) {
      return;
    }
    attachments.forEach(attachment => {
      // Images → thumbnail + rich image metadata
      if (attachment.mime.startsWith("image/")) {
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
                  [attachment.id]: { ...imageSpecs }
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
        return;
      }

      // Documents (PDF, text/code, Office OpenXML, etc.) → rich doc metadata
      if (
        attachment.mime === "application/pdf" ||
        attachment.mime === "application/rtf" ||
        attachment.mime.startsWith("text/") ||
        attachment.mime ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        attachment.mime ===
          "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
        attachment.mime ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        attachment.mime === "application/json" ||
        attachment.mime === "application/javascript"
      ) {
        (async () => {
          const specs = await getDocumentSpecsWorkup(attachment.file);
          if (specs) {
            setMetadata(prev => ({
              ...prev,
              [attachment.id]: specs
            }));
            setSize(prev => ({
              ...prev,
              [attachment.id]: attachment.size
            }));
          }
        })();
      }
    });
  }, [attachments, thumbnails, getDocumentSpecsWorkup]);

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

      // Enrich preview line with image/document quick facts on pending
      if (attachment.status === "pending" && meta) {
        if (meta.type === "IMAGE") {
          const img = meta;
          if (img.animated) {
            baseStatus += ` • Animated (${img.frames ?? "?"} frames)`;
          }
        } else {
          const doc = meta;
          const parts: string[] = [];
          if (doc.format) parts.push(doc.format.toUpperCase());
          if (typeof doc.pageCount === "number")
            parts.push(
              `${doc.pageCount} page${doc.pageCount === 1 ? "" : "s"}`
            );
          if (typeof doc.wordCount === "number")
            parts.push(`${doc.wordCount} words`);
          if (typeof doc.lineCount === "number")
            parts.push(`${doc.lineCount} lines`);
          if (doc.encoding) parts.push(doc.encoding.toUpperCase());
          if (parts.length) baseStatus += ` • ${parts.join(" • ")}`;
        }
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
    getDocumentSpecsWorkup,
    getStatusText,
    getStatusColor,
    formatFileSize
  };
}
