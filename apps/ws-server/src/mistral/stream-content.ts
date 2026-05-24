import type {
  ContentChunk,
  ThinkChunk
} from "@mistralai/mistralai/models/components";

export interface MistralDeltaContentHandlers {
  emitTextChunk(text: string): void;
  emitThinkingChunk(text: string): void;
}

export class MistralStreamContentService {
  public thinkingChunkText(chunk: ThinkChunk) {
    const textAgg = Array.of<string>();

    for (const item of chunk.thinking) {
      if ("text" in item && typeof item.text === "string") {
        textAgg.push(item.text);
      }
    }

    return textAgg.join("");
  }

  public processDeltaContent(
    content: string | readonly ContentChunk[] | null | undefined,
    handlers: MistralDeltaContentHandlers
  ) {
    if (typeof content === "string") {
      handlers.emitTextChunk(content);
      return;
    }

    if (!content || content.length === 0) {
      return;
    }

    for (const chunk of content) {
      if (chunk.type === "text") {
        handlers.emitTextChunk(chunk.text);
        continue;
      }

      if (chunk.type === "thinking") {
        const thinkingText = this.thinkingChunkText(chunk);
        if (thinkingText.length > 0) {
          handlers.emitThinkingChunk(thinkingText);
        }
      }
    }
  }
}
