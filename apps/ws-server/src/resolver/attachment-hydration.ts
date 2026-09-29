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
  protected attachmentRegistry = new Map<
    string,
    Map<string, Map<string, AttachmentSingleton<true>>>
  >();
  protected NEW_CHAT = "new-chat" as const;

  protected async populateAttachmentRegistry(userId: string) {
    if (this.attachmentRegistry.has(userId)) return;
    const user = new Map<string, Map<string, AttachmentSingleton<true>>>();
    this.attachmentRegistry.set(userId, user);
    for await (const {
      conversationId,
      attachments
    } of this.wsServer.prisma.attachmentHydrationGenerator(userId)) {
      // the thunk allocates only on a miss (getOrInsert would allocate on every call)
      const bucket = user.getOrInsertComputed(
        conversationId,
        () => new Map<string, AttachmentSingleton<true>>()
      );
      for (const att of attachments) bucket.set(att.id, att);
    }
  }

  protected setRegistryAttachment(
    userId: string,
    attachment: AttachmentSingleton<true>
  ) {
    const key = attachment.conversationId ?? this.NEW_CHAT;
    this.attachmentRegistry
      .getOrInsertComputed(
        userId,
        () => new Map<string, Map<string, AttachmentSingleton<true>>>()
      )
      .getOrInsertComputed(
        key,
        () => new Map<string, AttachmentSingleton<true>>()
      )
      .set(attachment.id, attachment);
    return key;
  }

  protected rekeyRegistryAttachments(
    userId: string,
    rows: AttachmentSingleton<true>[]
  ) {
    const user = this.attachmentRegistry.get(userId);
    const unbound = user?.get(this.NEW_CHAT);
    for (const att of rows) {
      unbound?.delete(att.id);
      this.setRegistryAttachment(userId, att);
    }
    if (unbound?.size === 0) user?.delete(this.NEW_CHAT);
  }

  protected registryAttachmentById(userId: string, attachmentId: string) {
    const user = this.attachmentRegistry.get(userId);
    if (!user) return;
    for (const [conversationId, bucket] of user) {
      const attachment = bucket.get(attachmentId);
      if (attachment) return { conversationId, attachment } as const;
    }
    return;
  }

  protected async hydrateAttachments(
    _event: EventTypeMap["hydrate_attachments"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    await this.populateAttachmentRegistry(userId);
    const user = this.attachmentRegistry.get(userId);
    if (!user) return;
    for (const [conversationId, bucket] of user) {
      ws.send(
        JSON.stringify({
          type: "hydrate_attachments_ack",
          userId,
          conversationId,
          attachments: Array.from(bucket.values())
        } satisfies EventTypeMap["hydrate_attachments_ack"])
      );
    }
  }

  protected async hydrateAttachmentById(
    event: EventTypeMap["hydrate_attachment_by_id"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    await this.populateAttachmentRegistry(userId);
    const user = this.attachmentRegistry.get(userId);
    const inRequested = user
      ?.get(event.conversationId)
      ?.get(event.attachmentId);
    const hit = inRequested
      ? { conversationId: event.conversationId, attachment: inRequested }
      : this.registryAttachmentById(userId, event.attachmentId);
    if (hit) {
      ws.send(
        JSON.stringify({
          type: "hydrate_attachment_by_id_ack",
          userId,
          conversationId: hit.conversationId,
          attachment: hit.attachment
        } satisfies EventTypeMap["hydrate_attachment_by_id_ack"])
      );
    } else {
      ws.send(
        JSON.stringify({
          type: "hydrate_attachment_by_id_ack",
          userId,
          conversationId: event.conversationId,
          reason: "INVALID_ID"
        } satisfies EventTypeMap["hydrate_attachment_by_id_ack"])
      );
    }
  }

  protected async hydrateAttachmentByConversationId(
    event: EventTypeMap["hydrate_attachments_by_conversation_id"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    await this.populateAttachmentRegistry(userId);
    const bucket = this.attachmentRegistry
      .get(userId)
      ?.get(event.conversationId);
    ws.send(
      JSON.stringify({
        type: "hydrate_attachments_by_conversation_id_ack",
        userId,
        conversationId: event.conversationId,
        attachments: bucket ? Array.from(bucket.values()) : []
      } satisfies EventTypeMap["hydrate_attachments_by_conversation_id_ack"])
    );
  }
}
