import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type {
  MistralAccumulatedToolCall,
  MistralContentChunk,
  MistralFunctionToolCall,
  MistralMessageReq,
  MistralToolMessage
} from "@/mistral/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type {
  ContentChunk,
  ToolCall
} from "@mistralai/mistralai/models/components";
import { MistralWorkupService } from "@/mistral/workup.ts";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { MessageSingleton } from "@slipstream/types";

export class MistralMemoryService extends MistralWorkupService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    redis: EnhancedRedisPubSub,
    userStoreVector: UserStoreVectorService,
    protected memoryService: ConversationMemoryVectorService,
    apiKey: string
  ) {
    super(logger, prisma, redis, userStoreVector, apiKey);
  }

  private modelIdentifier(msg: MessageSingleton<true>) {
    return `[${msg.provider.toLowerCase()}/${msg.model ?? "model"}]`;
  }

  /**
   * mistral 400s on empty assistant content — fall back to the raw message
   * content, then the provider tag, so the slot is never empty
   */
  private assistantHistoryText(
    msg: MessageSingleton<true>,
    textParts: readonly string[]
  ) {
    const joined = textParts.join("\n\n");

    if (joined.trim().length > 0) {
      return joined;
    }

    if (msg.content.trim().length > 0) {
      return msg.content;
    }

    return this.modelIdentifier(msg);
  }

  protected async formatHistory(msgs: MessageSingleton<true>[]) {
    // HMEM substitution assembly (Part II §2) — msgs arrive ordinal-sorted
    // from the resolver; the retired 175-slice is fully superseded
    const memoryView = await this.memoryService.getHistoryAssemblyView(
      msgs[0]?.conversationId,
      msgs.reduce((max, m) => (m.ordinal >= max ? m.ordinal + 1 : max), 0)
    );
    const formatted = Array.of<MistralMessageReq>();
    const lastIndex = msgs.findLastIndex(
      m => m.provider === "MISTRAL" && m.senderType === "AI"
    );

    const isFirstMistralMsg = lastIndex === -1;

    for (const [msgIndex, msg] of msgs.entries()) {
      const claim = memoryView?.claim(msg.ordinal);
      if (claim) {
        if (claim.emit != null) {
          formatted.push({
            role: "assistant",
            content: [{ type: "text", text: claim.emit }]
          });
        }
        continue;
      }
      const isFreshContext = isFirstMistralMsg || msgIndex > lastIndex;
      const isCurrentUserMsg = msgIndex === msgs.length - 1;
      if (msg.senderType === "USER") {
        const content = Array.of<ContentChunk>();
        const textParts = Array.of<string>();
        try {
          if (msg.attachments && msg.attachments.length > 0) {
            for (const att of msg.attachments) {
              const {
                cdnUrl,
                mime: ogMime,
                compatStatus,
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
                if (att.assetType === "DOCUMENT") {
                  try {
                    if (isFreshContext) {
                      try {
                        if (!isCurrentUserMsg) {
                          textParts.push(`[${name}](${url})`);
                        } else {
                          content.push({
                            documentUrl: url,
                            documentName: filename,
                            type: "document_url"
                          } satisfies MistralContentChunk["document_url"]);
                        }
                      } catch {
                        textParts.push(`[${name}](${url})`);
                      }
                    } else {
                      textParts.push(`[${name}](${url})`);
                    }
                  } catch {
                    textParts.push(`[${name}](${url})`);
                  }
                } else if (att.assetType === "IMAGE") {
                  if (isFreshContext && isCurrentUserMsg) {
                    content.push({
                      type: "image_url",
                      imageUrl: { url, detail: "high" }
                    } satisfies MistralContentChunk["image_url"]);
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
        content.push({ type: "text", text: textParts.join(`\n\n`) });
        formatted.push({ role: "user", content });
      } else {
        const content = Array.of<ContentChunk>();
        const textParts = Array.of<string>();
        const modelIdentifier = this.modelIdentifier(msg);

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
            textParts.push(textBlocks.join(`\n\n`));
          } else {
            textParts.push(msg.content);
          }
        }
        content.push({
          type: "text",
          text: this.assistantHistoryText(msg, textParts)
        });
        formatted.push({ role: "assistant", content });
      }
    }
    return formatted;
  }

  protected async executeToolCall(
    userId: string,
    conversationId: string,
    toolCall: MistralFunctionToolCall
  ) {
    const toolName = toolCall.function.name;
    try {
      if (toolName === "file_search") {
        const input = this.parseFileSearchInput(toolCall.function.arguments);
        const output = await this.executeFileSearch(userId, input);
        return {
          role: "tool",
          toolCallId: toolCall.id,
          name: toolName,
          content: output
        } as const satisfies MistralToolMessage;
      }

      if (toolName === "conversation_memory_search") {
        const parsed = this.userStoreVector.parseUserStoreArgs(
          this.toolCallArgumentsToString(toolCall.function.arguments),
          toolName
        );
        const output = await this.memoryService.searchMemoryFromToolInput(
          userId,
          conversationId,
          parsed
        );
        return {
          role: "tool",
          toolCallId: toolCall.id,
          name: toolName,
          content: output
        } as const satisfies MistralToolMessage;
      }

      if (toolName === "conversation_memory_get_chunk") {
        const parsed = this.userStoreVector.parseUserStoreArgs(
          this.toolCallArgumentsToString(toolCall.function.arguments),
          toolName
        );
        const output = await this.memoryService.getMemoryChunkFromToolInput(
          userId,
          parsed
        );
        return {
          role: "tool",
          toolCallId: toolCall.id,
          name: toolName,
          content: output
        } as const satisfies MistralToolMessage;
      }

      return {
        role: "tool",
        toolCallId: toolCall.id,
        name: toolName,
        content: `Unknown tool: ${toolName}`
      } as const satisfies MistralToolMessage;
    } catch (error) {
      this.logger.error(
        {
          toolName,
          toolCallId: toolCall.id,
          error: this.prisma.safeErrMsg(error)
        },
        "mistral function tool execution failed"
      );

      return {
        role: "tool",
        toolCallId: toolCall.id,
        name: toolName,
        content: `${toolName} error: ${this.prisma.safeErrMsg(error)}`
      } as const satisfies MistralToolMessage;
    }
  }

  protected toolCallArgumentsToString(value: string | Record<string, unknown>) {
    if (typeof value === "string") {
      return value;
    }

    return JSON.stringify(value);
  }

  protected accumulateToolCallDelta(
    registry: Map<number, MistralAccumulatedToolCall>,
    deltas: ToolCall[]
  ) {
    for (const delta of deltas) {
      const index = delta.index ?? 0;
      const current = registry.get(index) ?? {
        id: "",
        name: "",
        arguments: "",
        index
      };

      if (delta.id) {
        current.id = delta.id;
      }

      if (delta.function.name) {
        current.name = delta.function.name;
      }

      const nextArguments = this.toolCallArgumentsToString(
        delta.function.arguments
      );

      if (typeof delta.function.arguments === "string") {
        current.arguments += nextArguments;
      } else if (nextArguments.length > 0) {
        current.arguments = nextArguments;
      }

      registry.set(index, current);
    }
  }

  protected materializeToolCalls(
    registry: Map<number, MistralAccumulatedToolCall>
  ) {
    const materialized = Array.of<MistralFunctionToolCall>();

    for (const [, toolCall] of Array.from(registry.entries()).sort(
      ([left], [right]) => left - right
    )) {
      if (!toolCall.id || !toolCall.name) {
        this.logger.warn(
          { toolCall },
          "Skipping incomplete streamed mistral tool call"
        );
        continue;
      }

      materialized.push({
        id: toolCall.id,
        index: toolCall.index,
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
