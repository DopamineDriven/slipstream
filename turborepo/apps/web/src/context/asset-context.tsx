"use client";

import type { AttachmentPreview } from "@/hooks/use-asset-metadata";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import { usePathnameContext } from "@/context/pathname-context";
import type { AssetOrigin, EventTypeMap } from "@t3-chat-clone/types";
import { createDraftId } from "@t3-chat-clone/types";

/** Public context shape — intentionally small (mirrors AIChatContext vibe) */
interface AssetContextValue {
  activeConversationId: string | null;
  currentBatchId: string | null;
  uploadProgress: number; // avg percent across all tasks
  isUploading: boolean;
  error: string | null;
  isConnected: boolean;

  getBatchId: () => string;
  registerAssets: (
    attachments: AttachmentPreview[],
    conversationId?: string,
    origin?: Extract<AssetOrigin, "UPLOAD" | "PASTED" | "SCREENSHOT">,
    batchId?: string
  ) => void;

  clearError: () => void;
  resetUploads: () => void;
}

/** Internal, minimal task */
type UploadTask = {
  draftId: string;
  batchId: string;
  attachmentId?: string;

  // object info
  file: File;
  filename: string;
  mime: string;
  size: number;

  // presign/instructions
  bucket?: string;
  key?: string;
  uploadUrl?: string;
  requiredHeaders?: Record<string, string>;

  // status
  progress: number; // 0..100
  status: "REQUESTED" | "UPLOADING" | "READY" | "FAILED";
  versionId?: string;
  etag?: string;
  error?: string;
};

const AssetContext = createContext<AssetContextValue | undefined>(undefined);

