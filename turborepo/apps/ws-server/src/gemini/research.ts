import type {
  ImageGenObj,
  ProviderGeminiChatRequestEntity
} from "@/gemini/types.ts";
import type { Blob, Interactions } from "@google/genai";
import { GeminiChatService } from "@/gemini/chat.ts";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";
import { S3Storage } from "@slipstream/storage-s3";

export class GeminiResearchService extends GeminiChatService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    redis: EnhancedRedisPubSub,
    s3: S3Storage,
    apiKey: string
  ) {
    super(logger, prisma, redis, s3, apiKey);
  }

  protected async handleDeepResearch({
    chunks,
    conversationId,
    isNewChat,
    msgs,
    userMsgId,
    streamChannel,
    thinkingChunks,
    userId,
    ws,
    keyId,
    apiKey,
    max_tokens,
    systemPrompt,
    temperature,
    title,
    imgGenFields,
    imgGenEnabled,
    jobId,
    requestMessageId,
    topP,
    userData
  }: ProviderGeminiChatRequestEntity) {
    let geminiThinkingStartTime: number | null = null,
      geminiThinkingDuration = 0,
      geminiIsCurrentlyThinking = false,
      geminiThinkingAgg = "",
      usage = 0,
      interactionId: string | undefined = undefined,
      eventId: string | undefined = undefined,
      uploadtInitial = 0,
      tInitial = 0,
      uploadtDelta = 0,
      geminiAgg = "",
      geminiDataPart: Blob | undefined = undefined;

    const imgArr = Array.of<ImageGenObj>();

    const gemini = this.getClient(apiKey);

    const system_instruction = this.formatSystemInstruction(
      isNewChat,
      systemPrompt
    );

    const input = await this.formatHistoryForDeepResearch(
      msgs,
      keyId ?? "server",
      system_instruction,
      apiKey
    );

    const previous_interaction_id = this.getPreviousInteractionId(msgs);

    if (input.length === 0) return;

    const stream = await gemini.interactions.create(
      {
        agent: "deep-research-pro-preview-12-2025",
        input,
        api_version: this.apiVersion,
        tools: [
          { type: "google_search" },
          { type: "code_execution" },
          { type: "url_context" },
          {
            type: "file_search",
            file_search_store_names: [
              "fileSearchStores/my-file_search-store-123"
            ]
          }
        ] satisfies Interactions.Tool[],
        // "audio" is also supported
        response_modalities: ["text", "image"],
        system_instruction,
        // enables thinking events for feedback throughout the task
        agent_config: { thinking_summaries: "auto", type: "deep-research" },
        background: true,
        previous_interaction_id,
        stream: true
      },
      { stream: true }
    );

    for await (const event of stream) {
      if (event.event_id && typeof eventId === "undefined") {
        eventId = event.event_id;
        
      }
      switch (event.event_type) {
        case "content.delta": {
          if (event.delta) {
            if (
              "result" in event.delta &&
              typeof event.delta.result !== "undefined"
            ) {
              if (typeof event.delta.result === "string") {
                if (event.delta.type === "code_execution_result") {
                  event.delta;
                }
              } else if (
                Array.isArray(event.delta.result) &&
                event.delta.result.length > 0 &&
                (event.delta.type === "url_context_result" ||
                  event.delta.type === "google_search_result" ||
                  event.delta.type === "file_search_result")
              ) {
                switch (event.delta.type) {
                  case "file_search_result": {
                    for (const res of event.delta.result) {
                      this.logger.info(
                        {
                          store: res.file_search_store ?? "no-store",
                          title: res.title,
                          text: res.text
                        },
                        "gemini_file_search_result"
                      );
                    }
                    break;
                  }
                  case "google_search_result": {
                    for (const res of event.delta.result) {
                      if (res.url && res.title) {
                        this.logger.info(
                          {
                            url: res.url,
                            title: res.title,
                            renderedContent:
                              res.rendered_content ?? "no rendered content"
                          },
                          "gemini_url_context_result"
                        );
                      }
                    }
                    break;
                  }
                  case "url_context_result": {
                    for (const res of event.delta.result) {
                      if (res.url && res.status) {
                        this.logger.info(
                          {
                            url: res.url,
                            status: res.status
                          },
                          "gemini_url_context_result"
                        );
                      }
                    }
                    break;
                  }
                  default: {
                    break;
                  }
                }
              } else if (
                "items" in event.delta.result &&
                typeof event.delta.result.items !== "undefined" &&
                (event.delta.type === "function_result" ||
                  event.delta.type === "mcp_server_tool_result")
              ) {
                switch (event.delta.type) {
                  case "function_result": {
                    break;
                  }
                  case "mcp_server_tool_result": {
                    event.delta.result;
                    break;
                  }
                  default: {
                    break;
                  }
                }
                for (const it of event.delta.result.items) {
                  const item = it as Interactions.ImageContent | string;
                  if (typeof item === "string") {
                    item;
                  } else {
                    item;
                  }
                }
              }
            }
            switch (event.delta.type) {
              case "image": {
                // 'image/png' | 'image/jpeg' | 'image/webp' | 'image/heic' | 'image/heif' | (string & {});
                if (event.delta.data) {
                  // base64 image output -> handle like I do with nano bananas -> s3 -> stream cdn url back to client -> track with imageGenArr
                  event.delta.data;
                }

                break;
              }
              case "google_search_call": {
                if (event.delta) {
                  // queries
                  event.delta.arguments?.queries;
                  // unique id for call -> can be used to track result output by 1:1 match to handle n>1 google search calls in progress at any given time
                  event.delta.id;
                }
                break;
              }
            }
          }
          break;
        }
        case "content.start": {
          break;
        }
        case "content.stop": {
          break;
        }
        case "error": {
          break;
        }
        // when to parse the interaction id? it's available in all three event types for interaction it seems...
        case "interaction.complete": {
          if (event.interaction) {
            if (typeof interactionId === "undefined") {
              interactionId = event.interaction.id;
            }
          }
          break;
        }
        case "interaction.start": {
          event.interaction?.id;
          break;
        }
        case "interaction.status_update": {
          // "in_progress" | "requires_action" | "completed" | "failed" | "cancelled" | undefined
          switch (event.status) {
            case "completed": {
              event;
            }
          }
          break;
        }
        default: {
          break;
        }
      }
    }
  }
}
