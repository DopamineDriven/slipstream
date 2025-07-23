import type {
  RawMessageStreamEvent,
  StopReason
} from "@anthropic-ai/sdk/resources/messages.mjs";
import type { ContentUnion } from "@google/genai";
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam
} from "openai/resources/index.mjs";
import type { RawData } from "ws";
import OpenAI from "openai";
import { AnthropicService } from "@/anthropic/index.ts";
import { GeminiService } from "@/gemini/index.ts";
import { ModelService } from "@/models/index.ts";
import { R2Instance } from "@/r2-helper/index.ts";
import { WSServer } from "@/ws-server/index.ts";
import { Stream } from "@anthropic-ai/sdk/core/streaming.mjs";
import { GenerateContentResponse } from "@google/genai";
import { WebSocket } from "ws";
import type {
  AnthropicChatModels,
  AnyEvent,
  AnyEventTypeUnion,
  EventTypeMap,
  GeminiChatModels,
  GrokChatModels,
  OpenAIChatModels,
  Provider
} from "@t3-chat-clone/types";
import { Credentials } from "@t3-chat-clone/credentials";
import { RedisChannels } from "@t3-chat-clone/redis-service";

export class Resolver extends ModelService {
  constructor(
    public wsServer: WSServer,
    private openai: OpenAI,
    private geminiService: GeminiService,
    private anthropicService: AnthropicService,
    private r2: R2Instance,
    private cred: Credentials
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

  private cleanTitle(outputTitle: string, maxWords = 10) {
    if (!outputTitle) return "New Chat";
    return outputTitle
      .replace(/^["']|["']$/g, "")
      .replace(/\.$/, "")
      .split(/\s+/)
      .slice(0, maxWords)
      .join(" ")
      .trim();
  }

  private formatProvider(provider?: Provider) {
    switch (provider) {
      case "anthropic":
        return "Anthropic";
      case "gemini":
        return "Gemini";
      case "openai":
        return "OpenAI";
      case "grok":
        return "Grok";
      default:
        return "OpenAI";
    }
  }

  private async titleGenUtil({
    prompt,
    provider
  }: EventTypeMap["ai_chat_request"]) {
    const apiKey = await this.cred.get("OPENAI_API_KEY");
    const openai = this.openai.withOptions({ apiKey });
    try {
      const turbo = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        store: false,
        messages: [
          {
            role: "developer",
            content: `Generate a concise, descriptive title (max 10 words) for this user-submitted-prompt: "${prompt}"`
          }
        ]
      });
      const title =
        turbo.choices?.[0]?.message?.content ?? this.formatProvider(provider);

      return title;
    } catch (err) {
      console.warn(err);
    }
  }

  public async handleAIChat(
    event: EventTypeMap["ai_chat_request"],
    ws: WebSocket,
    userId: string
  ) {
    const provider = event?.provider ?? "openai";
    const model = this.getModel(
      provider,
      event?.model as
        | GeminiChatModels
        | OpenAIChatModels
        | GrokChatModels
        | AnthropicChatModels
        | undefined
    );

    const res = await this.wsServer.prisma.handleAiChatRequest({
      userId,
      conversationId: event.conversationId,
      prompt: event.prompt,
      provider,
      hasProviderConfigured: event.hasProviderConfigured,
      maxTokens: event.maxTokens,
      isDefaultProvider: event.isDefaultProvider,
      systemPrompt: event.systemPrompt,
      temperature: event.temperature,
      topP: event.topP,
      model: model
    });

    const topP = event.topP;
    const temperature = event.temperature;
    const systemPrompt = event.systemPrompt;
    const max_tokens = event.maxTokens;

    const conversationId = res.id;
    const streamChannel = RedisChannels.conversationStream(conversationId);
    const userChannel = RedisChannels.user(userId);
    const existingState =
      await this.wsServer.redis.getStreamState(conversationId);
    let chunks = Array.of<string>();
    let resumedFromChunk = 0;
    let agg = "";

    const title = res?.title ?? (await this.titleGenUtil(event));
    if (existingState && !existingState.metadata.completed) {
      chunks = existingState.chunks;
      resumedFromChunk = chunks.length;

      // Send resume event
      await this.wsServer.redis.publishTypedEvent(
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
          done: false,
          model: existingState.metadata.model,
          provider: existingState.metadata.provider as Provider,
          title: existingState.metadata.title,

          systemPrompt: event.systemPrompt,
          temperature: event.temperature,
          topP: event.topP
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
        if (event.hasProviderConfigured) {
          key = await this.wsServer.prisma.handleApiKeyLookup(provider, userId);
          console.log(
            `key lookup res for ${provider}, ${key.keyId ?? "no key"}`
          );
        }
        const gemini = await this.geminiService.getClient(
          key.apiKey ?? undefined
        );

        const chat = gemini.chats.create({ model: model });

        const stream = (await chat.sendMessageStream({
          message: event.prompt,
          config: {
            temperature,
            maxOutputTokens: max_tokens,
            topP,
            systemInstruction: systemPrompt satisfies ContentUnion | undefined
          }
        })) satisfies AsyncGenerator<GenerateContentResponse>;

        for await (const chunk of stream) {
          const textPart = chunk.text;
          const dataPart = chunk.data;
          const done = chunk.candidates?.[0]?.finishReason;

          if (textPart) {
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
                temperature,
                topP,
                provider,
                chunk: textPart,
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
          if (dataPart) {
            const _dataUrl = `data:image/png;base64,${dataPart}` as const;
            ws.send(
              JSON.stringify({
                type: "ai_chat_inline_data",
                conversationId,
                data: dataPart,
                userId,
                model,
                systemPrompt,
                temperature,
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
              model
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
        let key: { apiKey: string | null; keyId: string | null } = {
          apiKey: null,
          keyId: null
        };
        if (event.hasProviderConfigured) {
          key = await this.wsServer.prisma.handleApiKeyLookup(provider, userId);
          console.log(
            `key lookup res for ${provider}, ${key.keyId ?? "no key"}`
          );
        }
        const anthropicFallback = await this.cred.get("ANTHROPIC_API_KEY");
        const anthropic = await this.anthropicService.getClient(
          key.apiKey ?? anthropicFallback
        );

        const max_tokens =
          event.maxTokens ??
          this.anthropicService.maxOutputTokens(model as AnthropicChatModels);

        const stream = (await anthropic.messages.create({
          max_tokens,
          stream: true,
          thinking: { type: "disabled" },
          top_p: topP,
          temperature,
          system: systemPrompt,
          model,
          messages: [{ role: "user", content: event.prompt }]
        })) satisfies Stream<RawMessageStreamEvent> & {
          _request_id?: string | null;
        };

        for await (const chunk of stream) {
          let text: string | undefined = undefined;
          let done: StopReason | null = null;
          if (chunk.type === "content_block_delta") {
            if (chunk.delta.type === "text_delta") {
              text = chunk.delta.text;
            } else if (chunk.delta.type === "citations_delta") {
              text = chunk.delta.citation.cited_text;
            }
          } else if (chunk.type === "message_delta") {
            done = chunk.delta.stop_reason;
          }

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
              title,
              provider,
              userId,
              model
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
      } else if (provider === "grok") {
        const xAi = await this.cred.get("X_AI_KEY");
        let key: { apiKey: string | null; keyId: string | null } = {
          apiKey: null,
          keyId: null
        };
        if (event.hasProviderConfigured) {
          key = await this.wsServer.prisma.handleApiKeyLookup(provider, userId);
          console.log(
            `key lookup res for ${provider}, ${key.keyId ?? "no key"}`
          );
        }
        const fallbackApiKey = xAi;

        const client = key.apiKey
          ? this.openai.withOptions({
              apiKey: key.apiKey,
              baseURL: "https://api.x.ai/v1"
            })
          : this.openai.withOptions({
              apiKey: fallbackApiKey,
              baseURL: "https://api.x.ai/v1"
            });
        const messages = (
          systemPrompt
            ? ([
                { role: "system", content: systemPrompt },
                { role: "user", content: event.prompt }
              ] as const)
            : ([{ role: "user", content: event.prompt }] as const)
        ) satisfies ChatCompletionMessageParam[];
        const stream = (await client.chat.completions.create(
          {
            user: userId,
            top_p: topP,
            temperature,
            max_completion_tokens: max_tokens,
            model,
            messages,
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
                title,
                systemPrompt,
                temperature,
                topP,
                provider,
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
      } else {
        const messages = (
          systemPrompt
            ? ([
                { role: "system", content: systemPrompt },
                { role: "user", content: event.prompt }
              ] as const)
            : ([{ role: "user", content: event.prompt }] as const)
        ) satisfies ChatCompletionMessageParam[];
        let key: { apiKey: string | null; keyId: string | null } = {
          apiKey: null,
          keyId: null
        };
        if (event.hasProviderConfigured) {
          key = await this.wsServer.prisma.handleApiKeyLookup(provider, userId);
          console.log(
            `key lookup res for ${provider}, ${key.keyId ?? "no key"}`
          );
        }
        const client = key.apiKey
          ? this.openai.withOptions({ apiKey: key.apiKey })
          : this.openai;
        const stream = (await client.chat.completions.create(
          {
            user: userId,
            top_p: topP,
            temperature,
            model,
            max_completion_tokens: max_tokens,
            messages,
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
    raw: RawData
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
        await this.handleAIChat(event, ws, userId);
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
  private parseEvent(raw: RawData): AnyEvent | null {
    let msg: unknown;
    try {
      if (Array.isArray(raw)) {
        msg = JSON.parse(Buffer.concat(raw).toString());
      } else {
        msg = JSON.parse(Buffer.from(raw).toString());
      }
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
    ws: WebSocket,
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
    const FASTAPI_URL = await this.cred.get("FASTAPI_URL");
    try {
      const res = await fetch(FASTAPI_URL, {
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
    const bucket = await this.cred.get("R2_BUCKET");
    try {
      const data = Buffer.from(event.base64, "base64");
      const key = `user-assets/${userId}/${Date.now()}_${event.filename}`;
      const url = await this.r2.uploadToR2({
        Key: key,
        Body: data,
        ContentType: event.contentType,
        Bucket: bucket
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
