/**
 * The draft → render-shape adapter. Pure, React-free: it folds a `ChatDraft` (the raw `AIChatChunk[]` the store
 * accumulates) into the legacy streaming fields the context contract exposes, and into the synthetic
 * `streaming-<conversationId>` `MessageSingleton<true>` the feed renders. This is the single place chunk frames
 * become message-shaped — replacing the per-token `setState` rebuild that lived in `ai-chat-context.tsx`'s
 * `handleChunk` and the streaming-splice effect in `dynamic/index.tsx`.
 *
 * Behaviour is ported verbatim from those two sites: block-based providers recompute text/thinking from the
 * ordinal-merged blocks; legacy providers append `chunk`/`thinkingText`; imgGen fields fold latest-wins with
 * partial images preserved; the synthetic bubble uses the SELECTED model's provider/model (`ctx`), not the
 * chunk's, exactly as the old streaming bubble did.
 */

import type { ChatDraft } from "@/state/chat/store-types";
import { normalizeImgGenFields } from "@/lib/img-gen-to-attachment";
import { createAIMessage, toMessageBlocks } from "@/lib/ui-message-helpers";
import type {
  AIChatResponseImgGenFieldsFinal,
  AttachmentSingleton,
  ChatChunkAndResMsgBlock,
  MessageSingleton,
  Provider
} from "@slipstream/types";
import { toPrismaFormat } from "@slipstream/types";

// ── block folding (ported from ai-chat-context.tsx:94-135) ──────────────────

const orderBlocks = (blocks: readonly ChatChunkAndResMsgBlock[]) =>
  [...blocks].sort((left, right) => left.ordinal - right.ordinal);

const isThinkingBlock = (block: ChatChunkAndResMsgBlock) =>
  block.type === "THINKING" || block.type === "ENCRYPTED_THINKING";

const mergeBlock = (
  current: readonly ChatChunkAndResMsgBlock[],
  incoming: ChatChunkAndResMsgBlock
) =>
  orderBlocks([
    ...current.filter(b => b.ordinal !== incoming.ordinal),
    incoming
  ]);

const textFromBlocks = (blocks: readonly ChatChunkAndResMsgBlock[]) =>
  blocks
    .filter(b => b.type === "TEXT")
    .map(b => b.content)
    .join("");

const thinkingTextFromBlocks = (blocks: readonly ChatChunkAndResMsgBlock[]) =>
  blocks
    .filter(isThinkingBlock)
    .map(b => b.content)
    .join("\n\n");

const thinkingDurationFromBlocks = (
  blocks: readonly ChatChunkAndResMsgBlock[]
) => {
  const total = blocks
    .filter(isThinkingBlock)
    .reduce((sum, b) => sum + b.durationMs, 0);
  return total > 0 ? total : null;
};

/** Fold a new imgGen frame into the accumulated fields — latest-wins, preserving prior partial images. */
const mergeImgGen = (
  prev: AIChatResponseImgGenFieldsFinal | undefined,
  incoming: AIChatResponseImgGenFieldsFinal
): AIChatResponseImgGenFieldsFinal => ({
  ...prev,
  ...incoming,
  partialImages: incoming.partialImages ?? prev?.partialImages
});

// ── derivation ──────────────────────────────────────────────────────────────

export interface DraftDerivation {
  readonly text: string;
  readonly thinkingText: string;
  readonly isThinking: boolean;
  readonly thinkingDuration: number | null;
  readonly blocks: readonly ChatChunkAndResMsgBlock[];
  readonly imgGenEnabled: boolean;
  readonly imgGenFields: AIChatResponseImgGenFieldsFinal | undefined;
  readonly userMsgId: string | undefined;
  readonly aiMsgId: string | undefined;
  readonly imgGenAttachmentId: string | undefined;
}

