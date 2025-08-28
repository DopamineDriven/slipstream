// asset-context.tsx - Focused purely on WebSocket/Upload orchestration
"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import { nanoid } from "nanoid";
import { createDraftId } from "@t3-chat-clone/types";
import type { AssetOrigin, EventTypeMap, AssetUploadPrepare, AssetAttachedToMessage, AssetPasteEvent} from "@t3-chat-clone/types";
import type { AttachmentPreview } from "@/hooks/use-asset-metadata";

interface AssetUploadState {
  draftId: string;
  batchId: string;
  attachmentId?: string;
  uploadUrl?: string;
  uploadHeaders?: Record<string, string>;
  bucket?: string;
  key?: string;
  versionId?: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'ready' | 'error';
}

interface AssetContextValue {
  // Batch management
  currentBatchId: string | null;
  createBatch: (conversationId: string) => string;

  // Register assets for upload (called by use-assets hook)
  prepareAssets: (
    attachments: AttachmentPreview[],
    conversationId: string,
    batchId: string,
    origin?: 'UPLOAD' | 'PASTED' | 'SCREENSHOT'
  ) => void;

  // Upload state tracking
  uploadStates: Map<string, AssetUploadState>;

  // Get current batch ID for message sending
  getCurrentBatchId: () => string | null;
  clearBatch: () => void;
}

const AssetContext = createContext<AssetContextValue | null>(null);

export function AssetProvider({
  children,
  userId
}: {
  children: React.ReactNode;
  userId: string;
}) {
  const { sendEvent, on, isConnected } = useChatWebSocketContext();

  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [uploadStates] = useState(() => new Map<string, AssetUploadState>());

  // Track upload states by draftId
  const uploadsByDraftId = useRef<Map<string, AssetUploadState>>(new Map());

  const createBatch = useCallback((conversationId: string) => {
    const batchId = `batch_${nanoid(12)}`;
    setCurrentBatchId(batchId);
    return batchId;
  }, []);

  // Called by use-assets when files are added
  const prepareAssets = useCallback(
    (
      attachments: AttachmentPreview[],
      conversationId: string,
      batchId: string,
      origin="UPLOAD" as AssetOrigin
    ) => {
      if (!isConnected) return;

      attachments.forEach((attachment, index) => {
        const draftId = createDraftId(
          userId,
          conversationId,
          batchId,
          index
        );

        const uploadState: AssetUploadState = {
          draftId,
          batchId,
          status: 'pending'
        };

        // Track state
        uploadStates.set(attachment.id, uploadState);
        uploadsByDraftId.current.set(draftId, uploadState);

        // Request upload instructions
        const eventType = origin === 'PASTED' ? 'asset_paste' : 'asset_attached';

        if (eventType==="asset_paste"){
        sendEvent(eventType, {
          type: eventType,
          conversationId,
          batchId,
          draftId,
          filename: attachment.filename,
          mime: attachment.mime,
          size: attachment.size,
          width: attachment.width,
          height: attachment.height,
          metadata: attachment.metadata
        } satisfies AssetPasteEvent);} else if (eventType==="asset_attached") {
           sendEvent(eventType, {
          type: eventType,
          conversationId,
          batchId,
          draftId,
          filename: attachment.filename,
          mime: attachment.mime,
          size: attachment.size,
          width: attachment.width,
          metadata: attachment.metadata,
          height: attachment.height
        } satisfies AssetAttachedToMessage);
        }
      });
    },
    [isConnected, userId, sendEvent, uploadStates]
  );

  // Handle WebSocket responses
  useEffect(() => {
    const unsubInstructions = on('asset_upload_instructions', async (evt) => {
      if (evt.type ==="asset_upload_instructions") {
      const uploadState = uploadsByDraftId.current.get(evt?.draftId ?? '');
      if (!uploadState) return;

      // Update state with upload details
      uploadState.attachmentId = evt.attachmentId;
      uploadState.uploadUrl = evt.uploadUrl;
      uploadState.uploadHeaders = evt.requiredHeaders as  {
    readonly "Content-Type": string;
    };
      uploadState.bucket = evt.bucket;
      uploadState.key = evt.key;
      uploadState.status = 'uploading';
      // Trigger upload (let the UI component handle the actual upload via XHR)
      // The UI can listen to uploadStates changes
  }});

    const unsubReady = on('asset_ready', (evt) => {
      const uploadState = uploadsByDraftId.current.get(evt.draftId || '');
      if (!uploadState) return;

      uploadState.status = 'ready';
      uploadState.versionId = evt.versionId;
    });

    return () => {
      unsubInstructions();
      unsubReady();
    };
  }, [on]);

  const getCurrentBatchId = useCallback(() => currentBatchId, [currentBatchId]);

  const clearBatch = useCallback(() => {
    setCurrentBatchId(null);
    uploadStates.clear();
    uploadsByDraftId.current.clear();
  }, [uploadStates]);

  return (
    <AssetContext.Provider
      value={{
        currentBatchId,
        createBatch,
        prepareAssets,
        uploadStates,
        getCurrentBatchId,
        clearBatch
      }}>
      {children}
    </AssetContext.Provider>
  );
}

export function useAssetUpload() {
  const context = useContext(AssetContext);
  if (!context) {
    throw new Error('useAssetUpload must be used within AssetProvider');
  }
  return context;
}
