import type {
  BlockBearingMessage,
  BlockType,
  RenderableBlock
} from "@/types.ts";
import { CliProviderContextService } from "@/provider-context.ts";

export class MessageBlocksService extends CliProviderContextService {
  public isReasoningBlock(type: BlockType | null) {
    return type === "THINKING" || type === "ENCRYPTED_THINKING";
  }

  public renderableBlocks(msg: BlockBearingMessage) {
    const blocks = msg.messageBlocks;
    if (blocks && blocks.length > 0) {
      return [...blocks]
        .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
        .filter(
          (
            b
          ): b is {
            type: BlockType;
            content: string;
            ordinal: number | null;
          } =>
            b.type !== null &&
            b.type !== "ENCRYPTED_THINKING" &&
            typeof b.content === "string" &&
            b.content.length > 0
        )
        .map(
          b => ({ type: b.type, content: b.content }) satisfies RenderableBlock
        );
    }
    return msg.content.length > 0
      ? [{ type: "TEXT", content: msg.content } satisfies RenderableBlock]
      : Array.of<RenderableBlock>();
  }

  public messageAnswerText(msg: BlockBearingMessage) {
    const textBlocks = this.renderableBlocks(msg).filter(
      b => b.type === "TEXT"
    );
    return textBlocks.length > 0
      ? textBlocks.map(b => b.content).join("")
      : msg.content;
  }
}
