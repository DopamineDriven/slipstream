import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { OpenAI } from "openai";
import { MetaBaseService } from "@/meta/base.ts";
import type { S3Storage } from "@slipstream/storage-s3";

export class MetaStoreService extends MetaBaseService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStoreVector: UserStoreVectorService,
    apiKey: string,
    s3: S3Storage,
    memoryService: ConversationMemoryVectorService
  ) {
    super(logger, prisma, userStoreVector, apiKey, s3, memoryService);
  }

  protected fileSearchFunctionTool() {
    return this.prisma.fileSearchToolOpenAI("file_search");
  }

  protected memorySearchFunctionTool() {
    return this.prisma.memorySearchToolOpenAI();
  }

  protected memoryGetChunkFunctionTool() {
    return this.prisma.memoryGetChunkToolOpenAI();
  }

  protected async executeFunctionToolCall(
    userId: string,
    conversationId: string,
    toolCall: OpenAI.Responses.ResponseFunctionToolCall
  ) {
    const toolName = toolCall.name;
    try {
      if (toolName === "file_search") {
        const input = this.userStoreVector.parseUserStoreInput(
          toolCall.arguments,
          toolName
        );
        const output = await this.userStoreVector.executeFileSearch(
          userId,
          input
        );
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
        "Meta function tool execution failed"
      );
      return {
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: `${toolName} error: ${this.prisma.safeErrMsg(error)}`
      } as const satisfies OpenAI.Responses.ResponseInputItem.FunctionCallOutput;
    }
  }
}
