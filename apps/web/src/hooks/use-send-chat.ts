"use client";

/**
 * The send path — extracted from `ai-chat-context.tsx`'s `sendChat`. Assembles the `AIChatRequest` + the optimistic
 * user message, drives `store.beginSend`, emits via the WS client, and rotates the asset batch. It sits DOWNSTREAM
 * of `chat-input`'s `asset_ready` gate, so attachments are already real (real CDN URLs) — this hook never re-checks
 * readiness, it just fires. Per-conversation: it skips if the store is already streaming, plus a 500ms duplicate-
 * send guard keyed by prompt. Reads (never mutates) the outer contexts (model / api-keys / asset / cookies / WS).
 */
import type { AttachmentPreview } from "@/hooks/use-asset-metadata";
import type { ChatStore } from "@/state/chat/store";
import { useCallback, useMemo, useRef } from "react";
import { useApiKeys } from "@/context/api-keys-context";
import { useAssetUpload } from "@/context/asset-context";
import { useChatWebSocketContext } from "@/context/chat-ws-context";
import { useCookiesCtx } from "@/context/cookie-context";
import { useModelSelection } from "@/context/model-selection-context";
import { buildOptimisticAttachment } from "@/lib/attachment-mapper";
import { getModel } from "@/lib/models";
import { createUserMessage } from "@/lib/ui-message-helpers";
import type {
  AIChatRequest,
  AIChatRequestImgGenFields,
  AllModelsUnion,
  ClientContextWorkupProps,
  UserMetadata
} from "@slipstream/types";
import { toPrismaFormat } from "@slipstream/types";

/** The payload `ChatInput` emits via `onUserMessage` — assets are already real (gated upstream on `asset_ready`). */
export interface SendChatPayload {
  readonly content: string;
  readonly attachments?: AttachmentPreview[];
  readonly batchId?: string;
  readonly imgGenEnabled?: boolean;
  readonly imgGenFields?: AIChatRequestImgGenFields;
}

/** Provider-key fallback when the WS provider-context hasn't arrived yet (ported from ai-chat-context.tsx). */
const fallbackApiKeys = {
  isDefault: {
    anthropic: false,
    cohere: false,
    gemini: false,
    grok: false,
    mistral: false,
    meta: false,
    openai: false,
    vercel: false,
    deepseek: false,
    moonshotai: false,
    zai: false,
    alibaba: false,
    minimax: false
  },
  isSet: {
    anthropic: false,
    cohere: false,
    gemini: false,
    grok: false,
    mistral: false,
    meta: false,
    openai: false,
    vercel: false,
    deepseek: false,
    moonshotai: false,
    zai: false,
    alibaba: false,
    minimax: false
  }
} satisfies ClientContextWorkupProps;

export function useSendChat(store: ChatStore, userId?: string) {
  const { selectedModel } = useModelSelection();
  const { providerContext } = useApiKeys();
  const { startNewBatch, currentBatchId, getUploadsByBatchId, getByPreviewId } =
    useAssetUpload();
  const { getAll } = useCookiesCtx();
  const { sendEvent } = useChatWebSocketContext();

  const { city, country, latlng, postalCode, region, tz, locale, ip, ua } =
    getAll();
  const metadata = useMemo(() => {
    const useragent = ua ? decodeURIComponent(ua) : undefined;
    const timezone = tz ? decodeURIComponent(tz) : undefined;
    const ipAddress = ip ? decodeURIComponent(ip) : undefined;
    const [lat, lng] = latlng
      ? decodeURIComponent(latlng)
          .split(",")
          .map(p => Number.parseFloat(p))
      : [undefined, undefined];
    return {
      city,
      country,
      postalCode,
      region,
      tz: timezone,
      ip: ipAddress,
      ua: useragent,
      lat,
      lng,
      locale
    } satisfies UserMetadata;
  }, [city, ip, ua, country, latlng, postalCode, region, tz, locale]);

  // Dedupe identical sends within 500ms (a stray double-submit), cleared after 2s.
  const recentSendsRef = useRef<Map<string, number>>(new Map());

  return useCallback(
    (payload: SendChatPayload) => {
      if (!userId) return;
      const content = payload.content.trim();
      if (!content) return;

      // Already streaming this conversation — ignore the double-fire.
      if (store.getStatusSnapshot().isStreaming) return;

      const dedupeKey = `${userId}-${content}`;
      const now = Date.now();
      const lastSentAt = recentSendsRef.current.get(dedupeKey);
      if (lastSentAt && now - lastSentAt < 500) return;
      recentSendsRef.current.set(dedupeKey, now);
      setTimeout(() => recentSendsRef.current.delete(dedupeKey), 2000);

      const conversationId = store.getStatusSnapshot().conversationId;

      // Optimistic attachments: already real (the gate guarantees real cdnUrls); we just shape them for the bubble.
      const optimisticAttachments = (payload.attachments ?? []).map(preview => {
        const info = getByPreviewId(preview.id);
        return buildOptimisticAttachment(preview, conversationId, {
          draftId: info?.draftId ?? undefined,
          cdnUrl: info?.cdnUrl ?? undefined,
          publicUrl: info?.publicUrl ?? undefined,
          filename: info?.filename ?? undefined,
          mime: info?.mime ?? undefined,
          size: info?.size ?? undefined
        });
      });

      const optimisticUser = createUserMessage({
        id: `user-${Date.now()}-${Math.random()}`,
        ordinal: 0,
        content,
        isImageGen: payload.imgGenEnabled ?? false,
        userId,
        provider: toPrismaFormat(selectedModel.provider),
        model: selectedModel.modelId,
        conversationId,
        createdAt: new Date(),
        responseOutput: null,
        messageType: payload.imgGenEnabled ? "IMAGE_GEN" : "TEXT",
        disliked: null,
        liked: null,
        senderType: "USER",
        thinkingDuration: null,
        conversationMemoryChunkId: null,
        thinkingText: null,
        tryAgain: null,
        attachments: optimisticAttachments,
        updatedAt: new Date(),
        userKeyId: null,
        imageGenJob: null
      });

      // batchId: explicit (ChatInput had attachments) else the current batch only if it actually has uploads.
      let batchId = payload.batchId ?? undefined;
      if (!batchId) {
        const current = currentBatchId ?? undefined;
        const hasUploads = current
          ? (getUploadsByBatchId(current)?.length ?? 0) > 0
          : false;
        batchId = hasUploads ? current : undefined;
      }

      const keys = providerContext ?? fallbackApiKeys;
      const request = {
        metadata,
        type: "ai_chat_request",
        conversationId,
        prompt: content,
        provider: selectedModel.provider,
        model: getModel(
          selectedModel.provider,
          selectedModel.modelId as AllModelsUnion
        ),
        hasProviderConfigured: keys.isSet[selectedModel.provider],
        isDefaultProvider: keys.isDefault[selectedModel.provider],
        maxTokens: undefined,
        systemPrompt: undefined,
        temperature: undefined,
        topP: undefined,
        batchId,
        imgGenEnabled: payload.imgGenEnabled,
        imgGenFields:
          payload.imgGenEnabled === true ? payload.imgGenFields : undefined
      } satisfies AIChatRequest;

      store.beginSend(request, optimisticUser);
      sendEvent("ai_chat_request", request);
      startNewBatch();
    },
    [
      store,
      userId,
      selectedModel,
      providerContext,
      metadata,
      currentBatchId,
      getUploadsByBatchId,
      getByPreviewId,
      startNewBatch,
      sendEvent
    ]
  );
}
