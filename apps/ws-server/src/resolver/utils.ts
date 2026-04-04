import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import type { Logger as PinoLogger } from "pino";
import type { S3Storage } from "@slipstream/storage-s3";

export class ResolverUtilsService {
  protected logger: PinoLogger;
  constructor(
    public wsServer: WSServer,
    protected providers: ProviderService,
    protected s3Service: S3Storage,
    protected region: string,
    protected imgCompatService: ImageCompatService,
    protected userVectorStore: UserStoreVectorService,
    protected xaiManagementApikey: string,
    logger: LoggerService,
    protected ttsService: TTSService
  ) {
    this.logger = logger
      .getPinoInstance()
      .child({ node_version: process.version }, { msgPrefix: "[resolver] " });
  }
  /**  Track high-resolution start times for upload progress per attachment */
  protected uploadTimers = new Map<string, bigint>();

  protected makeProgressKey(
    conversationId: string,
    attachmentId?: string,
    draftId?: string,
    batchId?: string,
    userId?: string
  ) {
    const att =
      attachmentId && attachmentId.length > 0 ? attachmentId : "no-att";
    const d = draftId ?? "no-draft";
    const b = batchId ?? "no-batch";
    const u = userId ?? "no-user";
    return `${conversationId}::${att}::${d}::${b}::${u}`;
  }

  protected resolveChannel(conversationId: string, userId: string) {
    return conversationId === "new-chat"
      ? this.redisChannels.user(userId)
      : this.redisChannels.conversationStream(conversationId);
  }

  protected redisChannels = {
    // User-specific channels
    user: (userId: string) => `user:${userId}` as const,
    userPresence: (userId: string) => `presence:${userId}` as const,

    // Conversation channels
    conversation: (conversationId: string) => `conv:${conversationId}` as const,
    conversationStream: (conversationId: string) =>
      `stream:${conversationId}` as const,

    // System-wide channels
    system: {
      broadcasts: "system:broadcasts",
      metrics: "system:metrics"
    }
  } as const satisfies typeof import("@slipstream/redis-service").RedisChannels;
}
