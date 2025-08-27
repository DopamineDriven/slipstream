"use client";

import { useCallback, useRef, useState } from "react";
import type { AttachmentPreview } from "./use-asset-metadata";
import { useAssetMetadata } from "./use-asset-metadata";

export interface UseAssetsOptions {
  max?: number;
  allowedTypes?: string[];
}

export function useAssets(options: UseAssetsOptions = {}) {
  const { max = 10, allowedTypes = ["image/*"] } = options;
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);
  const nextId = useRef(0);

  // Use existing metadata hook for all the display logic
  const assetMetadata = useAssetMetadata({ attachments });

  const addFile = useCallback(
    async (file: File, filename?: string) => {
      // Check if file type is allowed
      const isAllowed = allowedTypes.some(pattern => {
        if (pattern.endsWith("/*")) {
          return file.type.startsWith(pattern.slice(0, -2));
        }
        return file.type === pattern;
      });

      if (!isAllowed) {
        console.warn(`File type ${file.type} not allowed`);
        return null;
      }

      const id = `asset-${Date.now()}-${nextId.current++}`;

      let dimensions: { width?: number; height?: number } = {};

      // Extract dimensions for images
      if (file.type.startsWith("image/")) {
        try {
          const url = URL.createObjectURL(file);
          const img = new Image();

          dimensions = await new Promise((resolve) => {
            img.onload = () => {
              URL.revokeObjectURL(url);
              resolve({
                width: img.naturalWidth,
                height: img.naturalHeight
              });
            };
            img.onerror = () => {
              URL.revokeObjectURL(url);
              resolve({});
            };
            img.src = url;
          });
        } catch (error) {
          console.warn("Failed to get image dimensions:", error);
        }
      }

      const newAttachment: AttachmentPreview = {
        id,
        file,
        filename: filename ?? file.name,
        mime: file.type,
        size: file.size,
        status: "pending",
        ...dimensions
      };

      setAttachments(prev => {
        const updated = [...prev, newAttachment];
        return updated.slice(-max); // Keep only last 'max' items
      });

      return newAttachment;
    },
    [allowedTypes, max]
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const files: File[] = [];

      for (const item of items) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      if (files.length > 0) {
        e.preventDefault();

        for (const file of files) {
          // Generate a better filename for pasted files
          const extension = file.type.split("/")[1] ?? "png";
          const filename = file.name || `pasted-${Date.now()}.${extension}`;

          await addFile(
            new File([file], filename, { type: file.type })
          );
        }
      }
    },
    [addFile]
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const updateAttachmentStatus = useCallback(
    (id: string, status: AttachmentPreview["status"], progress?: number, error?: string) => {
      setAttachments(prev =>
        prev.map(a =>
          a.id === id
            ? { ...a, status, progress, error }
            : a
        )
      );
    },
    []
  );

  return {
    ...assetMetadata, // Include all metadata hook outputs
    attachments,
    // Asset management
    addFile,
    handlePaste,
    remove: removeAttachment,
    clear: clearAttachments,
    updateStatus: updateAttachmentStatus,
  };
}
