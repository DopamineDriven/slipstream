import type { ChatCompletionChunk } from "openai/resources/index.mjs";
import type { RawData } from "ws";
import { Credentials } from "@t3-chat-clone/credentials";
import { RedisInstance } from "@t3-chat-clone/redis-service";
import { GenerateContentResponse } from "@google/genai";
import OpenAI from "openai";
import { WebSocket } from "ws";
import type {
  AnyEvent,
  AnyEventTypeUnion,
  EventTypeMap,
  GeminiChatModels,
  GrokChatModels,
  OpenAIChatModels
} from "@/types/index.ts";
import { ModelService } from "@/models/index.ts";
import { R2Instance } from "@/r2-helper/index.ts";
import { WSServer } from "@/ws-server/index.ts";
import { GeminiService } from "@/gemini/index.ts";

export class Resolver extends ModelService {
  constructor(
    public wsServer: WSServer,
    private openai: OpenAI,
    private geminiService: GeminiService,
    private redis: RedisInstance,
    private r2: R2Instance,
    private cred: Credentials
  ) {
    super();
  }


  public registerAll() {
    this.wsServer.on("typing", this.handleTyping.bind(this));
    this.wsServer.on("message", this.handleMessage.bind(this));
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
        | undefined
    );

    const res = await this.wsServer.prisma.handleAiChatRequest({
      userId,
      conversationId: event.conversationId,
      prompt: event.prompt,
      provider: provider,
      apiKey: event.apiKey,
      model: model
    });

    const conversationId =
      res.id === event.conversationId ? event.conversationId : res.id;

    const streamKey = `stream:${event.conversationId}`;

    let agg = "";

    try {
      if (provider === "gemini") {

        const gemini = await this.geminiService.getClient(event.apiKey);

        const chat = gemini.chats.create({ model: model });

        const stream = (await chat.sendMessageStream({
          message: event.prompt,
          config: { thinkingConfig: { thinkingBudget: 0 } } // disables thinking
        })) satisfies AsyncGenerator<GenerateContentResponse>;

        await this.redis.expire(streamKey, 3600);

        for await (const chunk of stream) {
          const textPart = chunk.text;
          const dataPart = chunk.data;
          const done = chunk.candidates?.[0]?.finishReason;

          if (textPart) {
            await this.redis.rPush(streamKey, textPart);
            agg += textPart;
            ws.send(
              JSON.stringify({
                type: "ai_chat_chunk",
                conversationId,
                userId,
                model: model,
                provider,
                chunk: textPart,
                done: false
              } satisfies EventTypeMap["ai_chat_chunk"])
            );
          }
          if (dataPart) {
            const _dataUrl = `data:image/png;base64,${dataPart}` as const;
            ws.send(
              JSON.stringify({
                type: "ai_chat_inline_data",
                conversationId,
                data: dataPart,
                provider,
                model,
                userId
              } satisfies EventTypeMap["ai_chat_inline_data"])
            );
          }
          if (done) {
            void this.wsServer.prisma.handleAiChatResponse({
              chunk: agg,
              conversationId,
              done: true,
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
                provider,
                chunk: agg,
                done: true
              } satisfies EventTypeMap["ai_chat_response"])
            );
            break;
          }
        }
      } else if (provider === "grok") {
        const xAi = await this.cred.get("X_AI_KEY");

        const fallbackApiKey = xAi;

        const client = event.apiKey
          ? this.openai.withOptions({
              apiKey: event.apiKey,
              baseURL: "https://api.x.ai/v1"
            })
          : this.openai.withOptions({
              apiKey: fallbackApiKey,
              baseURL: "https://api.x.ai/v1"
            });

        const stream = (await client.chat.completions.create(
          {
            user: userId,
            model,
            messages: [{ role: "user", content: event.prompt }],
            stream: true
          },
          { stream: true }
        )) satisfies AsyncIterable<ChatCompletionChunk>;

        await this.redis.expire(streamKey, 3600);

        for await (const chunk of stream) {
          const choice = chunk.choices[0];
          const text = choice?.delta.content;
          const done = choice?.finish_reason != null;

          if (text) {
            await this.redis.rPush(streamKey, text);
            agg += text;
            ws.send(
              JSON.stringify({
                type: "ai_chat_chunk",
                conversationId,
                userId,
                provider,
                model,
                chunk: text,
                done: false
              } satisfies EventTypeMap["ai_chat_chunk"])
            );
          }

          if (done) {
            void this.wsServer.prisma.handleAiChatResponse({
              chunk: agg,
              conversationId,
              done: true,
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
                chunk: agg,
                done: true
              } satisfies EventTypeMap["ai_chat_response"])
            );
            break;
          }
        }
      } else {
        const client = event.apiKey
          ? this.openai.withOptions({ apiKey: event.apiKey })
          : this.openai;
        const stream = (await client.chat.completions.create(
          {
            user: userId,
            model,
            messages: [{ role: "user", content: event.prompt }],
            stream: true
          },
          { stream: true }
        )) satisfies AsyncIterable<ChatCompletionChunk>;

        await this.redis.expire(streamKey, 3600);

        for await (const chunk of stream) {
          const choice = chunk.choices[0];
          const text = choice?.delta.content;
          const done = choice?.finish_reason != null;

          if (text) {
            await this.redis.rPush(streamKey, text);
            agg += text;
            ws.send(
              JSON.stringify({
                type: "ai_chat_chunk",
                conversationId,
                userId,
                provider,
                model,
                chunk: text,
                done: false
              } satisfies EventTypeMap["ai_chat_chunk"])
            );
          }

          if (done) {
            void this.wsServer.prisma.handleAiChatResponse({
              chunk: agg,
              conversationId,
              done: true,
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
                chunk: agg,
                done: true
              } satisfies EventTypeMap["ai_chat_response"])
            );
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
          userId,
          done: true,
          message: this.safeErrMsg(err)
        } satisfies EventTypeMap["ai_chat_error"])
      );
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
      case "message":
        await this.handleMessage(event, ws, userId);
        break;
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
    "message",
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

  public async handleMessage(
    event: EventTypeMap["message"],
    ws: WebSocket,
    userId: string
  ): Promise<void> {

    this.wsServer.broadcast("message", { ...event, userId });
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
