import type { Message } from "@/generated/client/client.ts";
import type { BufferLike, UserData } from "@/types/index.ts";
import type {
  RawMessageStreamEvent,
  StopReason,
  WebSearchResultBlock
} from "@anthropic-ai/sdk/resources/messages.mjs";
import type {
  Blob,
  FinishReason,
  GenerateContentResponse
} from "@google/genai";
import { AnthropicService } from "@/anthropic/index.ts";
import { GeminiService } from "@/gemini/index.ts";
import { LlamaService } from "@/meta/index.ts";
import { ModelService } from "@/models/index.ts";
import { OpenAIService } from "@/openai/index.ts";
import { R2Instance } from "@/r2-helper/index.ts";
import { v0Service } from "@/vercel/index.ts";
import { WSServer } from "@/ws-server/index.ts";
import { xAIService } from "@/xai/index.ts";
import { Stream } from "@anthropic-ai/sdk/core/streaming.mjs";
import { WebSocket } from "ws";
import type {
  AllModelsUnion,
  AnyEvent,
  AnyEventTypeUnion,
  EventTypeMap,
  Provider
} from "@t3-chat-clone/types";
import { RedisChannels } from "@t3-chat-clone/redis-service";

export class Resolver extends ModelService {
  constructor(
    public wsServer: WSServer,
    private openai: OpenAIService,
    private geminiService: GeminiService,
    private anthropicService: AnthropicService,
    private r2: R2Instance,
    private fastApiUrl: string,
    private Bucket: string,
    private xAIService: xAIService,
    private v0Service: v0Service,
    private llamaService: LlamaService
  ) {
    super();
  }

  public registerAll() {
    this.wsServer.on("typing", this.handleTyping.bind(this));
    this.wsServer.on("ping", this.handlePing.bind(this));
    this.wsServer.on(
      "image_gen_request",
      this.handleImageGenRequest.bind(this)
    );
    this.wsServer.on(
      "asset_upload_request",
      this.handleAssetUploadRequest.bind(this)
    );
    this.wsServer.on("ai_chat_request", this.handleAIChat.bind(this));
  }

  public safeErrMsg(err: unknown) {
    if (err instanceof Error) {
      return err.message;
    } else if (typeof err === "object" && err != null) {
      return JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
    } else if (typeof err === "string") {
      return err;
    } else if (typeof err === "number") {
      return err.toPrecision(5);
    } else if (typeof err === "boolean") {
      return `${err}`;
    } else return String(err);
  }

  private formatProvider(provider?: Provider) {
    switch (provider) {
      case "anthropic":
        return "Anthropic";
      case "gemini":
        return "Gemini";
      case "grok":
        return "Grok";
      case "meta":
        return "Meta";
      case "vercel":
        return "Vercel";
      case "openai":
      default:
        return "OpenAI";
    }
  }

