import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type { BufferLike, UserData } from "@/types/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import type { WebSocket } from "ws";
import { ResolverChatService } from "@/resolver/chat.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type {
  AnyEvent,
  AnyEventTypeUnion,
  EventTypeMap
} from "@slipstream/types";

export class ResolverDispatchService extends ResolverChatService {
  constructor(
    wsServer: WSServer,
    providers: ProviderService,
    s3Service: S3Storage,
    region: string,
    imgCompatService: ImageCompatService,
    userVectorStore: UserStoreVectorService,
    xaiManagementApikey: string,
    logger: LoggerService,
    ttsService: TTSService
  ) {
    super(
      wsServer,
      providers,
      s3Service,
      region,
      imgCompatService,
      userVectorStore,
      xaiManagementApikey,
      logger,
      ttsService
    );
  }
  /** Dispatches incoming events to handlers */
  public async handleRawMessage(
    ws: WebSocket,
    userId: string,
    raw: BufferLike,
    userData?: UserData
  ) {
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
      case "ai_chat_request":
        await this.handleAIChat(event, ws, userId, userData);
        break;
      case "asset_paste":
        await this.handleAssetPaste(event, ws, userId, userData);
        break;
      case "asset_fetch_request":
        await this.handleAssetFetchRequest(event, ws, userId, userData);
        break;
      case "asset_upload_complete":
        await this.handleAssetUploadComplete(event, ws, userId, userData);
        break;
      case "asset_upload_progress":
        await this.handleAssetProgress(event, ws, userId, userData);
        break;
      case "asset_attached":
        await this.handleAssetAttached(event, ws, userId, userData);
        break;
      case "provider_context_ping":
        await this.handleProviderContextPing(event, ws, userId, userData);
        break;
      case "provider_context_update":
        await this.handleProviderContextUpdate(event, ws, userId, userData);
        break;
      case "user_tts_request":
        await this.handleUserTTSRequest(event, ws, userId, userData);
        break;
      default:
        await this.wsServer.redis.publish(
          this.wsServer.channel,
          JSON.stringify({ event: "never", userId, timestamp: Date.now() })
        );
    }
  }

  protected EVENT_TYPES = [
    "ai_chat_chunk",
    "ai_chat_error",
    "ai_chat_inline_data",
    "ai_chat_request",
    "ai_chat_response",
    "asset_attached",
    "asset_batch_upload",
    "asset_deleted",
    "asset_fetch_error",
    "asset_fetch_request",
    "asset_fetch_response",
    "asset_paste",
    "asset_ready",
    "asset_upload_abort",
    "asset_upload_aborted",
    "asset_upload_complete",
    "asset_upload_complete_error",
    "asset_upload_error",
    "asset_upload_instructions",
    "asset_upload_prepare",
    "asset_upload_progress",
    "asset_upload_request",
    "asset_upload_response",
    "asset_uploaded",
    "connection_established",
    "image_gen_error",
    "image_gen_progress",
    "image_gen_request",
    "image_gen_response",
    "ping",
    "provider_context_ping",
    "provider_context_pong",
    "provider_context_update",
    "provider_context_update_ack",
    "typing",
    "user_tts_chunk",
    "user_tts_error",
    "user_tts_request",
    "user_tts_response"
  ] as const satisfies readonly AnyEventTypeUnion[];

  /** Parses a raw WebSocket message into an event */
  protected parseEvent(raw: BufferLike): AnyEvent | null {
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
      if (typeof msg === "object" && msg && "type" in msg) {
        console.error("Invalid message received", msg.type ?? "no type");
      }
      return null;
    }
  }
  protected async handlePing(
    event: EventTypeMap["ping"],
    ws: WebSocket,
    userId: string
  ): Promise<void> {
    console.log(event.type);
    ws.send(JSON.stringify({ type: "pong", userId }));
  }
  protected async handleTyping(
    event: EventTypeMap["typing"],
    _ws: WebSocket,
    userId: string
  ): Promise<void> {
    this.wsServer.broadcast("typing", { ...event, userId });
  }

  public registerAll() {
    this.wsServer.on("typing", this.handleTyping.bind(this));
    this.wsServer.on("ping", this.handlePing.bind(this));
    this.wsServer.on("asset_paste", this.handleAssetPaste.bind(this));
    this.wsServer.on(
      "asset_fetch_request",
      this.handleAssetFetchRequest.bind(this)
    );
    this.wsServer.on("ai_chat_request", this.handleAIChat.bind(this));
    this.wsServer.on(
      "asset_upload_complete",
      this.handleAssetUploadComplete.bind(this)
    );
    this.wsServer.on("asset_attached", this.handleAssetAttached.bind(this));
    this.wsServer.on(
      "asset_upload_progress",
      this.handleAssetProgress.bind(this)
    );
    this.wsServer.on(
      "provider_context_ping",
      this.handleProviderContextPing.bind(this)
    );
    this.wsServer.on("user_tts_request", this.handleUserTTSRequest.bind(this));
    this.wsServer.on(
      "provider_context_update",
      this.handleProviderContextUpdate.bind(this)
    );
  }
}
