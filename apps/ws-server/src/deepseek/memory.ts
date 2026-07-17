import type {
  DeepSeekAccumulatedToolCall,
  DeepSeekAssistantMessage,
  DeepSeekBaseMessage,
  DeepSeekFunctionToolCall,
  DeepSeekImageContentPart,
  DeepSeekTextContentPart,
  DeepSeekToolMessage,
  DeepSeekUserContentPart,
  DeepSeekUserMessage
} from "@/deepseek/types.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import { DeepSeekWorkupService } from "@/deepseek/workup.ts";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { MessageSingleton } from "@slipstream/types";

export class DeepSeekMemoryService extends DeepSeekWorkupService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    redis: EnhancedRedisPubSub,
    userStoreVector: UserStoreVectorService,
    protected memory: ConversationMemoryVectorService,
    apiKey?: string
  ) {
    super(logger, prisma, redis, userStoreVector, apiKey);
  }

  protected async formatHistory(msgs: MessageSingleton<true>[]) {
    // HMEM substitution assembly (Part II §2) — msgs arrive ordinal-sorted
    // from resolver/chat.ts
    const memoryView = await this.memory.getHistoryAssemblyView(
      msgs[0]?.conversationId,
      msgs.reduce((max, m) => (m.ordinal >= max ? m.ordinal + 1 : max), 0)
    );
    const formatted = Array.of<DeepSeekBaseMessage>();
    const lastIndex = msgs.findLastIndex(
      m => m.provider === "DEEPSEEK" && m.senderType === "AI"
    );

    const isFirstDeepSeekMsg = lastIndex === -1;

    for (const [msgIndex, msg] of msgs.entries()) {
      const claim = memoryView?.claim(msg.ordinal);
      if (claim) {
        if (claim.emit != null) {
          formatted.push({
            role: "assistant",
            content: claim.emit
          } satisfies DeepSeekAssistantMessage);
        }
        continue;
      }
      const isFreshContext = isFirstDeepSeekMsg || msgIndex > lastIndex;
      const isCurrentUserMsg = msgIndex === msgs.length - 1;

      if (msg.senderType === "USER") {
        const content = Array.of<DeepSeekUserContentPart>();
        const textParts = Array.of<string>();

        try {
          if (msg.attachments && msg.attachments.length > 0) {
            for (const att of msg.attachments) {
              const {
                cdnUrl,
                mime: ogMime,
                compatStatus,
                compatCdnUrl,
                compatMime,
                assetType
              } = att;
              const url = compatStatus === "ACTIVE" ? compatCdnUrl : cdnUrl;
              const mime = compatStatus === "ACTIVE" ? compatMime : ogMime;

              if (url && mime) {
                const [filename, ext] = this.prisma.filenameToHexExtTuple(
                  url,
                  compatStatus,
                  false
                );
                const name = `${filename}.${ext}`;

                if (assetType === "IMAGE") {
                  if (isFreshContext && isCurrentUserMsg) {
                    content.push({
                      type: "image_url",
                      image_url: { url, detail: "high" }
                    } satisfies DeepSeekImageContentPart);
                  } else {
                    textParts.push(`![${name}](${url})`);
                  }
                } else {
                  textParts.push(`[${name}](${url})`);
                }
              }
            }
          }
        } catch (err) {
          throw new Error(this.prisma.safeErrMsg(err));
        } finally {
          if (msg.messageBlocks && msg.messageBlocks.length > 0) {
            const textBlocks = Array.of<string>();
            for (const x of msg.messageBlocks) {
              if (x.type === "TEXT") {
                textBlocks.push(x.content);
              }
            }
            textParts.push(textBlocks.join(`\n`));
          } else {
            textParts.push(msg.content);
          }
        }

        content.push({
          type: "text",
          text: textParts.join(`\n\n`)
        } satisfies DeepSeekTextContentPart);

        formatted.push({
          role: "user",
          content
        } satisfies DeepSeekUserMessage);
      } else {
        const textParts = Array.of<string>();
        const modelIdentifier = `[${msg.provider.toLowerCase()}/${msg.model ?? "model"}]`;

        try {
          if (msg.attachments && msg.attachments.length > 0) {
            for (const att of msg.attachments) {
              const {
                cdnUrl,
                mime: ogMime,
                compatStatus,
                assetType,
                compatCdnUrl,
                compatMime
              } = att;
              const url = compatStatus === "ACTIVE" ? compatCdnUrl : cdnUrl;
              const mime = compatStatus === "ACTIVE" ? compatMime : ogMime;

              if (url && mime) {
                const [filename, ext] = this.prisma.filenameToHexExtTuple(
                  url,
                  att.compatStatus,
                  false
                );
                const name = `${filename}.${ext}`;

                if (assetType === "IMAGE") {
                  textParts.push(`${modelIdentifier}\n![${name}](${url})`);
                } else {
                  textParts.push(`${modelIdentifier}\n[${name}](${url})`);
                }
              }
            }
          }
        } catch (err) {
          this.logger.info(this.prisma.safeErrMsg(err));
        } finally {
          if (msg.messageBlocks && msg.messageBlocks.length > 0) {
            const textBlocks = Array.of<string>();
            for (const x of msg.messageBlocks) {
              if (x.type === "TEXT") {
                textBlocks.push(x.content);
              }
            }
            textParts.push(`${modelIdentifier}\n\n${textBlocks.join(`\n\n`)}`);
          } else {
            textParts.push(`${modelIdentifier}\n\n${msg.content}`);
          }
        }

        formatted.push({
          role: "assistant",
          content: textParts.join(`\n\n`)
        } satisfies DeepSeekAssistantMessage);
      }
    }

    return formatted;
  }

  protected async executeToolCall(
    userId: string,
    conversationId: string,
    toolCall: DeepSeekFunctionToolCall
  ) {
    const toolName = toolCall.function.name;
    try {
      if (toolName === "file_search") {
        const input = this.userStoreVector.parseUserStoreInput(
          toolCall.function.arguments,
          toolName
        );
        const output = await this.userStoreVector.executeFileSearch(
          userId,
          input
        );
        return {
          role: "tool",
          tool_call_id: toolCall.id,
          content: output
        } as const satisfies DeepSeekToolMessage;
      }

      if (toolName === "conversation_memory_search") {
        const parsed = this.userStoreVector.parseUserStoreArgs(
          toolCall.function.arguments,
          toolName
        );
        const output = await this.memory.searchMemoryFromToolInput(
          userId,
          conversationId,
          parsed
        );
        return {
          role: "tool",
          tool_call_id: toolCall.id,
          content: output
        } as const satisfies DeepSeekToolMessage;
      }

      if (toolName === "conversation_memory_get_chunk") {
        const parsed = this.userStoreVector.parseUserStoreArgs(
          toolCall.function.arguments,
          toolName
        );
        const output = await this.memory.getMemoryChunkFromToolInput(
          userId,
          parsed
        );
        return {
          role: "tool",
          tool_call_id: toolCall.id,
          content: output
        } as const satisfies DeepSeekToolMessage;
      }

      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content: `Unknown tool: ${toolName}`
      } as const satisfies DeepSeekToolMessage;
    } catch (error) {
      this.logger.error(
        {
          toolName,
          toolCallId: toolCall.id,
          error: this.prisma.safeErrMsg(error)
        },
        "DeepSeek function tool execution failed"
      );
      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content: `${toolName} error: ${this.prisma.safeErrMsg(error)}`
      } as const satisfies DeepSeekToolMessage;
    }
  }

  protected accumulateToolCallDelta(
    registry: Map<number, DeepSeekAccumulatedToolCall>,
    deltas: readonly {
      index: number;
      id?: string;
      function?: { name?: string; arguments?: string };
    }[]
  ) {
    for (const delta of deltas) {
      const current = registry.get(delta.index) ?? {
        id: "",
        name: "",
        arguments: ""
      };

      if (delta.id) {
        current.id = delta.id;
      }
      if (delta.function?.name) {
        current.name = delta.function.name;
      }
      if (typeof delta.function?.arguments === "string") {
        current.arguments += delta.function.arguments;
      }

      registry.set(delta.index, current);
    }
  }

  protected materializeToolCalls(
    registry: Map<number, DeepSeekAccumulatedToolCall>
  ) {
    const materialized = Array.of<DeepSeekFunctionToolCall>();

    for (const [, toolCall] of Array.from(registry.entries()).sort(
      ([left], [right]) => left - right
    )) {
      if (!toolCall.id || !toolCall.name) {
        this.logger.warn(
          { toolCall },
          "Skipping incomplete streamed DeepSeek tool call"
        );
        continue;
      }

      materialized.push({
        id: toolCall.id,
        type: "function",
        function: {
          name: toolCall.name,
          arguments: toolCall.arguments
        }
      });
    }

    return materialized;
  }
}
