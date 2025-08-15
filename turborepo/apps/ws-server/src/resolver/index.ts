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
import type { ResponseStreamEvent } from "openai/resources/responses/responses.mjs";
import { Stream as OpenAIStream } from "openai/core/streaming.mjs";
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
      city: userData?.city,
      country: userData?.country,
      region: userData?.region,
      timezone: userData?.tz
    } as const;
    const [lat, lng] = this.handleLatLng(userData?.latlng);
    //  configure token usage for a given conversation relative to model max context window limits
    const isNewChat = conversationIdInitial.startsWith("new-chat");
    const msgs = res.messages satisfies Message[];
    const conversationId = res.id;

    const streamChannel = RedisChannels.conversationStream(conversationId);
    const userChannel = RedisChannels.user(userId);
    const existingState =
      await this.wsServer.redis.getStreamState(conversationId);

    let chunks = Array.of<string>();
    let thinkingChunks = Array.of<string>();
    let resumedFromChunk = 0;

    let agg = "";
    let thinkingAgg = "";
    let thinkingDuration = 0;
    let thinkingStartTime: number | null = null;
    let thinkingEndTime: number | null = null;
    let isCurrentlyThinking = false;

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
    try {
      if (provider === "gemini") {
        let key: { apiKey: string | null; keyId: string | null } = {
          apiKey: null,
          keyId: null
        };
        if (hasProviderConfigured) {
          key = await this.wsServer.prisma.handleApiKeyLookup(provider, userId);
          console.log(
            `key lookup res for ${provider}, ${key.keyId ?? "no key"}`
          );
        }

        const { history, systemInstruction } =
          this.geminiService.getHistoryAndInstruction(
            isNewChat,
            msgs,
            systemPrompt
          );

        const gemini = this.geminiService.getClient(key.apiKey ?? undefined);

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
          let isThinking = false;
          if (chunk.candidates) {
            for (const candidate of chunk.candidates) {
              if (candidate.content?.parts) {
                for (const part of candidate.content.parts) {
                  if (part.text) {
                    if (part.thought) {
                      isThinking = part.thought;
                      thinkingPart = part.text;
                    } else {
                      isThinking = part.thought ?? false;
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
          if (isThinking && thinkingPart) {
            // Track thinking start time
            if (!isCurrentlyThinking && thinkingStartTime === null) {
              thinkingStartTime = performance.now();
              isCurrentlyThinking = true;
            }

            thinkingChunks.push(thinkingPart);
            thinkingAgg += thinkingPart;

            ws.send(
              JSON.stringify({
                type: "ai_chat_chunk",
                conversationId,
                userId,
                model,
                title,
                systemPrompt,
                isThinking: true,
                temperature,
                topP,
                provider,
                thinkingDuration: thinkingStartTime
                  ? performance.now() - thinkingStartTime
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
                thinkingDuration: thinkingStartTime
                  ? performance.now() - thinkingStartTime
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
            if (isCurrentlyThinking && thinkingStartTime !== null) {
              thinkingEndTime = performance.now();
              thinkingDuration = Math.round(
                thinkingEndTime - thinkingStartTime
              );
              isCurrentlyThinking = false;
            }

            chunks.push(textPart);
            agg += textPart;

            ws.send(
              JSON.stringify({
                type: "ai_chat_chunk",
                conversationId,
                userId,
                model,
                title,
                systemPrompt,
                isThinking,
                temperature,
                topP,
                provider,
                chunk: textPart,
                thinkingDuration:
                  thinkingDuration > 0 ? thinkingDuration : undefined,
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
                thinkingDuration:
                  thinkingDuration > 0 ? thinkingDuration : undefined,
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
              chunk: agg,
              conversationId,
              done: true,
              title,
              provider,
              userId,
              temperature,
              topP,
              model,
              thinkingText: thinkingAgg.length > 0 ? thinkingAgg : undefined,
              thinkingDuration:
                thinkingDuration > 0 ? thinkingDuration : undefined
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
                chunk: agg,
                thinkingText: thinkingAgg.length > 0 ? thinkingAgg : undefined,
                thinkingDuration:
                  thinkingDuration > 0 ? thinkingDuration : undefined,
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
                chunk: agg,
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

        let key: { apiKey: string | null; keyId: string | null } = {
          apiKey: null,
          keyId: null
        };
        if (hasProviderConfigured) {
          key = await this.wsServer.prisma.handleApiKeyLookup(provider, userId);
          console.log(
            `key lookup res for ${provider}, ${key.keyId ?? "no key"}`
          );
        }

        const anthropic = this.anthropicService.getClient(
          key.apiKey ?? undefined
        );

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
            tool_choice: {
              name: "web_search",
              type: "tool",
              disable_parallel_tool_use: false
            },
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
                thinkingDuration: thinkingStartTime
                  ? performance.now() - thinkingStartTime
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
                thinkingDuration: thinkingStartTime
                  ? performance.now() - thinkingStartTime
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
            agg += text;
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
              chunk: agg,
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
                chunk: agg,
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
                model,
                chunk: agg,
                done: true
              }
            );
            // Clear saved state on successful completion
            void this.wsServer.redis.del(`stream:state:${conversationId}`);
            break;
          }
        }
      } else if (provider === "vercel") {
        let v0ThinkingStartTime: number | null = null,
          v0ThinkingDuration = 0,
          v0IsCurrentlyThinking = false,
          v0ThinkingAgg = "";

        let key: { apiKey: string | null; keyId: string | null } = {
          apiKey: null,
          keyId: null
        };
        if (hasProviderConfigured) {
          key = await this.wsServer.prisma.handleApiKeyLookup(provider, userId);
          console.log(
            `key lookup res for ${provider}, ${key.keyId ?? "no key"}`
          );
        }
        const client = this.v0Service.v0Client(key.apiKey ?? undefined);

        const responsesStream = (await client.responses.create({
          stream: true,
          input: this.v0Service.v0Format(isNewChat, msgs, prompt, systemPrompt),
          store: false,
          model,
          temperature,
          max_output_tokens: max_tokens,
          top_p: topP,
          truncation: "auto",
          tools: [
            {
              type: "web_search_preview",
              user_location
            }
          ]
        })) satisfies OpenAIStream<ResponseStreamEvent> & {
          _response_id?: string | null;
        };

        for await (const s of responsesStream) {
          let text: string | undefined = undefined;
          let thinkingText: string | undefined = undefined;
          let done = false;
          // s.type as ResponseStreamEvent['type'];
          if (
            s.type === "response.reasoning_text.delta" ||
            s.type === "response.reasoning_summary_text.delta"
          ) {
            if (!v0IsCurrentlyThinking && v0ThinkingStartTime === null) {
              v0IsCurrentlyThinking = true;
              v0ThinkingStartTime = performance.now();
            }

            thinkingText = s.delta;
          }
          if (
            (s.type === "response.reasoning_summary_text.done" ||
              s.type === "response.reasoning_text.done") &&
            v0IsCurrentlyThinking &&
            v0ThinkingStartTime !== null
          ) {
            v0IsCurrentlyThinking = false;
            v0ThinkingDuration = Math.round(
              performance.now() - v0ThinkingStartTime
            );
          }
          if (s.type === "response.output_text.delta") {
            text = s.delta;
          }
          if (s.type === "response.output_text.done") {
            done = true;
          }

          if (thinkingText) {
            v0ThinkingAgg += thinkingText;
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
                thinkingDuration: thinkingStartTime
                  ? performance.now() - thinkingStartTime
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
                thinkingDuration: thinkingStartTime
                  ? performance.now() - thinkingStartTime
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
            agg += text;
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
                thinkingText:
                  v0ThinkingAgg.length > 0 ? v0ThinkingAgg : undefined,
                thinkingDuration:
                  v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined,
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
                  v0ThinkingAgg.length > 0 ? v0ThinkingAgg : undefined,
                thinkingDuration:
                  v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined,

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
              chunk: agg,
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
                v0ThinkingAgg.length > 0 ? v0ThinkingAgg : undefined,
              thinkingDuration:
                v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined
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
                chunk: agg,
                thinkingText:
                  v0ThinkingAgg.length > 0 ? v0ThinkingAgg : undefined,
                thinkingDuration:
                  v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined,
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
                  v0ThinkingAgg.length > 0 ? v0ThinkingAgg : undefined,
                thinkingDuration:
                  v0ThinkingDuration > 0 ? v0ThinkingDuration : undefined,
                topP,
                provider,
                model,
                chunk: agg,
                done: true
              }
            );
            // Clear saved state on successful completion
            void this.wsServer.redis.del(`stream:state:${conversationId}`);
            break;
          }
        }
      } else if (provider === "meta") {
        let metaThinkingStartTime: number | null = null,
          metaThinkingDuration = 0,
          metaIsCurrentlyThinking = false,
          metaThinkingAgg = "";

        let key: { apiKey: string | null; keyId: string | null } = {
          apiKey: null,
          keyId: null
        };
        if (hasProviderConfigured) {
          key = await this.wsServer.prisma.handleApiKeyLookup(provider, userId);
          console.log(
            `key lookup res for ${provider}, ${key.keyId ?? "no key"}`
          );
        }
        const client = this.llamaService.llamaClient(key.apiKey ?? undefined);

        const responsesStream = (await client.responses.create({
          stream: true,
          input: this.llamaService.llamaFormat(
            isNewChat,
            msgs,
            prompt,
            systemPrompt
          ),
          store: false,
          model,
          temperature,
          max_output_tokens: max_tokens,
          top_p: topP,
          truncation: "auto",
          tools: [
            {
              type: "web_search_preview",
              user_location
            }
          ]
        })) satisfies OpenAIStream<ResponseStreamEvent> & {
          _response_id?: string | null;
        };

        for await (const s of responsesStream) {
          let text: string | undefined = undefined;
          let thinkingText: string | undefined = undefined;
          let done = false;
          // s.type as ResponseStreamEvent['type'];
          if (
            s.type === "response.reasoning_text.delta" ||
            s.type === "response.reasoning_summary_text.delta"
          ) {
            if (!metaIsCurrentlyThinking && metaThinkingStartTime === null) {
              metaIsCurrentlyThinking = true;
              metaThinkingStartTime = performance.now();
            }

            thinkingText = s.delta;
          }
          if (
            (s.type === "response.reasoning_summary_text.done" ||
              s.type === "response.reasoning_text.done") &&
            metaIsCurrentlyThinking &&
            metaThinkingStartTime !== null
          ) {
            metaIsCurrentlyThinking = false;
            metaThinkingDuration = Math.round(
              performance.now() - metaThinkingStartTime
            );
          }
          if (s.type === "response.output_text.delta") {
            text = s.delta;
          }
          if (s.type === "response.output_text.done") {
            done = true;
          }

          if (thinkingText) {
            metaThinkingAgg += thinkingText;
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
                thinkingDuration: thinkingStartTime
                  ? performance.now() - thinkingStartTime
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
                thinkingDuration: thinkingStartTime
                  ? performance.now() - thinkingStartTime
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
            agg += text;
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
                thinkingText:
                  metaThinkingAgg.length > 0 ? metaThinkingAgg : undefined,
                thinkingDuration:
                  metaThinkingDuration > 0 ? metaThinkingDuration : undefined,
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
                  metaThinkingAgg.length > 0 ? metaThinkingAgg : undefined,
                thinkingDuration:
                  metaThinkingDuration > 0 ? metaThinkingDuration : undefined,

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
              chunk: agg,
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
                metaThinkingAgg.length > 0 ? metaThinkingAgg : undefined,
              thinkingDuration:
                metaThinkingDuration > 0 ? metaThinkingDuration : undefined
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
                chunk: agg,
                thinkingText:
                  metaThinkingAgg.length > 0 ? metaThinkingAgg : undefined,
                thinkingDuration:
                  metaThinkingDuration > 0 ? metaThinkingDuration : undefined,
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
                  metaThinkingAgg.length > 0 ? metaThinkingAgg : undefined,
                thinkingDuration:
                  metaThinkingDuration > 0 ? metaThinkingDuration : undefined,
                topP,
                provider,
                model,
                chunk: agg,
                done: true
              }
            );
            // Clear saved state on successful completion
            void this.wsServer.redis.del(`stream:state:${conversationId}`);
            break;
          }
        }
      } else if (provider === "grok") {
        let xaiThinkingStartTime: number | null = null,
          xaiThinkingDuration = 0,
          xaiIsCurrentlyThinking = false,
          xaiThinkingAgg = "";

        let key: { apiKey: string | null; keyId: string | null } = {
          apiKey: null,
          keyId: null
        };
        if (hasProviderConfigured) {
          key = await this.wsServer.prisma.handleApiKeyLookup(provider, userId);
          console.log(
            `key lookup res for ${provider}, ${key.keyId ?? "no key"}`
          );
        }
        const client = this.xAIService.xAIClient(key.apiKey ?? undefined);

        const responsesStream = (await client.responses.create({
          stream: true,
          input: this.xAIService.xAiFormat(
            isNewChat,
            msgs,
            prompt,
            systemPrompt
          ),
          store: false,
          model,
          temperature,
          max_output_tokens: max_tokens,
          top_p: topP,
          truncation: "auto",
          tools: [
            {
              type: "web_search_preview",
              user_location
            }
          ]
        })) satisfies OpenAIStream<ResponseStreamEvent> & {
          _response_id?: string | null;
        };

        for await (const s of responsesStream) {
          let text: string | undefined = undefined;
          let thinkingText: string | undefined = undefined;
          let done = false;
          // s.type as ResponseStreamEvent['type'];
          if (
            s.type === "response.reasoning_text.delta" ||
            s.type === "response.reasoning_summary_text.delta"
          ) {
            if (!xaiIsCurrentlyThinking && xaiThinkingStartTime === null) {
              xaiIsCurrentlyThinking = true;
              xaiThinkingStartTime = performance.now();
            }

            thinkingText = s.delta;
          }
          if (
            (s.type === "response.reasoning_summary_text.done" ||
              s.type === "response.reasoning_text.done") &&
            xaiIsCurrentlyThinking &&
            xaiThinkingStartTime !== null
          ) {
            xaiIsCurrentlyThinking = false;
            xaiThinkingDuration = Math.round(
              performance.now() - xaiThinkingStartTime
            );
          }
          if (s.type === "response.output_text.delta") {
            text = s.delta;
          }
          if (s.type === "response.output_text.done") {
            done = true;
          }

          if (thinkingText) {
            xaiThinkingAgg += thinkingText;
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
                thinkingDuration: thinkingStartTime
                  ? performance.now() - thinkingStartTime
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
                thinkingDuration: thinkingStartTime
                  ? performance.now() - thinkingStartTime
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
            agg += text;
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
                thinkingText:
                  xaiThinkingAgg.length > 0 ? xaiThinkingAgg : undefined,
                thinkingDuration:
                  xaiThinkingDuration > 0 ? xaiThinkingDuration : undefined,
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
                  xaiThinkingAgg.length > 0 ? xaiThinkingAgg : undefined,
                thinkingDuration:
                  xaiThinkingDuration > 0 ? xaiThinkingDuration : undefined,

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
              chunk: agg,
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
                xaiThinkingAgg.length > 0 ? xaiThinkingAgg : undefined,
              thinkingDuration:
                xaiThinkingDuration > 0 ? xaiThinkingDuration : undefined
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
                chunk: agg,
                thinkingText:
                  xaiThinkingAgg.length > 0 ? xaiThinkingAgg : undefined,
                thinkingDuration:
                  xaiThinkingDuration > 0 ? xaiThinkingDuration : undefined,
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
                  xaiThinkingAgg.length > 0 ? xaiThinkingAgg : undefined,
                thinkingDuration:
                  xaiThinkingDuration > 0 ? xaiThinkingDuration : undefined,
                topP,
                provider,
                model,
                chunk: agg,
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
          openaiThinkingAgg = "";

        let key: { apiKey: string | null; keyId: string | null } = {
          apiKey: null,
          keyId: null
        };
        if (hasProviderConfigured) {
          key = await this.wsServer.prisma.handleApiKeyLookup(provider, userId);
          console.log(
            `key lookup res for ${provider}, ${key.keyId ?? "no key"}`
          );
        }
        const client = this.openai.getClient(key.apiKey ?? undefined);

        const responsesStream = await ( client.responses.create({
          stream: true,
          input: this.openai.formatOpenAi(
            isNewChat,
            msgs,
            prompt,
            systemPrompt
          ),
          store: false,
          model,
          temperature,
          max_output_tokens: max_tokens,
          top_p: topP,
          truncation: "auto",
          tools: [
            {
              type: "web_search_preview",
              user_location
            }
          ]
        }));

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
                thinkingDuration: thinkingStartTime
                  ? performance.now() - thinkingStartTime
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
                thinkingDuration: thinkingStartTime
                  ? performance.now() - thinkingStartTime
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
            agg += text;
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
              chunk: agg,
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
                chunk: agg,
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
                chunk: agg,
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

/**
 *
         const stream = (await client.chat.completions.create(
          {
            user: userId,
            top_p: topP,
            temperature,
            model,
            max_completion_tokens: max_tokens,
            messages: this.openai.formatOpenAi(
              isNewChat,
              msgs,
              prompt,
              systemPrompt
            ),
            stream: true
          },
          { stream: true }
        )) satisfies AsyncIterable<ChatCompletionChunk>;
         for await (const chunk of stream) {
          const choice = chunk.choices[0];
          const text = choice?.delta.content;
          const done = choice?.finish_reason != null;

          if (text) {
            chunks.push(text);
            agg += text;
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

          if (done) {
            void this.wsServer.prisma.handleAiChatResponse({
              chunk: agg,
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
                chunk: agg,
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
                chunk: agg,
                done: true
              }
            );
            // Clear saved state on successful completion
            void this.wsServer.redis.del(`stream:state:${conversationId}`);
            break;
          }
        }
 */
