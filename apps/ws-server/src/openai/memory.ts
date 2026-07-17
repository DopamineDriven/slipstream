import type { LoggerService } from "@/logger/index.ts";
import type { MemoryAssemblyView } from "@/memory/types.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { InferPromiseRT } from "@/types/index.ts";
import type { OpenAI } from "openai";
import type { ResponseInput } from "openai/resources/responses/responses.mjs";
import { OpenAIServiceWorkup } from "@/openai/workup.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { MessageSingleton } from "@slipstream/types";

export class OpenAIMemoryService extends OpenAIServiceWorkup {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStoreVector: UserStoreVectorService,
    s3: S3Storage,
    apiKey: string,
    // memory ownership STARTS here — base/workup below are memory-free so the
    // summarizer arm can extend OpenAIServiceWorkup without the ctor cycle
    protected memoryService: ConversationMemoryVectorService
  ) {
    super(logger, prisma, userStoreVector, apiKey, s3);
  }

  // openai/index.ts
  protected async formatOpenAiWithUploads(
    isNewChat: boolean,
    msgs: MessageSingleton<true>[],
    client: OpenAI,
    keyFingerprint = "server",
    opts?: { onlyMostRecentUser?: boolean }
  ) {
    if (isNewChat) {
      const first = msgs[0];
      if (!first)
        return [{ role: "user", content: "" }] as const satisfies ResponseInput;
      const firstText = this.messageText(first);
      const attContent = await this.buildAttachmentContentAsync(
        first.attachments,
        client,
        keyFingerprint
      );
      return attContent.length
        ? ([
            {
              role: "user",
              content: [...attContent, { type: "input_text", text: firstText }]
            }
          ] as const satisfies ResponseInput)
        : ([
            { role: "user", content: firstText }
          ] as const satisfies ResponseInput);
    } else {
      if (opts?.onlyMostRecentUser) {
        const lastUser = [...msgs].reverse().find(t => t.senderType === "USER");
        if (lastUser) {
          const lastUserText = this.messageText(lastUser);
          const attContent = await this.buildAttachmentContentAsync(
            lastUser.attachments,
            client,
            keyFingerprint
          );
          return attContent.length
            ? ([
                {
                  role: "user",
                  content: [
                    ...attContent,
                    { type: "input_text", text: lastUserText }
                  ]
                }
              ] as const satisfies ResponseInput)
            : ([
                { role: "user", content: lastUserText }
              ] as const satisfies ResponseInput);
        }
      }
      // HMEM substitution assembly (Part II §2)
      const memoryView = await this.memoryService.getHistoryAssemblyView(
        msgs[0]?.conversationId,
        msgs.reduce((max, m) => (m.ordinal >= max ? m.ordinal + 1 : max), 0)
      );
      const history = this.prependProviderModelTag(
        msgs.slice(0, -1),
        memoryView
      );
      const last = msgs.at(-1);
      if (last?.senderType === "USER") {
        const lastText = this.messageText(last);
        const attContent = await this.buildAttachmentContentAsync(
          last.attachments,
          client,
          keyFingerprint
        );
        return attContent.length
          ? ([
              ...history,
              {
                role: "user",
                content: [...attContent, { type: "input_text", text: lastText }]
              }
            ] as const satisfies ResponseInput)
          : ([
              ...history,
              { role: "user", content: lastText }
            ] as const satisfies ResponseInput);
      }
      return this.formatMsgs(this.prependProviderModelTag(msgs, memoryView));
    }
  }

  private prependProviderModelTag(
    msgs: Pick<
      MessageSingleton<true>,
      | "senderType"
      | "provider"
      | "model"
      | "content"
      | "messageBlocks"
      | "ordinal"
    >[],
    memoryView: MemoryAssemblyView | null
  ) {
    return msgs.flatMap<
      | { readonly role: "user"; readonly content: string }
      | { readonly role: "assistant"; readonly content: string }
    >(msg => {
      // HMEM substitution assembly (Part II §2)
      const claim = memoryView?.claim(msg.ordinal);
      if (claim) {
        return claim.emit != null
          ? [{ role: "assistant", content: claim.emit } as const]
          : [];
      }
      const text = this.messageText(msg);

      if (msg.senderType === "USER") {
        return [{ role: "user", content: text } as const];
      } else {
        const provider = msg.provider.toLowerCase();
        const model = msg.model ?? "";
        const modelIdentifier = `[${provider}/${model}]`;
        return [
          {
            role: "assistant",
            content: `${modelIdentifier} \n${text}`
          } as const
        ];
      }
    }) satisfies ResponseInput;
  }

  protected hasFiles(
    formatted: InferPromiseRT<ReturnType<typeof this.formatOpenAiWithUploads>>
  ) {
    return formatted.some(m => {
      if (typeof m.content === "string") return false;
      if (m.role !== "user") return false;
      return m.content.some(
        t =>
          t.type === "input_file" &&
          (typeof t?.file_id !== "undefined" ||
            typeof t?.file_data !== "undefined")
      );
    });
  }
  protected hasImages(
    formatted: InferPromiseRT<ReturnType<typeof this.formatOpenAiWithUploads>>
  ) {
    return formatted.some(m => {
      if (typeof m.content === "string") return false;
      if (m.role !== "user") return false;
      return m.content.some(
        t =>
          t.type === "input_image" &&
          (typeof t?.image_url !== "undefined" ||
            typeof t?.file_id !== "undefined")
      );
    });
  }
  protected fileIds(
    formatted: InferPromiseRT<ReturnType<typeof this.formatOpenAiWithUploads>>
  ) {
    const fileIdArr = Array.of<string>();
    try {
      for (const m of formatted) {
        if (m.role !== "user") continue;
        const c = m.content;
        if (typeof c === "string") continue;
        for (const p of c) {
          if (p.type === "input_file" && p.file_id) fileIdArr.push(p.file_id);
        }
      }
    } finally {
      return fileIdArr;
    }
  }

  protected async executeFunctionToolCall(
    userId: string,
    conversationId: string,
    toolCall: OpenAI.Responses.ResponseFunctionToolCall
  ) {
    const toolName = toolCall.name;
    try {
      if (toolName === "user_store_search") {
        const input = this.userStoreVector.parseUserStoreInput(toolCall.arguments, toolName);
        const output = await this.userStoreVector.executeFileSearch(userId, input);
        return {
          type: "function_call_output",
          call_id: toolCall.call_id,
          output
        } as const satisfies OpenAI.Responses.ResponseInputItem.FunctionCallOutput;
      }

      if (toolName === "conversation_memory_search") {
        const parsed = this.userStoreVector.parseUserStoreArgs(
          toolCall.arguments,
          toolName
        );
        const output = await this.memoryService.searchMemoryFromToolInput(
          userId,
          conversationId,
          parsed
        );
        return {
          type: "function_call_output",
          call_id: toolCall.call_id,
          output
        } as const satisfies OpenAI.Responses.ResponseInputItem.FunctionCallOutput;
      }

      if (toolName === "conversation_memory_get_chunk") {
        const parsed = this.userStoreVector.parseUserStoreArgs(
          toolCall.arguments,
          toolName
        );
        const output = await this.memoryService.getMemoryChunkFromToolInput(
          userId,
          parsed
        );
        return {
          type: "function_call_output",
          call_id: toolCall.call_id,
          output
        } as const satisfies OpenAI.Responses.ResponseInputItem.FunctionCallOutput;
      }

      return {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: `Unknown tool: ${toolName}`
      } as const satisfies OpenAI.Responses.ResponseInputItem.FunctionCallOutput;
    } catch (error) {
      this.logger.error(
        {
          toolName,
          callId: toolCall.call_id,
          error: this.prisma.safeErrMsg(error)
        },
        "OpenAI function tool execution failed"
      );
      return {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: `${toolName} error: ${this.prisma.safeErrMsg(error)}`
      } as const satisfies OpenAI.Responses.ResponseInputItem.FunctionCallOutput;
    }
  }
}
