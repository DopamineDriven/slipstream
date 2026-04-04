import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type {
  BigIntToCompatProps,
  HandleAiChatRequestRT,
  UserData
} from "@/types/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import type { Responses } from "openai/resources";
import type { WebSocket } from "ws";
import { ResolverConnectionService } from "@/resolver/connection.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { EventTypeMap, MessageSingleton } from "@slipstream/types";

export class ResolverChatUtilsService extends ResolverConnectionService {
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

  protected scheduleUserStoreIndexing(message: MessageSingleton<true>) {
    void this.userVectorStore
      .indexMessageAttachments(message)
      .then(results => {
        for (const result of results) {
          if (!result.ok) {
            this.logger.debug(
              { attachmentId: result.attachmentId, reason: result.reason },
              "skip indexing"
            );
          }
        }
      })
      .catch(err => {
        this.logger.warn(
          { messageId: message.id, err: this.wsServer.prisma.safeErrMsg(err) },
          "indexing failed"
        );
      });
  }

  protected handleAIChatRequestIndexing(
    msgs: MessageSingleton<true>[],
    requestMessageId: string | undefined
  ) {
    if (!requestMessageId) return;
    const requestMsg = msgs.find(m => m.id === requestMessageId);
    if (!requestMsg || requestMsg.attachments.length === 0) return;
    this.scheduleUserStoreIndexing(requestMsg);
  }

  public async titleGenUtil<
    const T extends "ai_chat_request" | "image_gen_request"
  >(
    type: T,
    {
      messages,
      prompt
    }: BigIntToCompatProps<typeof type>["rt"] & {
      prompt: string;
    }
  ) {
    const content = Array.of<Responses.ResponseInputContent>();
    const msgs = messages?.[0];

    const openaiSvc = this.providers.getInstance("openai");
    const openai = openaiSvc.getClient();

    if (msgs?.attachments) {
      for (const t of msgs.attachments) {
        if (typeof t !== "undefined") {
          const {
            mime,
            compatMime,
            compatCdnUrl,
            compatStatus,
            cdnUrl,
            assetType
          } = t;
          if (compatStatus != null && cdnUrl != null && mime != null) {
            const file_url =
              compatStatus === "ACTIVE" && compatCdnUrl != null
                ? compatCdnUrl
                : cdnUrl;
            const mimeType =
              compatStatus === "ACTIVE" && compatMime != null
                ? compatMime
                : mime;
            if (mimeType === "application/pdf" && assetType === "DOCUMENT") {
              content.push({ type: "input_file", file_url });
            }
            if (mimeType.startsWith("image") && assetType === "IMAGE") {
              content.push({
                type: "input_image",
                image_url: file_url,
                detail: "auto"
              });
            }
          }
        }
        break;
      }
      const text =
        msgs.messageBlocks?.map(t => t.content).join("\n") ?? msgs.content;
      content.push({ type: "input_text", text });
      try {
        const res = await openai.responses.create({
          model: "gpt-5.4-nano",
          store: false,
          reasoning: { effort: "medium" },
          instructions: `Generate a creative & descriptive yet concise title  ( **MAX 12 words** ) for this user-submitted-prompt and any attachments. Do **not** wrap the generated title in quotes.`,
          temperature: 1,
          input: [
            {
              role: "system",
              content:
                "Generate a creative & descriptive yet concise title ( **MAX 12 words** ) for this user-submitted-prompt and any attachments. Do **not** wrap the generated title in quotes."
            },
            { role: "user", content } as const
          ]
        });
        const title = res.output_text;
        console.log(`1. ` + title);
        return this.wsServer.prisma.sanitizeTitle(title);
      } catch {
        /**fall through */
      }
    }
    const text =
      msgs?.messageBlocks?.map(t => t.content).join("\n") ??
      msgs?.content ??
      prompt;
    content.push({ type: "input_text", text });
    try {
      const res = await openai.responses.create({
        model: "gpt-5.4-nano",
        store: false,
        reasoning: { effort: "medium" },
        instructions: `Generate a creative & descriptive yet concise title ( **MAX 12 words** ) for this user-submitted-prompt and any attachments. Do **not** wrap the generated title in quotes.`,
        temperature: 1,
        input: [
          {
            role: "system",
            content:
              "Generate a creative & descriptive yet concise title ( **MAX 12 words** ) for this user-submitted-prompt and any attachments. Do **not** wrap the generated title in quotes."
          },
          { role: "user", content } as const
        ]
      });
      const title = res.output_text;
      console.log(`2. ` + title);
      return this.wsServer.prisma.sanitizeTitle(title);
    } catch {
      /**fall through */
    }
  }

  protected async handleProviderContextUpdate(
    _event: EventTypeMap["provider_context_update"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    const providerContext =
      await this.wsServer.prisma.injectClientApiKeyProps(userId);
    const userRecord = this.wsServer.userDataMap.get(userId);

    const payload = {
      type: "provider_context_update_ack",
      providerContext
    } satisfies EventTypeMap["provider_context_update_ack"];
    ws.send(JSON.stringify(payload));
    if (userRecord?.providerContext) {
      userRecord.providerContext = providerContext;
      this.wsServer.userDataMap.set(userId, userRecord);
      return;
    }
  }

  protected getCurrentMsgAttCounts(res: HandleAiChatRequestRT) {
    const userMsgAttCounts = {
      imgCounts: 0,
      docCounts: 0
    };
    const reqMsgId = res.requestMessageId;
    if (!res.requestMessageId) {
      const { docCounts, imgCounts } = userMsgAttCounts;
      return { docCounts, imgCounts };
    }
    const findMsgBoundAtts = res.messages.findLastIndex(t => t.id === reqMsgId);
    if (findMsgBoundAtts === -1) {
      this.logger.warn(
        `${reqMsgId} returned -1 when filtered for a match via findLastIndex....`
      );
      const { docCounts, imgCounts } = userMsgAttCounts;
      return { docCounts, imgCounts };
    } else {
      const userMsg = res.messages[findMsgBoundAtts];
      if (userMsg?.attachments) {
        const v = userMsg.attachments.filter(o => o.assetType === "IMAGE");
        const d = userMsg.attachments.filter(o => o.assetType === "DOCUMENT");
        userMsgAttCounts.imgCounts = v.length;
        userMsgAttCounts.docCounts = d.length;
      } else {
        userMsgAttCounts.imgCounts = 0;
        userMsgAttCounts.docCounts = 0;
      }
    }
    const { docCounts, imgCounts } = userMsgAttCounts;
    return { imgCounts, docCounts };
  }
}
