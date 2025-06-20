import type { ChatCompletionChunk } from "openai/resources/index.mjs";
import type {
  RedisClientType,
  RedisDefaultModules,
  RedisFunctions,
  RedisModules,
  RedisScripts,
  RespVersions,
  TypeMapping
} from "redis";
import type { RawData } from "ws";
import * as dotenv from "dotenv";
import OpenAI from "openai";
import { WebSocket } from "ws";
import type {
  AnyEvent,
  AnyEventTypeUnion,
  EventTypeMap
} from "@/types/index.ts";
import { bucket, uploadToR2 } from "@/r2-helper/index.ts";
import { WSServer } from "@/ws-server/index.ts";

dotenv.config();

const FASTAPI_URL =
  process.env.FASTAPI_URL ?? "http://localhost:8000/generate-image";

export class Resolver {
  constructor(
    public wsServer: WSServer,
    private openai: OpenAI,
    private redis: RedisClientType<
      RedisDefaultModules & RedisModules,
      RedisFunctions,
      RedisScripts,
      RespVersions,
      TypeMapping
    >
  ) {}

  /** Register all event handlers here */
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
    // You can also register response handlers if needed (for internal use)
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
    // 1) pick the right client (BYOK or default)
    const client = event.apiKey
      ? this.openai.withOptions({ apiKey: event.apiKey })
      : this.openai;

    const streamKey = `stream:${event.conversationId}`;
    let agg = "";
    try {
      // 2) open the streaming iterator
      const stream = (await client.chat.completions.create({
        model: "gpt-4o-mini",
        // supports audio response conditionally with certain models
        // modalities: ["text", "audio"],
        // reasoning_effort: "high" | "medium" | "low",
        messages: [{ role: "user", content: event.prompt }],
        stream: true
      })) satisfies AsyncIterable<ChatCompletionChunk>;

      await this.redis.expire(streamKey, 3600);

      // 3) walk the stream
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
              conversationId: event.conversationId,
              userId,
              chunk: text,
              done: false
            } satisfies EventTypeMap["ai_chat_chunk"])
          );
        }

        if (done) {
          ws.send(
            JSON.stringify({
              type: "ai_chat_response",
              conversationId: event.conversationId,
              userId,
              chunk: agg,
              done: true
            } satisfies EventTypeMap["ai_chat_response"])
          );
          break;
        }
      }
    } catch (err) {
      console.error(`AI Stream Error`, err);
      ws.send(
        JSON.stringify({
          type: "ai_chat_error",
          conversationId: event.conversationId,
          userId,
          done: true,
          message: err instanceof Error ? err.message : String(err)
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

  /** Handler for typing indicator */
  public async handleTyping(
    event: EventTypeMap["typing"],
    ws: WebSocket,
    userId: string
  ): Promise<void> {
    this.wsServer.broadcast("typing", { ...event, userId });
  }

  /** Handler for chat messages */
  public async handleMessage(
    event: EventTypeMap["message"],
    ws: WebSocket,
    userId: string
  ): Promise<void> {
    // Demo: Just echo message to everyone
    this.wsServer.broadcast("message", { ...event, userId });
  }

  /** Handler for ping */
  public async handlePing(
    event: EventTypeMap["ping"],
    ws: WebSocket,
    userId: string
  ): Promise<void> {
    console.log(event.type);
    ws.send(JSON.stringify({ type: "pong", userId }));
  }

  /** Handler for image gen requests */
  public async handleImageGenRequest(
    event: EventTypeMap["image_gen_request"],
    ws: WebSocket,
    userId: string
  ): Promise<void> {
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
          } as EventTypeMap["image_gen_response"])
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
        } as EventTypeMap["image_gen_response"])
      );
    } catch (error) {
      ws.send(
        JSON.stringify({
          type: "image_gen_response",
          userId,
          conversationId: event.conversationId,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        } as EventTypeMap["image_gen_response"])
      );
    }
  }

  /** Handler for asset upload requests */
  public async handleAssetUploadRequest(
    event: EventTypeMap["asset_upload_request"],
    ws: WebSocket,
    userId: string
  ): Promise<void> {
    try {
      const data = Buffer.from(event.base64, "base64");
      const key = `user-assets/${userId}/${Date.now()}_${event.filename}`;
      const url = await uploadToR2({
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
