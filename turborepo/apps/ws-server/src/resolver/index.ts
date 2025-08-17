import type { Message } from "@/generated/client/client.ts";
import type { BufferLike, UserData } from "@/types/index.ts";
import { AnthropicService } from "@/anthropic/index.ts";
import { GeminiService } from "@/gemini/index.ts";
import { LlamaService } from "@/meta/index.ts";
import { ModelService } from "@/models/index.ts";
import { OpenAIService } from "@/openai/index.ts";
import { R2Instance } from "@/r2-helper/index.ts";
import { v0Service } from "@/vercel/index.ts";
import { WSServer } from "@/ws-server/index.ts";
import { xAIService } from "@/xai/index.ts";
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

    console.log(`key looked up for ${provider}, ${keyId ?? "no key"}`);
    try {
      if (provider === "gemini") {
        await this.geminiService.handleGeminiAiChatRequest({
          chunks,
          conversationId,
          isNewChat,
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
          topP,
          userData
        });
      } else if (provider === "anthropic") {
        await this.anthropicService.handleAnthropicAiChatRequest({
          chunks,
          conversationId,
          isNewChat,
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
          topP,
          user_location
        });
      } else if (provider === "vercel") {
        await this.v0Service.handleV0AiChatRequest({
          chunks,
          conversationId,
          isNewChat,
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
      } else if (provider === "meta") {
        await this.llamaService.handleMetaAiChatRequest({
          chunks,
          conversationId,
          isNewChat,
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
      } else if (provider === "grok") {
        await this.xAIService.handleGrokAiChatRequest({
          chunks,
          conversationId,
          isNewChat,
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
      } else {
        await this.openai.handleOpenaiAiChatRequest({
          chunks,
          conversationId,
          isNewChat,
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
          topP,
          user_location
        });
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
          temperature,
          topP,
          title,
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
      void this.wsServer.redis.saveStreamState(
        conversationId,
        chunks,
        {
          model,
          provider,
          title,
          totalChunks: chunks.length,
          completed: false,
          systemPrompt,
          temperature,
          topP
        },
        thinkingChunks
      );
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
