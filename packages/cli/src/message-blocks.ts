import type { ChatChunkAndResMsgBlock } from "@slipstream/types";

/**
 * Block-authoritative rendering helpers (shared by the live stream and the
 * resume/expand paths). MessageBlock is the newer, ordinal-keyed contract —
 * the flat `content` column is legacy fallback. Three block types exist;
 * `type` is the switch between reasoning and the model's actual answer.
 */

/** the wire block-type enum, sourced through the types package (no db dep) */
export type BlockType = ChatChunkAndResMsgBlock["type"];

/** structural minimum both MessageSingleton and the hydrated-tail shape satisfy */
export interface BlockBearingMessage {
  content: string;
  messageBlocks?: {
    type: BlockType | null;
    content: string | null;
    ordinal: number | null;
  }[];
}

/** THINKING and ENCRYPTED_THINKING are both reasoning; TEXT is the answer */
export function isReasoningBlock(type: BlockType | null) {
  return type === "THINKING" || type === "ENCRYPTED_THINKING";
}

export interface RenderableBlock {
  type: BlockType;
  content: string;
}

/**
 * The ordered, renderable blocks of a persisted message — ordinal-sorted,
 * ENCRYPTED_THINKING dropped (opaque, store-only, never round-tripped),
 * empty content skipped. Falls back to a single synthesized TEXT block from
 * the flat `content` column for legacy messages with no blocks.
 */
export function renderableBlocks(msg: BlockBearingMessage) {
  const blocks = msg.messageBlocks;
  if (blocks && blocks.length > 0) {
    return [...blocks]
      .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
      .filter(
        (b): b is { type: BlockType; content: string; ordinal: number | null } =>
          b.type !== null &&
          b.type !== "ENCRYPTED_THINKING" &&
          typeof b.content === "string" &&
          b.content.length > 0
      )
      .map(b => ({ type: b.type, content: b.content }) satisfies RenderableBlock);
  }
  return msg.content.length > 0
    ? [{ type: "TEXT", content: msg.content } satisfies RenderableBlock]
    : Array.of<RenderableBlock>();
}

/** the answer text of a message — TEXT blocks only, ordinal-joined */
export function messageAnswerText(msg: BlockBearingMessage) {
  const textBlocks = renderableBlocks(msg).filter(b => b.type === "TEXT");
  return textBlocks.length > 0
    ? textBlocks.map(b => b.content).join("")
    : msg.content;
}