  public sanitizeTitle = (generatedTitle: string) => {
    return generatedTitle.trim().replace(/^(['"])(.*?)\1$/, "$2");
  };

  private async titleGenUtil({
    prompt,
    provider
  }: EventTypeMap["ai_chat_request"]) {
    const openai = this.openai.getClient();
    try {
      const turbo = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        store: false,
        messages: [
          {
            role: "system",
            content: `Generate a concise, descriptive title (max 10 words) for this user-submitted-prompt: "${prompt}". Do **not** wrap the generated title in quotes.`
          }
        ]
      });
      const title =
        turbo.choices?.[0]?.message?.content ?? this.formatProvider(provider);

      return this.sanitizeTitle(title);
    } catch (err) {
      console.warn(err);
    }
  }

  public handleLatLng(latlng?: string) {
    const [lat, lng] = latlng
      ? (latlng?.split(",")?.map(p => {
          return Number.parseFloat(p);
        }) as [number, number])
      : [47.7749, -122.4194];
    return [lat, lng] as const;
  }

  public async handleAIChat(
    event: EventTypeMap["ai_chat_request"],
    ws: WebSocket,
    userId: string,
    userData?: UserData
  ) {
    const provider = event?.provider ?? "openai";
    const model = this.getModel(
      provider,
      event?.model as AllModelsUnion | undefined
    );
    const topP = event.topP;

    const temperature = event.temperature;

    const systemPrompt = event.systemPrompt;

    const max_tokens = event.maxTokens;

    const hasProviderConfigured = event.hasProviderConfigured;

    const isDefaultProvider = event.isDefaultProvider;

    const prompt = event.prompt;

    const conversationIdInitial = event.conversationId;

    const res = await this.wsServer.prisma.handleAiChatRequest({
      userId,
      conversationId: conversationIdInitial,
      prompt,
      provider,
      hasProviderConfigured,
      maxTokens: max_tokens,
      isDefaultProvider,
      systemPrompt,
      temperature,
      topP,
      model
    });
    const user_location = {
      type: "approximate",
      city: userData?.city ?? "Barrington",
      country: userData?.country ?? "US",
      region: userData?.region ?? "Illinois",
      timezone: userData?.tz ?? "America/Chicago"
    } as const;
    const [lat, lng] = this.handleLatLng(userData?.latlng);
    //  configure token usage for a given conversation relative to model max context window limits
    const isNewChat = conversationIdInitial.startsWith("new-chat");
    const msgs = res.messages satisfies Message[];
    const conversationId = res.id;
    const apiKey = res.apiKey ?? undefined;
    const keyId = res.userKeyId;
    const streamChannel = RedisChannels.conversationStream(conversationId);
    const userChannel = RedisChannels.user(userId);
    const existingState =
      await this.wsServer.redis.getStreamState(conversationId);

    let chunks = Array.of<string>();
    let thinkingChunks = Array.of<string>();
    // TODO handle thinkingChunks and nonThinkingChunks into allChunks for resumable streaming with high specificity
    // let allChunks = Array.of<string>();
    let resumedFromChunk = 0;

    let thinkingAgg = "",
      thinkingDuration = 0;

    const title = res?.title ?? (await this.titleGenUtil(event));

    if (existingState && !existingState.metadata.completed) {
      chunks = existingState.chunks;
      resumedFromChunk = chunks.length;

      // Send resume event
      void this.wsServer.redis.publishTypedEvent(
        streamChannel,
        "stream:resumed",
        {
          type: "stream:resumed",
          conversationId,
          resumedAt: resumedFromChunk,
          chunks,
          title: existingState.metadata.title,
          model: existingState.metadata.model,
          provider: existingState.metadata.provider
        }
      );

      // Send the accumulated chunks as a single ai_chat_chunk to catch up
      ws.send(
        JSON.stringify({
          type: "ai_chat_chunk",
          conversationId,
          userId,
          chunk: chunks.join(""),
          thinkingText: thinkingAgg,
          thinkingDuration,
          done: false,
          model: existingState.metadata.model,
          provider: existingState.metadata.provider as Provider,
          title: existingState.metadata.title,
          systemPrompt,
          temperature,
          topP
        } satisfies EventTypeMap["ai_chat_chunk"])
      );
    }

    if (event.conversationId === "new-chat") {
      void this.wsServer.redis.publishTypedEvent(
        userChannel,
        "conversation:created",
        {
          type: "conversation:created",
          conversationId,
          userId,
          title: title ?? "New Chat",
          timestamp: res.createdAt.getTime() ?? Date.now()
        }
      );
    }

    if (hasProviderConfigured) {
      console.log(`key looked up for ${provider}, ${keyId ?? "no key"}`);
    }
    try {
      if (provider === "gemini") {
        // Initialize Anthropic thinking tracking
        let geminiThinkingStartTime: number | null = null,
          geminiThinkingDuration = 0,
          geminiIsCurrentlyThinking = false,
          geminiThinkingAgg = "",
          geminiAgg = "";

        const { history, systemInstruction } =
          this.geminiService.getHistoryAndInstruction(
            isNewChat,
            msgs,
            systemPrompt
          );

        const gemini = this.geminiService.getClient(apiKey);

        const chat = gemini.chats.create({
          model: model,
          history
        });
        const longitude = lng ?? -122.4194,
          latitude = lat ?? 47.7749;

        const stream = (await chat.sendMessageStream({
          message: prompt,
          config: {
            temperature,
            maxOutputTokens: max_tokens,
            tools: [{ googleSearch: {} }, { urlContext: {} }],
            toolConfig: {
              retrievalConfig: {
                latLng: {
                  latitude,
                  longitude
                }
              }
            },
            topP,
            thinkingConfig: { includeThoughts: true, thinkingBudget: -1 },
            systemInstruction
          }
        })) satisfies AsyncGenerator<GenerateContentResponse>;

        for await (const chunk of stream) {
          // Gemini thinking chunks _always_ start with **TEXT** -- use regex to detect when thinking starts/stops at the onset of streaming
          // eg, const isThinkingRegex = /^\s*\*\*.+\*\*\s*$/;

          let dataPart: Blob | undefined = undefined;
          let textPart: string | undefined = undefined;
          let thinkingPart: string | undefined = undefined;
          let done: keyof typeof FinishReason | undefined = undefined;

          if (chunk.candidates) {
            for (const candidate of chunk.candidates) {
              if (candidate.content?.parts) {
                for (const part of candidate.content.parts) {
                  if (part.text) {
                    if (part.thought) {
                      geminiIsCurrentlyThinking = part.thought;
                      thinkingPart = part.text;
                    } else {
                      geminiIsCurrentlyThinking = part.thought ?? false;
                      textPart = part.text;
                    }
                  }
                  if (part.inlineData) {
                    dataPart = part.inlineData;
                  }
                }
              }

              if (candidate.finishReason) {
                done = candidate.finishReason;
              }
            }
          }
          if (geminiIsCurrentlyThinking && thinkingPart) {
            // Track thinking start time
            if (
              !geminiIsCurrentlyThinking &&
              geminiThinkingStartTime === null
            ) {
              geminiThinkingStartTime = performance.now();
              geminiIsCurrentlyThinking = true;
            }

            thinkingChunks.push(thinkingPart);
            geminiThinkingAgg += thinkingPart;

            ws.send(
              JSON.stringify({
                type: "ai_chat_chunk",
                conversationId,
                userId,
                model,
                title,
                systemPrompt,
                isThinking: geminiIsCurrentlyThinking,
                temperature,
                topP,
                provider,
                thinkingDuration: geminiThinkingStartTime
                  ? performance.now() - geminiThinkingStartTime
                  : undefined,
                thinkingText: thinkingPart,
                done: false
              } satisfies EventTypeMap["ai_chat_chunk"])
            );

            void this.wsServer.redis.publishTypedEvent(
              streamChannel,
              "ai_chat_chunk",
              {
                type: "ai_chat_chunk",
                conversationId,
                userId,
                model,
                title,
                systemPrompt,
                temperature,
                topP,
                provider,
                isThinking: geminiIsCurrentlyThinking,
                thinkingDuration: geminiThinkingStartTime
                  ? performance.now() - geminiThinkingStartTime
                  : undefined,
                thinkingText: thinkingPart,
                done: false
              }
            );
            if (chunks.length % 10 === 0) {
              void this.wsServer.redis.saveStreamState(conversationId, chunks, {
                model,
                provider,
                title,
                totalChunks: chunks.length,
                completed: false,
                systemPrompt,
                temperature,
                topP
              });
            }
          }
          if (textPart) {
            // Track thinking end time when transitioning from thinking to regular text
            if (geminiIsCurrentlyThinking && geminiThinkingStartTime !== null) {
              const thinkingEndTime = performance.now();
              geminiThinkingDuration = Math.round(
                thinkingEndTime - geminiThinkingStartTime
              );
              geminiIsCurrentlyThinking = false;
            }

            chunks.push(textPart);
            geminiAgg += textPart;

            ws.send(
              JSON.stringify({
                type: "ai_chat_chunk",
                conversationId,
                userId,
                model,
                title,
                systemPrompt,
                isThinking: geminiIsCurrentlyThinking,
                temperature,
                topP,
                provider,
                thinkingText: geminiThinkingAgg,
                chunk: textPart,
                thinkingDuration:
                  geminiThinkingDuration > 0
                    ? geminiThinkingDuration
                    : undefined,
                done: false
              } satisfies EventTypeMap["ai_chat_chunk"])
            );

            void this.wsServer.redis.publishTypedEvent(
              streamChannel,
              "ai_chat_chunk",
              {
                type: "ai_chat_chunk",
                conversationId,
                userId,
                model,
                title,
                isThinking: geminiIsCurrentlyThinking,
                systemPrompt,
                temperature,
                topP,
                thinkingText: geminiThinkingAgg,
                provider,
                thinkingDuration:
                  geminiThinkingDuration > 0
                    ? geminiThinkingDuration
                    : undefined,
                chunk: textPart,
                done: false
              }
            );
            if (chunks.length % 10 === 0) {
              void this.wsServer.redis.saveStreamState(conversationId, chunks, {
                model,
                provider,
                title,
                totalChunks: chunks.length,
                completed: false,
                systemPrompt,
                temperature,
                topP
              });
            }
          }
          if (dataPart?.data && dataPart?.mimeType) {
            const _dataUrl =
              `data:${dataPart.mimeType};base64,${dataPart.data}` as const;
            ws.send(
              JSON.stringify({
                type: "ai_chat_inline_data",
                conversationId,
                data: _dataUrl,
                userId,
                done: false,
                model,
                chunk: geminiAgg,
                systemPrompt,
                temperature,
                title,
                topP,
                provider
              } satisfies EventTypeMap["ai_chat_inline_data"])
            );
          }
          if (done) {
            void this.wsServer.prisma.handleAiChatResponse({
              chunk: geminiAgg,
              conversationId,
              done: true,
              title,
              provider,
              userId,
              systemPrompt,
              temperature,
              topP,
              model,
              thinkingText: geminiThinkingAgg,
              thinkingDuration:
                geminiThinkingDuration > 0 ? geminiThinkingDuration : undefined
            });
            ws.send(
              JSON.stringify({
                type: "ai_chat_response",
                conversationId,
                userId,
                model,
                systemPrompt,
                temperature,
                title,
                topP,
                provider,
                chunk: geminiAgg,
                thinkingText: geminiThinkingAgg,
                thinkingDuration:
                  geminiThinkingDuration > 0
                    ? geminiThinkingDuration
                    : undefined,
                done: true
              } satisfies EventTypeMap["ai_chat_response"])
            );
            void this.wsServer.redis.publishTypedEvent(
              streamChannel,
              "ai_chat_response",
              {
                type: "ai_chat_response",
                conversationId,
                userId,
                systemPrompt,
                temperature,
                thinkingDuration: geminiThinkingDuration,
                title,
                topP,
                thinkingText: geminiThinkingAgg,
                provider,
                model,
                chunk: geminiAgg,
                done: true
              }
            );
            // Clear saved state on successful completion
            void this.wsServer.redis.del(`stream:state:${conversationId}`);
            break;
          }
        }
      } else if (provider === "anthropic") {
        // Initialize Anthropic thinking tracking
        let anthropicThinkingStartTime: number | null = null;
        let anthropicThinkingDuration = 0;
        let anthropicIsCurrentlyThinking = false;
        let anthropicThinkingAgg = "";
        let anthropicAgg = "";

        const anthropic = this.anthropicService.getClient(apiKey ?? undefined);

        const { messages, system } =
          this.anthropicService.formatAnthropicHistory(
            isNewChat,
            msgs,
            prompt,
            systemPrompt
          );

        const { max_tokens, thinking } =
          this.anthropicService.handleMaxTokensAndThinking(
            model,
            event.maxTokens
          );

        const stream = (await anthropic.messages.create(
          {
            max_tokens,
            stream: true,
            thinking,
            top_p: topP,
            temperature,
            system,
            model,
            messages,
            tools: [
              {
                type: "web_search_20250305",
                name: "web_search",
                max_uses: 5,
                user_location
              }
            ]
          },
          { stream: true }
        )) satisfies Stream<RawMessageStreamEvent> & {
          _request_id?: string | null;
        };

        for await (const chunk of stream) {
          let text: string | undefined = undefined;
          let thinkingText: string | undefined = undefined;
          let done: StopReason | null = null;
          if (chunk.type === "content_block_start") {
            if (chunk.content_block.type === "web_search_tool_result") {
              if ("error" in chunk.content_block.content) {
                console.log(chunk.content_block.content);
              }
              (chunk.content_block.content as WebSearchResultBlock[]).map(v => {
                text = `[${v.title}](${v.url})`;
              });
            }
          }
          if (chunk.type === "content_block_delta") {
            if (chunk.delta.type === "thinking_delta") {
              thinkingText = chunk.delta.thinking;

              // Track thinking start
              if (
                !anthropicIsCurrentlyThinking &&
                anthropicThinkingStartTime === null
              ) {
                anthropicThinkingStartTime = performance.now();
                anthropicIsCurrentlyThinking = true;
              }
            }
            if (chunk.delta.type === "text_delta") {
              text = chunk.delta.text;

              // Track thinking end when switching to regular text
              if (
                anthropicIsCurrentlyThinking &&
                anthropicThinkingStartTime !== null
              ) {
                const endTime = performance.now();
                anthropicThinkingDuration = Math.round(
                  endTime - anthropicThinkingStartTime
                );
                anthropicIsCurrentlyThinking = false;
              }
            }
            if (chunk.delta.type === "citations_delta") {
              console.log(chunk.delta.citation);
            }
          } else if (chunk.type === "message_delta") {
            done = chunk.delta.stop_reason;
          }

          // Handle thinking chunks
          if (thinkingText) {
            anthropicThinkingAgg += thinkingText;
            thinkingChunks.push(thinkingText);

            ws.send(
              JSON.stringify({
                type: "ai_chat_chunk",
                conversationId,
                userId,
                provider,
                title,
                model,
                systemPrompt,
                temperature,
                topP,
                thinkingText: thinkingText,
                thinkingDuration: anthropicThinkingStartTime
                  ? performance.now() - anthropicThinkingStartTime
                  : undefined,
                isThinking: true,
                done: false
              } satisfies EventTypeMap["ai_chat_chunk"])
            );

            void this.wsServer.redis.publishTypedEvent(
              streamChannel,
              "ai_chat_chunk",
              {
                type: "ai_chat_chunk",
                conversationId,
                userId,
                model,
                thinkingDuration: anthropicThinkingStartTime
                  ? performance.now() - anthropicThinkingStartTime
                  : undefined,
                title,
                systemPrompt,
                temperature,
                topP,
                provider,
                thinkingText: thinkingText,
                isThinking: true,
                done: false
              }
            );
          }

          // Handle regular text chunks
          if (text) {
            anthropicAgg += text;
            chunks.push(text);
            ws.send(
              JSON.stringify({
                type: "ai_chat_chunk",
                conversationId,
                userId,
                provider,
                title,
                model,
                systemPrompt,
                temperature,
                topP,
                chunk: text,
                isThinking: false,
                thinkingDuration:
                  anthropicThinkingDuration > 0
                    ? anthropicThinkingDuration
                    : undefined,
                done: false
              } satisfies EventTypeMap["ai_chat_chunk"])
            );
            void this.wsServer.redis.publishTypedEvent(
              streamChannel,
              "ai_chat_chunk",
              {
                type: "ai_chat_chunk",
                conversationId,
                userId,
                model,
                title,
                systemPrompt,
                temperature,
                topP,
                provider,
                thinkingText:
                  anthropicThinkingAgg.length > 0
                    ? anthropicThinkingAgg
                    : undefined,
                thinkingDuration:
                  anthropicThinkingDuration > 0
                    ? anthropicThinkingDuration
                    : undefined,

                chunk: text,
                done: false
              }
            );
            if (chunks.length % 10 === 0) {
              void this.wsServer.redis.saveStreamState(conversationId, chunks, {
                model,
                provider,
                title,
                totalChunks: chunks.length,
                completed: false,
                systemPrompt,
                temperature,
                topP
              });
            }
          }

          if (done) {
            void this.wsServer.prisma.handleAiChatResponse({
              chunk: anthropicAgg,
              conversationId,
              done: true,
              title,
              temperature,
              topP,
              provider,
              userId,
              systemPrompt,
              model,
              thinkingText:
                anthropicThinkingAgg.length > 0
                  ? anthropicThinkingAgg
                  : undefined,
              thinkingDuration:
                anthropicThinkingDuration > 0
                  ? anthropicThinkingDuration
                  : undefined
            });
            ws.send(
              JSON.stringify({
                type: "ai_chat_response",
                conversationId,
                userId,
                provider,
                model,
                title,
                systemPrompt,
                temperature,
                topP,
                chunk: anthropicAgg,
                thinkingText: anthropicThinkingAgg || undefined,
                thinkingDuration:
                  anthropicThinkingDuration > 0
                    ? anthropicThinkingDuration
                    : undefined,
                done: true
              } satisfies EventTypeMap["ai_chat_response"])
            );
            void this.wsServer.redis.publishTypedEvent(
              streamChannel,
              "ai_chat_response",
              {
                type: "ai_chat_response",
                conversationId,
                userId,
                systemPrompt,
                temperature,
                title,
                topP,
                provider,
                thinkingText: anthropicThinkingAgg || undefined,
                thinkingDuration:
                  anthropicThinkingDuration > 0
                    ? anthropicThinkingDuration
                    : undefined,
                model,
                chunk: anthropicAgg,
                done: true
              }
            );
            // Clear saved state on successful completion
            void this.wsServer.redis.del(`stream:state:${conversationId}`);
            break;
          }
        }
      } else if (provider === "vercel") {
        await this.v0Service.handleV0AiChatRequest({
          chunks,
          conversationId,
          isNewChat,
          keyId,
          msgs,
          prompt,
          streamChannel,
          thinkingChunks,
          userId,
          ws,
          apiKey,
          max_tokens,
          model,
          systemPrompt,
          temperature,
          title,
          topP
        });
        // let v0ThinkingStartTime: number | null = null,
        //   v0ThinkingDuration = 0,
        //   v0IsCurrentlyThinking = false,
        //   v0ThinkingAgg = "",
        //   v0Agg = "";

        // const streamer = this.v0Service.stream(
        //   model,
        //   this.v0Service.v0Format(isNewChat, msgs, prompt, systemPrompt),
        //   apiKey ?? undefined,
        //   { max_tokens, top_p: topP, temperature }
        // );

        // for await (const chunk of streamer) {
        //   // Process each choice in the chunk
        //   let text: string | undefined = undefined,
        //     thinkingText: string | undefined = undefined,
        //     done: boolean | undefined = undefined,
        //     usage: v0Usage | undefined = undefined;
        //   // usage only appears in the very last chunk streamed in
        //   if ("usage" in chunk && typeof chunk.usage !== "undefined") {
        //     done = true;
        //     usage = chunk.usage;
        //   }

        //   if (chunk?.choices) {
        //     for (const choice of chunk.choices) {
        //       if (
        //         "reasoning_content" in choice.delta &&
        //         typeof choice.delta.reasoning_content !== "undefined"
        //       ) {
        //         if (typeof v0ThinkingStartTime !== "number") {
        //           v0ThinkingStartTime = performance.now();
        //         }
        //         if (v0IsCurrentlyThinking === false) {
        //           v0IsCurrentlyThinking = true;
        //         }
        //         thinkingText = choice.delta.reasoning_content;
        //       }
        //       if (
        //         "content" in choice.delta &&
        //         typeof choice.delta.content !== "undefined"
        //       ) {
        //         if (v0IsCurrentlyThinking === true && v0ThinkingStartTime) {
        //           v0IsCurrentlyThinking = false;
        //           const endThinkingTime = performance.now();
        //           v0ThinkingDuration = Math.round(
        //             endThinkingTime - v0ThinkingStartTime
        //           );
        //         }
        //         text = choice.delta.content;
        //       }
        //     }
        //   }
        //   if (thinkingText && v0IsCurrentlyThinking) {
        //     if (thinkingText.startsWith(v0ThinkingAgg)) {
        //       v0ThinkingAgg = thinkingText;
        //     } else {
        //       v0ThinkingAgg += thinkingText;
        //       thinkingChunks.push(thinkingText);
        //     }
        //     ws.send(
        //       JSON.stringify({
        //         type: "ai_chat_chunk",
        //         conversationId,
        //         userId,
        //         title,
        //         provider,
        //         systemPrompt,
        //         temperature,
        //         thinkingText: thinkingText,
        //         isThinking: v0IsCurrentlyThinking,
        //         thinkingDuration: v0ThinkingStartTime
        //           ? performance.now() - v0ThinkingStartTime
        //           : undefined,
        //         topP,
        //         model,
        //         done: false
        //       } satisfies EventTypeMap["ai_chat_chunk"])
        //     );

        //     void this.wsServer.redis.publishTypedEvent(
        //       streamChannel,
        //       "ai_chat_chunk",
        //       {
        //         type: "ai_chat_chunk",
        //         conversationId,
        //         userId,
        //         model,
        //         title,
        //         isThinking: v0IsCurrentlyThinking,
        //         thinkingDuration: v0ThinkingStartTime
        //           ? performance.now() - v0ThinkingStartTime
        //           : undefined,
        //         thinkingText: thinkingText,
        //         systemPrompt,
        //         temperature,
        //         topP,
        //         provider,
        //         chunk: text,
        //         done: false
        //       }
        //     );

        //     if (chunks.length % 10 === 0) {
        //       void this.wsServer.redis.saveStreamState(conversationId, chunks, {
        //         model,
        //         provider,
        //         title,
        //         totalChunks: chunks.length,
        //         completed: false,
        //         systemPrompt,
        //         temperature,
        //         topP
        //       });
        //     }
        //   }
        //   if (text) {
        //     chunks.push(text);
        //     v0Agg += text;

        //     ws.send(
        //       JSON.stringify({
        //         type: "ai_chat_chunk",
        //         conversationId,
        //         userId,
        //         title,
        //         provider,
        //         systemPrompt,
        //         temperature,
        //         thinkingDuration:
        //           v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined,
        //         isThinking: v0IsCurrentlyThinking,
        //         thinkingText: v0ThinkingAgg,
        //         topP,
        //         model,
        //         chunk: text,
        //         done: false
        //       } satisfies EventTypeMap["ai_chat_chunk"])
        //     );

        //     void this.wsServer.redis.publishTypedEvent(
        //       streamChannel,
        //       "ai_chat_chunk",
        //       {
        //         type: "ai_chat_chunk",
        //         conversationId,
        //         userId,
        //         model,
        //         title,
        //         thinkingDuration:
        //           v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined,
        //         isThinking: v0IsCurrentlyThinking,
        //         thinkingText: v0ThinkingAgg,
        //         systemPrompt,
        //         temperature,
        //         topP,
        //         provider,
        //         chunk: text,
        //         done: false
        //       }
        //     );

        //     if (chunks.length % 10 === 0) {
        //       void this.wsServer.redis.saveStreamState(conversationId, chunks, {
        //         model,
        //         provider,
        //         title,
        //         totalChunks: chunks.length,
        //         completed: false,
        //         systemPrompt,
        //         temperature,
        //         topP
        //       });
        //     }
        //   }

        //   // Check if stream is finished
        //   if (done) {
        //     void this.wsServer.prisma.handleAiChatResponse({
        //       chunk: v0Agg,
        //       conversationId,
        //       done,
        //       provider,
        //       title,
        //       userId,
        //       model,
        //       systemPrompt,
        //       thinkingDuration:
        //         v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined,
        //       thinkingText: v0ThinkingAgg,
        //       temperature,
        //       usage: usage?.total_tokens,
        //       topP
        //     });

        //     ws.send(
        //       JSON.stringify({
        //         type: "ai_chat_response",
        //         conversationId,
        //         userId,
        //         provider,
        //         systemPrompt,
        //         thinkingDuration:
        //           v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined,
        //         thinkingText: v0ThinkingAgg,
        //         title,
        //         temperature,
        //         topP,
        //         model,
        //         usage: usage?.total_tokens,
        //         chunk: v0Agg,
        //         done
        //       } satisfies EventTypeMap["ai_chat_response"])
        //     );

        //     void this.wsServer.redis.publishTypedEvent(
        //       streamChannel,
        //       "ai_chat_response",
        //       {
        //         type: "ai_chat_response",
        //         conversationId,
        //         userId,
        //         systemPrompt,
        //         temperature,
        //         title,
        //         thinkingDuration:
        //           v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined,
        //         thinkingText: v0ThinkingAgg,
        //         topP,
        //         usage: usage?.total_tokens,
        //         provider,
        //         model,
        //         chunk: v0Agg,
        //         done
        //       }
        //     );

        //     // Clear saved state on successful completion
        //     void this.wsServer.redis.del(`stream:state:${conversationId}`);
        //     break;
        // }
        // }
      } else if (provider === "meta") {
        let metaAgg = "";
        const client = this.llamaService.llamaClient(apiKey ?? undefined);
        const stream = await client.chat.completions.create(
          {
            user: userId,
            top_p: topP,
            temperature,
            model,
            max_completion_tokens: max_tokens,
            messages: this.llamaService.llamaFormat(
              isNewChat,
              msgs,
              prompt,
              systemPrompt
            ),
            stream: true
          },
          { stream: true }
        );

        for await (const chunk of stream) {
          let text: string | undefined = undefined;
          let finish_reason:
            | null
            | "length"
            | "stop"
            | "tool_calls"
            | "content_filter"
            | "function_call" = null;

          if (chunk.event.delta.type === "text") {
            text = chunk.event.delta.text;
          }
          if (chunk.event.event_type === "complete") {
            finish_reason = "stop";
          }

          if (text) {
            chunks.push(text);
            metaAgg += text;
            ws.send(
              JSON.stringify({
                type: "ai_chat_chunk",
                conversationId,
                userId,
                title,
                provider,
                systemPrompt,
                temperature,
                topP,
                model,
                chunk: text,
                done: false
              } satisfies EventTypeMap["ai_chat_chunk"])
            );
            void this.wsServer.redis.publishTypedEvent(
              streamChannel,
              "ai_chat_chunk",
              {
                type: "ai_chat_chunk",
                conversationId,
                userId,
                model,
                title,
                systemPrompt,
                temperature,
                topP,
                provider,
                chunk: text,
                done: false
              }
            );
            if (chunks.length % 10 === 0) {
              void this.wsServer.redis.saveStreamState(conversationId, chunks, {
                model,
                provider,
                title,
                totalChunks: chunks.length,
                completed: false,
                systemPrompt,
                temperature,
                topP
              });
            }
          }

          if (finish_reason != null) {
            void this.wsServer.prisma.handleAiChatResponse({
              chunk: metaAgg,
              systemPrompt,
              temperature,
              topP,
              conversationId,
              done: true,
              provider,
              title,
              userId,
              model
            });
            ws.send(
              JSON.stringify({
                type: "ai_chat_response",
                conversationId,
                userId,
                provider,
                systemPrompt,
                title,
                temperature,
                topP,
                model,
                chunk: metaAgg,
                done: true
              } satisfies EventTypeMap["ai_chat_response"])
            );
            void this.wsServer.redis.publishTypedEvent(
              streamChannel,
              "ai_chat_response",
              {
                type: "ai_chat_response",
                conversationId,
                userId,
                systemPrompt,
                temperature,
                title,
                topP,
                provider,
                model,
                chunk: metaAgg,
                done: true
              }
            );
            // Clear saved state on successful completion
            void this.wsServer.redis.del(`stream:state:${conversationId}`);
            break;
          }
        }
      } else if (provider === "grok") {
        let xAiThinkingStartTime: number | null = null,
          xAiThinkingDuration = 0,
          xAiIsCurrentlyThinking = false,
          xAiThinkingAgg = "",
          xaiAgg = "";

        const xAi = this.xAIService.xAIClient(apiKey ?? undefined);

        const { messages, system } = this.xAIService.xAiFormatHistory(
          isNewChat,
          msgs,
          prompt,
          systemPrompt
        );

        const { max_tokens, thinking } =
          this.xAIService.handleMaxTokensAndThinking(model, event.maxTokens);

        const stream = (await xAi.messages.create(
          {
            max_tokens,
            stream: true,
            thinking,
            top_p: topP,
            temperature,
            system,
            model,
            messages
          },
          { stream: true }
        )) satisfies Stream<RawMessageStreamEvent> & {
          _request_id?: string | null;
        };

        for await (const chunk of stream) {
          let text: string | undefined = undefined;
          let thinkingText: string | undefined = undefined;
          let done: StopReason | null = null;
          if (chunk.type === "content_block_start") {
            if (chunk.content_block.type === "web_search_tool_result") {
              if ("error" in chunk.content_block.content) {
                console.log(chunk.content_block.content);
              }
              (chunk.content_block.content as WebSearchResultBlock[]).map(v => {
                text = `[${v.title}](${v.url})`;
              });
            }
          }
          if (chunk.type === "content_block_delta") {
            if (chunk.delta.type === "thinking_delta") {
              thinkingText = chunk.delta.thinking;

              // Track thinking start
              if (!xAiIsCurrentlyThinking && xAiThinkingStartTime === null) {
                xAiThinkingStartTime = performance.now();
                xAiIsCurrentlyThinking = true;
              }
            }
            if (chunk.delta.type === "text_delta") {
              text = chunk.delta.text;

              // Track thinking end when switching to regular text
              if (xAiIsCurrentlyThinking && xAiThinkingStartTime !== null) {
                const endTime = performance.now();
                xAiThinkingDuration = Math.round(
                  endTime - xAiThinkingStartTime
                );
                xAiIsCurrentlyThinking = false;
              }
            }
            if (chunk.delta.type === "citations_delta") {
              console.log(chunk.delta.citation);
            }
          } else if (chunk.type === "message_delta") {
            done = chunk.delta.stop_reason;
          }

          // Handle thinking chunks
          if (thinkingText) {
            xAiThinkingAgg += thinkingText;
            thinkingChunks.push(thinkingText);

            ws.send(
              JSON.stringify({
                type: "ai_chat_chunk",
                conversationId,
                userId,
                provider,
                title,
                model,
                systemPrompt,
                temperature,
                topP,
                thinkingText: thinkingText,
                thinkingDuration: xAiThinkingStartTime
                  ? performance.now() - xAiThinkingStartTime
                  : undefined,
                isThinking: true,
                done: false
              } satisfies EventTypeMap["ai_chat_chunk"])
            );

            void this.wsServer.redis.publishTypedEvent(
              streamChannel,
              "ai_chat_chunk",
              {
                type: "ai_chat_chunk",
                conversationId,
                userId,
                model,
                thinkingDuration: xAiThinkingStartTime
                  ? performance.now() - xAiThinkingStartTime
                  : undefined,
                title,
                systemPrompt,
                temperature,
                topP,
                provider,
                thinkingText: thinkingText,
                isThinking: true,
                done: false
              }
            );
          }

          // Handle regular text chunks
          if (text) {
            xaiAgg += text;
            chunks.push(text);
            ws.send(
              JSON.stringify({
                type: "ai_chat_chunk",
                conversationId,
                userId,
                provider,
                title,
                model,
                systemPrompt,
                temperature,
                topP,
                chunk: text,
                isThinking: xAiIsCurrentlyThinking,
                thinkingDuration:
                  xAiThinkingDuration > 0 ? xAiThinkingDuration : undefined,
                done: false
              } satisfies EventTypeMap["ai_chat_chunk"])
            );
            void this.wsServer.redis.publishTypedEvent(
              streamChannel,
              "ai_chat_chunk",
              {
                type: "ai_chat_chunk",
                conversationId,
                userId,
                model,
                title,
                systemPrompt,
                temperature,
                isThinking: xAiIsCurrentlyThinking,
                topP,
                provider,
                thinkingText:
                  xAiThinkingAgg.length > 0 ? xAiThinkingAgg : undefined,
                thinkingDuration:
                  xAiThinkingDuration > 0 ? xAiThinkingDuration : undefined,

                chunk: text,
                done: false
              }
            );
            if (chunks.length % 10 === 0) {
              void this.wsServer.redis.saveStreamState(conversationId, chunks, {
                model,
                provider,
                title,
                totalChunks: chunks.length,
                completed: false,
                systemPrompt,
                temperature,
                topP
              });
            }
          }

          if (done) {
            void this.wsServer.prisma.handleAiChatResponse({
              chunk: xaiAgg,
              conversationId,
              done: true,
              title,
              temperature,
              topP,
              provider,
              userId,
              systemPrompt,
              model,
              thinkingText:
                xAiThinkingAgg.length > 0 ? xAiThinkingAgg : undefined,
              thinkingDuration:
                xAiThinkingDuration > 0 ? xAiThinkingDuration : undefined
            });
            ws.send(
              JSON.stringify({
                type: "ai_chat_response",
                conversationId,
                userId,
                provider,
                model,
                title,
                systemPrompt,
                temperature,
                topP,
                chunk: xaiAgg,
                thinkingText: xAiThinkingAgg || undefined,
                thinkingDuration:
                  xAiThinkingDuration > 0 ? xAiThinkingDuration : undefined,
                done: true
              } satisfies EventTypeMap["ai_chat_response"])
            );
            void this.wsServer.redis.publishTypedEvent(
              streamChannel,
              "ai_chat_response",
              {
                type: "ai_chat_response",
                conversationId,
                userId,
                systemPrompt,
                temperature,
                thinkingText: xAiThinkingAgg,
                thinkingDuration: xAiThinkingDuration,
                title,
                topP,
                provider,
                model,
                chunk: xaiAgg,
                done: true
              }
            );
            // Clear saved state on successful completion
            void this.wsServer.redis.del(`stream:state:${conversationId}`);
            break;
          }
        }
      } else {
        let openaiThinkingStartTime: number | null = null,
          openaiThinkingDuration = 0,
          openaiIsCurrentlyThinking = false,
          openaiThinkingAgg = "",
          openaiAgg = "";

        const client = this.openai.getClient(apiKey ?? undefined);

        const responsesStream = await client.responses.create({
          stream: true,
          input: this.openai.formatOpenAi(isNewChat, msgs, prompt),
          instructions: this.openai.buildInstructions(systemPrompt),
          store: false,
          model,
          temperature,
          max_output_tokens: max_tokens,
          top_p: topP,
          truncation: "auto",
          parallel_tool_calls: true,
          tools: [
            {
              type: "web_search_preview",
              user_location
            }
          ]
        });

        for await (const s of responsesStream) {
          let text: string | undefined = undefined;
          let thinkingText: string | undefined = undefined;
          let done = false;
          // s.type as ResponseStreamEvent['type'];
          if (
            s.type === "response.reasoning_text.delta" ||
            s.type === "response.reasoning_summary_text.delta"
          ) {
            if (
              !openaiIsCurrentlyThinking &&
              openaiThinkingStartTime === null
            ) {
              openaiIsCurrentlyThinking = true;
              openaiThinkingStartTime = performance.now();
            }

            thinkingText = s.delta;
          }
          if (
            (s.type === "response.reasoning_summary_text.done" ||
              s.type === "response.reasoning_text.done") &&
            openaiIsCurrentlyThinking &&
            openaiThinkingStartTime !== null
          ) {
            openaiIsCurrentlyThinking = false;
            openaiThinkingDuration = Math.round(
              performance.now() - openaiThinkingStartTime
            );
          }
          if (s.type === "response.output_text.delta") {
            text = s.delta;
          }
          if (s.type === "response.output_text.done") {
            done = true;
          }

          if (thinkingText) {
            openaiThinkingAgg += thinkingText;
            thinkingChunks.push(thinkingText);

            ws.send(
              JSON.stringify({
                type: "ai_chat_chunk",
                conversationId,
                done: false,
                userId,
                model,
                provider,
                systemPrompt,
                temperature,
                title,
                topP,
                thinkingText: thinkingText,
                thinkingDuration: openaiThinkingStartTime
                  ? performance.now() - openaiThinkingStartTime
                  : undefined,
                isThinking: true
              } satisfies EventTypeMap["ai_chat_chunk"])
            );
            void this.wsServer.redis.publishTypedEvent(
              streamChannel,
              "ai_chat_chunk",
              {
                type: "ai_chat_chunk",
                conversationId,
                userId,
                model,
                thinkingDuration: openaiThinkingStartTime
                  ? performance.now() - openaiThinkingStartTime
                  : undefined,
                title,
                systemPrompt,
                temperature,
                topP,
                provider,
                thinkingText: thinkingText,
                isThinking: true,
                done: false
              }
            );
          } // Handle regular text chunks
          if (text) {
            openaiAgg += text;
            chunks.push(text);
            ws.send(
              JSON.stringify({
                type: "ai_chat_chunk",
                conversationId,
                userId,
                provider,
                title,
                model,
                systemPrompt,
                temperature,
                topP,
                chunk: text,
                isThinking: openaiIsCurrentlyThinking,
                thinkingText:
                  openaiThinkingAgg.length > 0 ? openaiThinkingAgg : undefined,
                thinkingDuration:
                  openaiThinkingDuration > 0
                    ? openaiThinkingDuration
                    : undefined,
                done: false
              } satisfies EventTypeMap["ai_chat_chunk"])
            );
            void this.wsServer.redis.publishTypedEvent(
              streamChannel,
              "ai_chat_chunk",
              {
                type: "ai_chat_chunk",
                conversationId,
                userId,
                model,
                title,
                systemPrompt,
                temperature,
                topP,
                isThinking: openaiIsCurrentlyThinking,
                provider,
                thinkingText:
                  openaiThinkingAgg.length > 0 ? openaiThinkingAgg : undefined,
                thinkingDuration:
                  openaiThinkingDuration > 0
                    ? openaiThinkingDuration
                    : undefined,

                chunk: text,
                done: false
              }
            );
            if (chunks.length % 10 === 0) {
              void this.wsServer.redis.saveStreamState(conversationId, chunks, {
                model,
                provider,
                title,
                totalChunks: chunks.length,
                completed: false,
                systemPrompt,
                temperature,
                topP
              });
            }
          }
          if (done) {
            void this.wsServer.prisma.handleAiChatResponse({
              chunk: openaiAgg,
              conversationId,
              done: true,
              title,
              temperature,
              topP,
              provider,
              userId,
              systemPrompt,
              model,
              thinkingText:
                openaiThinkingAgg.length > 0 ? openaiThinkingAgg : undefined,
              thinkingDuration:
                openaiThinkingDuration > 0 ? openaiThinkingDuration : undefined
            });
            ws.send(
              JSON.stringify({
                type: "ai_chat_response",
                conversationId,
                userId,
                provider,
                model,
                title,
                systemPrompt,
                temperature,
                topP,
                chunk: openaiAgg,
                thinkingText:
                  openaiThinkingAgg.length > 0 ? openaiThinkingAgg : undefined,
                thinkingDuration:
                  openaiThinkingDuration > 0
                    ? openaiThinkingDuration
                    : undefined,
                done: true
              } satisfies EventTypeMap["ai_chat_response"])
            );
            void this.wsServer.redis.publishTypedEvent(
              streamChannel,
              "ai_chat_response",
              {
                type: "ai_chat_response",
                conversationId,
                userId,
                systemPrompt,
                temperature,
                title,
                thinkingText:
                  openaiThinkingAgg.length > 0 ? openaiThinkingAgg : undefined,
                thinkingDuration:
                  openaiThinkingDuration > 0
                    ? openaiThinkingDuration
                    : undefined,
                topP,
                provider,
                model,
                chunk: openaiAgg,
                done: true
              }
            );
            // Clear saved state on successful completion
            void this.wsServer.redis.del(`stream:state:${conversationId}`);
            break;
          }
        }
      }
    } catch (err) {
      console.error(`AI Stream Error`, err);
      ws.send(
        JSON.stringify({
          type: "ai_chat_error",
          provider: provider,
          conversationId,
          model,
          systemPrompt,
          userId,
          done: true,
          message: this.safeErrMsg(err)
        } satisfies EventTypeMap["ai_chat_error"])
      );
      void this.wsServer.redis.publishTypedEvent(
        streamChannel,
        "ai_chat_error",
        {
          type: "ai_chat_error",
          provider,
          conversationId,
          model,
          systemPrompt,
          temperature,
          topP,
          userId,
          done: true,
          message: this.safeErrMsg(err)
        }
      );

      // Save state for potential resume after error
      void this.wsServer.redis.saveStreamState(conversationId, chunks, {
        model,
        provider,
        title,
        totalChunks: chunks.length,
        completed: false,
        systemPrompt,
        temperature,
        topP
      });
    }
  }
  /** Dispatches incoming events to handlers */
  public async handleRawMessage(
    ws: WebSocket,
    userId: string,
    raw: BufferLike,
    userData?: UserData
  ): Promise<void> {
    const event = this.parseEvent(raw);
    if (!event) {
      ws.send(JSON.stringify({ error: "Invalid message" }));
      return;
    }
    switch (event.type) {
      case "typing":
        await this.handleTyping(event, ws, userId);
        break;
      case "ping":
        await this.handlePing(event, ws, userId);
        break;
      case "asset_upload_request":
        await this.handleAssetUploadRequest(event, ws, userId);
        break;
      case "image_gen_request":
        await this.handleImageGenRequest(event, ws, userId);
        break;
      case "ai_chat_request":
        await this.handleAIChat(event, ws, userId, userData);
        break;
      default:
        await this.wsServer.redis.publish(
          this.wsServer.channel,
          JSON.stringify({ event: "never", userId, timestamp: Date.now() })
        );
    }
  }

  public EVENT_TYPES = [
    "typing",
    "ping",
    "image_gen_request",
    "image_gen_response",
    "ai_chat_response",
    "asset_upload_request",
    "asset_upload_response",
    "ai_chat_chunk",
    "ai_chat_request",
    "ai_chat_inline_data",
    "ai_chat_error"
  ] as const satisfies readonly AnyEventTypeUnion[];

  /** Parses a raw WebSocket message into an event */
  private parseEvent(raw: BufferLike): AnyEvent | null {
    let msg: unknown;
    try {
      let str: string;

      if (typeof raw === "string") {
        str = raw;
      } else if (Array.isArray(raw)) {
        str = Buffer.concat(raw).toString();
      } else if (Buffer.isBuffer(raw)) {
        str = raw.toString();
      } else if (raw instanceof ArrayBuffer) {
        str = Buffer.from(raw).toString();
      } else if (raw instanceof DataView) {
        str = Buffer.from(
          raw.buffer,
          raw.byteOffset,
          raw.byteLength
        ).toString();
      } else if (ArrayBuffer.isView(raw)) {
        str = Buffer.from(
          raw.buffer,
          raw.byteOffset,
          raw.byteLength
        ).toString();
      } else if (raw instanceof Blob) {
        console.error("Blob parsing not supported in sync context");
        return null;
      } else if (typeof raw === "number") {
        str = raw.toString();
      } else if (raw && typeof raw === "object") {
        // Handle objects with valueOf() or Symbol.toPrimitive
        if ("valueOf" in raw) {
          const value = raw.valueOf();
          if (typeof value === "string") {
            str = value;
          } else if (value instanceof ArrayBuffer) {
            str = Buffer.from(value).toString();
          } else if (value instanceof Uint8Array) {
            str = Buffer.from(value).toString();
          } else if (Array.isArray(value)) {
            str = Buffer.from(value as number[]).toString();
          } else {
            return null;
          }
        } else if (Symbol.toPrimitive in raw) {
          str = (raw as { [Symbol.toPrimitive](hint: string): string })[
            Symbol.toPrimitive
          ]("string");
        } else {
          return null;
        }
      } else {
        return null;
      }
      msg = JSON.parse(str);
      if (
        typeof msg !== "object" ||
        msg === null ||
        !("type" in msg) ||
        typeof (msg as { type?: unknown }).type !== "string" ||
        !this.EVENT_TYPES.includes(
          (msg as { type: string }).type as AnyEventTypeUnion
        )
      ) {
        return null;
      }
      return msg as AnyEvent;
    } catch {
      console.error("Invalid message received");
      return null;
    }
  }

  public async handleTyping(
    event: EventTypeMap["typing"],
    _ws: WebSocket,
    userId: string
  ): Promise<void> {
    this.wsServer.broadcast("typing", { ...event, userId });
  }

  public async handlePing(
    event: EventTypeMap["ping"],
    ws: WebSocket,
    userId: string
  ): Promise<void> {
    console.log(event.type);
    ws.send(JSON.stringify({ type: "pong", userId }));
  }

  public async handleImageGenRequest(
    event: EventTypeMap["image_gen_request"],
    ws: WebSocket,
    userId: string
  ): Promise<void> {
    try {
      const res = await fetch(this.fastApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: event.prompt,
          seed: event.seed
        })
      });
      if (!res.ok) {
        const errorText = await res.text();
        ws.send(
          JSON.stringify({
            type: "image_gen_response",
            userId,
            conversationId: event.conversationId,
            success: false,
            error: `Image gen failed: ${errorText}`
          } satisfies EventTypeMap["image_gen_response"])
        );
        return;
      }
      const { url } = (await res.json()) as { url: string };
      ws.send(
        JSON.stringify({
          type: "image_gen_response",
          userId,
          conversationId: event.conversationId,
          imageUrl: url,
          success: true
        } satisfies EventTypeMap["image_gen_response"])
      );
    } catch (error) {
      ws.send(
        JSON.stringify({
          type: "image_gen_response",
          userId,
          conversationId: event.conversationId,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        } satisfies EventTypeMap["image_gen_response"])
      );
    }
  }

  public async handleAssetUploadRequest(
    event: EventTypeMap["asset_upload_request"],
    ws: WebSocket,
    userId: string
  ): Promise<void> {
    try {
      const data = Buffer.from(event.base64, "base64");
      const key = `user-assets/${userId}/${Date.now()}_${event.filename}`;
      const url = await this.r2.uploadToR2({
        Key: key,
        Body: data,
        ContentType: event.contentType,
        Bucket: this.Bucket
      });
      ws.send(
        JSON.stringify({
          type: "asset_upload_response",
          userId,
          conversationId: event.conversationId,
          url,
          success: true
        } as EventTypeMap["asset_upload_response"])
      );
    } catch (err) {
      const error = this.safeErrMsg(err);
      ws.send(
        JSON.stringify({
          type: "asset_upload_response",
          userId,
          conversationId: event.conversationId,
          success: false,
          error
        } as EventTypeMap["asset_upload_response"])
      );
    }
  }
}
