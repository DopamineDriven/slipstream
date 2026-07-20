import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { LlamaAccumulatedToolCall } from "@/meta/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type {
  CompletionMessage,
  CreateChatCompletionResponseStreamChunk,
  MessageImageContentItem,
  MessageTextContentItem,
  ToolResponseMessage,
  UserMessage
} from "llama-api-client/resources/index.mjs";
import { LlamaWorkupService } from "@/meta/workup.ts";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { MessageSingleton } from "@slipstream/types";

export class LlamaMemoryService extends LlamaWorkupService {
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
   * assistant slots are never left empty — fall back to the raw message
   * content, then the provider tag
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
    // from the resolver; the last-user/new-chat special-casing of the old
    // llamaFormat is retired (a fresh chat is just a one-message history)
    const memoryView = await this.memoryService.getHistoryAssemblyView(
      msgs[0]?.conversationId,
      msgs.reduce((max, m) => (m.ordinal >= max ? m.ordinal + 1 : max), 0)
    );
    const formatted = Array.of<UserMessage | CompletionMessage>();
    const lastIndex = msgs.findLastIndex(
      m => m.provider === "META" && m.senderType === "AI"
    );

    const isFirstMetaMsg = lastIndex === -1;

    for (const [msgIndex, msg] of msgs.entries()) {
      const claim = memoryView?.claim(msg.ordinal);
      if (claim) {
        if (claim.emit != null) {
          formatted.push({ role: "assistant", content: claim.emit });
        }
        continue;
      }
      const isFreshContext = isFirstMetaMsg || msgIndex > lastIndex;
      const isCurrentUserMsg = msgIndex === msgs.length - 1;
      if (msg.senderType === "USER") {
        const content = Array.of<
          MessageTextContentItem | MessageImageContentItem
        >();
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
                if (att.assetType === "IMAGE") {
                  if (isFreshContext && isCurrentUserMsg) {
                    content.push({ type: "image_url", image_url: { url } });
                  } else {
                    textParts.push(`![${name}](${url})`);
                  }
                } else {
                  // llama has no native document content type — documents
                  // ride as markdown links; file_search reaches their
                  // indexed chunks
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
        const text = textParts.join(`\n\n`);
        formatted.push(
          content.length > 0
            ? { role: "user", content: [...content, { type: "text", text }] }
            : { role: "user", content: text }
        );
      } else {
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
        formatted.push({
          role: "assistant",
          content: this.assistantHistoryText(msg, textParts)
        });
      }
    }
    return formatted;
  }

  protected async executeToolCall(
    userId: string,
    conversationId: string,
    toolCall: CompletionMessage.ToolCall
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
        } as const satisfies ToolResponseMessage;
      }

      if (toolName === "conversation_memory_search") {
        const parsed = this.userStoreVector.parseUserStoreArgs(
          toolCall.function.arguments,
          toolName
        );
        const output = await this.memoryService.searchMemoryFromToolInput(
          userId,
          conversationId,
          parsed
        );
        return {
          role: "tool",
          tool_call_id: toolCall.id,
          content: output
        } as const satisfies ToolResponseMessage;
      }

      if (toolName === "conversation_memory_get_chunk") {
        const parsed = this.userStoreVector.parseUserStoreArgs(
          toolCall.function.arguments,
          toolName
        );
        const output = await this.memoryService.getMemoryChunkFromToolInput(
          userId,
          parsed
        );
        return {
          role: "tool",
          tool_call_id: toolCall.id,
          content: output
        } as const satisfies ToolResponseMessage;
      }

      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content: `Unknown tool: ${toolName}`
      } as const satisfies ToolResponseMessage;
    } catch (error) {
      this.logger.error(
        {
          toolName,
          toolCallId: toolCall.id,
          error: this.prisma.safeErrMsg(error)
        },
        "llama function tool execution failed"
      );
      return {
        role: "tool",
        tool_call_id: toolCall.id,
        content: `${toolName} error: ${this.prisma.safeErrMsg(error)}`
      } as const satisfies ToolResponseMessage;
    }
  }

  protected accumulateToolCallDelta(
    registry: Map<string, LlamaAccumulatedToolCall>,
    delta: CreateChatCompletionResponseStreamChunk.Event.ToolCallDelta
  ) {
    const lastEntry = Array.from(registry.entries()).at(-1);
    const incomingId = delta.id;

    if (
      incomingId &&
      lastEntry &&
      lastEntry[0].startsWith("pending_") &&
      !registry.has(incomingId)
    ) {
      const pending = lastEntry[1];
      registry.delete(lastEntry[0]);
      registry.set(incomingId, {
        ...pending,
        id: incomingId
      });
    }

    const activeKey =
      incomingId ?? lastEntry?.[0] ?? `pending_${String(registry.size)}`;
    const current = registry.get(activeKey) ?? {
      id: incomingId ?? "",
      name: "",
      arguments: "",
      ordinal: registry.size
    };

    if (incomingId) {
      current.id = incomingId;
    }
    if (delta.function.name) {
      const incomingName = delta.function.name.trim();
      if (incomingName.length > 0) {
        if (current.name.length === 0) {
          current.name = incomingName;
        } else if (current.name !== incomingName) {
          this.logger.warn(
            {
              toolCallId: current.id ?? incomingId ?? null,
              currentName: current.name,
              incomingName
            },
            "Ignoring conflicting streamed llama tool name delta"
          );
        }
      }
    }
    if (typeof delta.function.arguments === "string") {
      current.arguments += delta.function.arguments;
    }

    registry.set(activeKey, current);
  }

  protected materializeToolCalls(
    registry: Map<string, LlamaAccumulatedToolCall>
  ) {
    const materialized = Array.of<CompletionMessage.ToolCall>();

    for (const toolCall of Array.from(registry.values()).sort(
      (left, right) => left.ordinal - right.ordinal
    )) {
      if (!toolCall.id || !toolCall.name) {
        this.logger.warn(
          { toolCall },
          "Skipping incomplete streamed llama tool call"
        );
        continue;
      }

      materialized.push({
        id: toolCall.id,
        function: {
          name: toolCall.name,
          arguments: toolCall.arguments
        }
      });
    }

    return materialized;
  }
}