export function AssetProvider({
  children,
  userId
}: {
  children: React.ReactNode;
  userId: string;
}) {
  const { conversationId: pathConvId } = usePathnameContext();
  const { client, sendEvent, isConnected } = useChatWebSocketContext();

  // core state (same style as AIChat)
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(pathConvId ?? "new-chat");
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // keep conv id in sync with PathnameContext (passive read, like AIChat)
  useEffect(() => {
    if (pathConvId && pathConvId !== activeConversationId) {
      setActiveConversationId(pathConvId);
    }
  }, [pathConvId, activeConversationId]);

  // task store: super simple
  const tasksByDraftIdRef = useRef<Map<string, UploadTask>>(new Map());

  const clearError = useCallback(() => setError(null), []);
  const resetUploads = useCallback(() => {
    tasksByDraftIdRef.current.clear();
    setUploadProgress(0);
    setIsUploading(false);
    setError(null);
  }, []);

  // recompute overall progress + flags
  const recompute = useCallback(() => {
    const tasks = Array.from(tasksByDraftIdRef.current.values());
    if (tasks.length === 0) {
      setUploadProgress(0);
      setIsUploading(false);
      return;
    }
    const avg = Math.round(
      tasks.reduce((s, t) => s + (t.progress ?? 0), 0) / tasks.length
    );
    setUploadProgress(avg);
    setIsUploading(
      tasks.some(t => t.status === "REQUESTED" || t.status === "UPLOADING")
    );
  }, []);

  const getBatchId = useCallback((): string => {
    if (currentBatchId) return currentBatchId;
    const b = `batch_${Date.now().toString(36)}`;
    setCurrentBatchId(b);
    return b;
  }, [currentBatchId]);

  /** XHR uploader (progress + header parity) */
  const uploadToS3 = useCallback(
    async (opts: {
      url: string;
      file: File;
      headers?: Record<string, string>;
      onProgress?: (pct: number) => void;
    }): Promise<{ versionId: string; etag?: string }> => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) {
            opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const v = xhr.getResponseHeader("x-amz-version-id");
            if (!v) return reject(new Error("Missing x-amz-version-id"));
            const etag = xhr.getResponseHeader("ETag")?.replace(/"/g, "");
            resolve({ versionId: v, etag });
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.open("PUT", opts.url);
        if (opts.headers)
          for (const [k, v] of Object.entries(opts.headers))
            xhr.setRequestHeader(k, v);
        xhr.send(opts.file);
      });
    },
    []
  );

  /** Public action: register assets (C→S step 1) */
  const registerAssets = useCallback(
    (
      attachments: AttachmentPreview[],
      conversationId?: string,
      origin: Extract<
        AssetOrigin,
        "UPLOAD" | "PASTED" | "SCREENSHOT"
      > = "UPLOAD",
      batchId?: string
    ) => {
      if (!userId) {
        console.warn("[AssetContext] Cannot register without userId");
        return;
      }
      const convId = conversationId ?? activeConversationId ?? "new-chat";
      const bId = batchId ?? getBatchId();

      attachments.forEach((a, idx) => {
        const draftId = createDraftId(userId, convId, bId, idx);

        // record task
        tasksByDraftIdRef.current.set(draftId, {
          draftId,
          batchId: bId,
          file: a.file,
          filename: a.filename,
          mime: a.mime,
          size: a.size,
          progress: 0,
          status: "REQUESTED"
        });

        // fire initial event (C→S) with your canonical names
        if (origin === "PASTED" || origin === "SCREENSHOT") {
          sendEvent("asset_paste", {
            type: "asset_paste",
            conversationId: convId,
            draftId,
            batchId: bId,
            filename: a.filename,
            mime: a.mime,
            size: a.size,
            width: a.width,
            height: a.height,
            metadata: a.metadata
          } satisfies EventTypeMap["asset_paste"]);
        } else {
          sendEvent("asset_attached", {
            type: "asset_attached",
            conversationId: convId,
            draftId,
            batchId: bId,
            filename: a.filename,
            mime: a.mime,
            size: a.size,
            width: a.width,
            height: a.height,
            metadata: a.metadata
          } satisfies EventTypeMap["asset_attached"]);
        }
      });

      setIsUploading(true);
      recompute();
    },
    [userId, activeConversationId, getBatchId, sendEvent, recompute]
  );

  /** WS subscriptions — single effect, like AIChat */
  useEffect(() => {
    // S→C: presigned upload instructions
    const handleUploadInstructions = (
      evt: EventTypeMap["asset_upload_instructions"]
    ) => {
      const task = tasksByDraftIdRef.current.get(evt.draftId ?? "");
      if (!task) {
        console.warn("[AssetContext] Missing task for draftId:", evt.draftId);
        return;
      }

      task.attachmentId = evt.attachmentId;
      task.uploadUrl = evt.uploadUrl;
      task.requiredHeaders = evt.requiredHeaders;
      task.bucket = evt.bucket;
      task.key = evt.key;
      task.status = "UPLOADING";
      task.progress = 0;
      recompute();

      // optional transitional event (C→S) to satisfy your vocabulary
      sendEvent("asset_upload_prepare", {
        type: "asset_upload_prepare",
        conversationId: evt.conversationId,
        filename: task.filename,
        mime: task.mime,
        size: task.size,
        origin: "UPLOAD",
        draftId: task.draftId,
        batchId: task.batchId
      } as EventTypeMap["asset_upload_prepare"]);

      // start the PUT (C→S3)
      const headers = {
        ...(evt.requiredHeaders ?? {}),
        "Content-Type": task.mime || evt.mimeType || "application/octet-stream"
      };

      uploadToS3({
        url: evt.uploadUrl,
        file: task.file,
        headers,
        onProgress: pct => {
          task.progress = pct;
          // (optional) echo to server so other clients see progress
          sendEvent("asset_upload_progress", {
            type: "asset_upload_progress",
            userId,
            draftId: task.draftId,
            batchId: task.batchId,
            conversationId: evt.conversationId,
            attachmentId: task.attachmentId,
            progress: pct,
            bytesUploaded: Math.round((pct / 100) * task.size),
            totalBytes: task.size
          } as EventTypeMap["asset_upload_progress"]);
          recompute();
        }
      })
        .then(({ versionId, etag }) => {
          task.versionId = versionId;
          task.etag = etag;

          // C→S: completion (server will finalize + emit asset_ready)
          sendEvent("asset_upload_complete", {
            type: "asset_upload_complete",
            conversationId: evt.conversationId,
            userId,
            bucket: evt.bucket,
            key: evt.key,
            attachmentId: task.attachmentId,
            draftId: task.draftId,
            batchId: task.batchId,
            versionId,
            publicUrl: `https://${evt.bucket}.s3.amazonaws.com/${encodeURIComponent(evt.key)}?versionId=${encodeURIComponent(versionId)}`,
            etag,
            success: true,
            duration: 0,
            bytesUploaded: task.size
          } as EventTypeMap["asset_upload_complete"]);
        })
        .catch(err => {
          task.status = "FAILED";
          task.error = String(err);
          setError(String(err));
          recompute();

          sendEvent("asset_upload_complete_error", {
            type: "asset_upload_complete_error",
            conversationId: evt.conversationId,
            bucket: evt.bucket,
            key: evt.key,
            userId,
            attachmentId: task.attachmentId,
            draftId: task.draftId,
            batchId: task.batchId,
            error: String(err),
            success: false
          } as EventTypeMap["asset_upload_complete_error"]);
        });
    };

    // (optional cross-client) progress mirrored from server
    const handleUploadProgress = (
      evt: EventTypeMap["asset_upload_progress"]
    ) => {
      const task = tasksByDraftIdRef.current.get(evt.draftId ?? "");
      if (!task) return;
      if (
        typeof evt.progress === "number" &&
        evt.progress > (task.progress ?? 0)
      ) {
        task.progress = evt.progress;
        recompute();
      }
    };

    // S→C: server finalized (authoritative)
    const handleAssetReady = (evt: EventTypeMap["asset_ready"]) => {
      const task = tasksByDraftIdRef.current.get(evt.draftId ?? "");
      if (task) {
        task.status = "READY";
        task.progress = 100;
        task.versionId = evt.versionId ?? task.versionId;
        task.etag = evt.etag ?? task.etag;
      }
      recompute();
    };

    const handleUploadError = (
      evt: EventTypeMap["asset_upload_complete_error"]
    ) => {
      const task = tasksByDraftIdRef.current.get(evt.draftId ?? "");
      if (task) {
        task.status = "FAILED";
        task.error = evt.error ?? "unknown";
      }
      setError(evt.error ?? "Upload failed");
      recompute();
    };

    client.on("asset_upload_instructions", handleUploadInstructions);
    client.on("asset_upload_progress", handleUploadProgress);
    client.on("asset_ready", handleAssetReady);
    client.on("asset_upload_complete_error", handleUploadError);

    return () => {
      client.off("asset_upload_instructions");
      client.off("asset_upload_progress");
      client.off("asset_ready");
      client.off("asset_upload_complete_error");
    };
  }, [client, sendEvent, uploadToS3, userId, recompute]);

  const value = useMemo<AssetContextValue>(
    () => ({
      activeConversationId,
      currentBatchId,
      uploadProgress,
      isUploading,
      error,
      isConnected,
      getBatchId,
      registerAssets,
      clearError,
      resetUploads
    }),
    [
      activeConversationId,
      currentBatchId,
      uploadProgress,
      isUploading,
      error,
      isConnected,
      getBatchId,
      registerAssets,
      clearError,
      resetUploads
    ]
  );

  return (
    <AssetContext.Provider value={value}>{children}</AssetContext.Provider>
  );
}

export function useAssetUpload() {
  const ctx = useContext(AssetContext);
  if (!ctx) throw new Error("useAssetUpload must be used within AssetProvider");
  return ctx;
}
