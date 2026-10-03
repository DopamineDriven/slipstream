import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type { UserData } from "@/types/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import type { WebSocket } from "ws";
import { ResolverAssetCompatService } from "@/resolver/asset-compat.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { AttachmentSingleton, EventTypeMap } from "@slipstream/types";

export class ResolverAttachmentHydrationService extends ResolverAssetCompatService {
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
  /** the dormant whole-user lane — kept for a future gallery */
  protected async hydrateAttachments(
    _event: EventTypeMap["hydrate_attachments"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    await this.wsServer.prisma.populateAttachmentRegistry(userId);
    const user = this.wsServer.prisma.attachmentRegistry.get(userId);
    if (!user) return;
    for (const [conversationId, bucket] of user) {
      ws.send(
        JSON.stringify({
          type: "hydrate_attachments_ack",
          conversationId,
          attachments: Array.from(bucket.values())
        } satisfies EventTypeMap["hydrate_attachments_ack"])
      );
    }
  }

  /**
   * requested key → real key elsewhere → one findFirst (set under its real
   * key) → INVALID_ID echoing the requested key. Also the frame every write
   * site sends (finalize, rekey).
   */
  protected async hydrateAttachmentById(
    event: EventTypeMap["hydrate_attachment_by_id"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    const inRequested = this.wsServer.prisma.attachmentRegistry
      .get(userId)
      ?.get(event.conversationId)
      ?.get(event.attachmentId);
    let hit = inRequested
      ? { conversationId: event.conversationId, attachment: inRequested }
      : this.wsServer.prisma.registryAttachmentById(userId, event.attachmentId);
    if (!hit) {
      const row = await this.wsServer.prisma.attachmentById(
        userId,
        event.attachmentId
      );
      if (row) {
        const conversationId = this.wsServer.prisma.setRegistryAttachment(
          userId,
          row
        );
        hit = { conversationId, attachment: row };
      }
    }
    if (hit) {
      ws.send(
        JSON.stringify({
          type: "hydrate_attachment_by_id_ack",
          conversationId: hit.conversationId,
          attachment: hit.attachment
        } satisfies EventTypeMap["hydrate_attachment_by_id_ack"])
      );
    } else {
      ws.send(
        JSON.stringify({
          type: "hydrate_attachment_by_id_ack",
          conversationId: event.conversationId,
          reason: "INVALID_ID"
        } satisfies EventTypeMap["hydrate_attachment_by_id_ack"])
      );
    }
  }

  /**
   * The primary lane. Registry hit → answer from memory. Miss → one query for
   * exactly this key, set, answer. "new-chat" selects the unbound rows.
   */
  protected async hydrateAttachmentByConversationId(
    event: EventTypeMap["hydrate_attachments_by_conversation_id"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    const user = this.wsServer.prisma.attachmentRegistry.getOrInsertComputed(
      userId,
      () => new Map<string, Map<string, AttachmentSingleton<true>>>()
    );
    let bucket = user.get(event.conversationId);
    if (!bucket) {
      const rows = await this.wsServer.prisma.attachmentsByConversation(
        userId,
        event.conversationId === this.wsServer.prisma.NEW_CHAT
          ? null
          : event.conversationId
      );
      bucket = new Map<string, AttachmentSingleton<true>>();
      for (const att of rows) bucket.set(att.id, att);
      user.set(event.conversationId, bucket);
    }
    ws.send(
      JSON.stringify({
        type: "hydrate_attachments_by_conversation_id_ack",
        conversationId: event.conversationId,
        attachments: Array.from(bucket.values())
      } satisfies EventTypeMap["hydrate_attachments_by_conversation_id_ack"])
    );
  }
}