/** Fold the raw chunk frames into the legacy streaming fields the façade exposes. */
export function deriveDraft(draft: ChatDraft): DraftDerivation {
  let blocks = Array.of<ChatChunkAndResMsgBlock>();
  let text = "";
  let thinkingText = "";
  let isThinking = false;
  let thinkingDuration: number | null = null;
  let imgGenEnabled = false;
  let imgGenFields: AIChatResponseImgGenFieldsFinal | undefined = undefined;
  let userMsgId: string | undefined;
  let aiMsgId: string | undefined;
  let imgGenAttachmentId: string | undefined;

  for (const evt of draft) {
    if (evt.userMsgId) userMsgId = evt.userMsgId;
    if (evt.aiMsgId) aiMsgId = evt.aiMsgId;
    if (evt.imgGenAttachmentId) imgGenAttachmentId = evt.imgGenAttachmentId;

    if (evt.imgGenEnabled) imgGenEnabled = true;
    if (evt.imgGenFields) {
      imgGenEnabled = true;
      imgGenFields = mergeImgGen(imgGenFields, evt.imgGenFields);
    }

    if (evt.messageBlocks) {
      blocks = mergeBlock(blocks, evt.messageBlocks);
      text = textFromBlocks(blocks);
      thinkingText = thinkingTextFromBlocks(blocks);
      thinkingDuration = thinkingDurationFromBlocks(blocks);
      const latest = blocks.at(-1);
      isThinking =
        typeof evt.isThinking === "boolean" ? evt.isThinking
        : latest ? isThinkingBlock(latest)
        : false;
      continue;
    }

    // Legacy providers that emit only the flat chunk fields.
    if (evt.isThinking && evt.thinkingText) {
      thinkingText += evt.thinkingText;
      thinkingDuration = evt.thinkingDuration ?? null;
      isThinking = true;
    } else if (evt.chunk) {
      if (isThinking) {
        isThinking = false;
        if (evt.thinkingDuration) thinkingDuration = evt.thinkingDuration;
      }
      text += evt.chunk;
    }
    if (evt.thinkingDuration) thinkingDuration = evt.thinkingDuration;
  }

  return {
    text,
    thinkingText,
    isThinking,
    thinkingDuration,
    blocks,
    imgGenEnabled,
    imgGenFields,
    userMsgId,
    aiMsgId,
    imgGenAttachmentId
  };
}

// ── synthetic streaming message ─────────────────────────────────────────────

export interface DraftRenderContext {
  readonly conversationId: string;
  readonly provider: Provider;
  readonly model: string;
  readonly userId: string;
}

/** imgGen partials + finals as committed-shaped attachments (ported from dynamic/index.tsx:308-321). */
function imgGenAttachments(
  fields: AIChatResponseImgGenFieldsFinal | undefined
) {
  const arr = Array.of<AttachmentSingleton<true>>();
  const normalized = normalizeImgGenFields(fields ?? null);
  const partials = normalized?.partialImages?.filter(
    (a): a is AttachmentSingleton<true> => typeof a !== "undefined"
  );
  const finals = normalized?.images?.filter(
    (a): a is AttachmentSingleton<true> => typeof a !== "undefined"
  );
  if (partials && partials.length > 0) arr.push(...partials);
  if (finals && finals.length > 0) arr.push(...finals);
  return arr;
}

/**
 * The synthetic `streaming-<conversationId>` message the feed renders mid-stream. Display-only — the authoritative
 * message replaces it wholesale on `ai_chat_response`. `ChatFeed`/`MessageBubble` detect it by the `streaming-`
 * id prefix exactly as today, so their `live*` wiring is unchanged.
 */
export function draftToStreamingMessage(
  draft: ChatDraft,
  ctx: DraftRenderContext
): MessageSingleton<true> {
  const derived = deriveDraft(draft);
  const id = `streaming-${ctx.conversationId}`;
  const now = new Date();
  return createAIMessage({
    id,
    ordinal: 0,
    content: derived.text,
    userId: ctx.userId,
    messageType: derived.imgGenEnabled ? "IMAGE_GEN" : "TEXT",
    provider: toPrismaFormat(ctx.provider),
    model: ctx.model,
    conversationId: ctx.conversationId,
    isImageGen: derived.imgGenEnabled,
    responseOutput: null,
    conversationMemoryChunkId: null,
    thinkingText:
      derived.isThinking || derived.thinkingDuration ?
        derived.thinkingText
      : null,
    thinkingDuration: derived.thinkingDuration,
    createdAt: now,
    disliked: null,
    liked: null,
    tryAgain: null,
    senderType: "AI",
    attachments: imgGenAttachments(derived.imgGenFields),
    updatedAt: now,
    userKeyId: null,
    imageGenJob: null,
    messageBlocks: toMessageBlocks(id, [...derived.blocks])
  });
}

/** Compose the feed: committed timeline + the live streaming bubble (or just committed when no draft). */
export function appendDraft(
  committed: readonly MessageSingleton<true>[],
  draft: ChatDraft | undefined,
  ctx: DraftRenderContext
): readonly MessageSingleton<true>[] {
  if (!draft || draft.length === 0) return committed;
  return [...committed, draftToStreamingMessage(draft, ctx)];
}
