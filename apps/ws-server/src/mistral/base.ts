import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { Logger as PinoLogger } from "pino";
import { Mistral } from "@mistralai/mistralai";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";



export class MistralBaseService {
  protected defaultClient: Mistral;
  protected logger: PinoLogger;

  constructor(
    logger: LoggerService,
    protected prisma: PrismaService,
    protected redis: EnhancedRedisPubSub,
    protected userStoreVector: UserStoreVectorService,
    protected apiKey: string
  ) {
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[mistral] " }
      );
    this.defaultClient = new Mistral({
      apiKey: this.apiKey
    });
  }

  protected getClient(overrideKey?: string) {
    if (overrideKey) {
      return new Mistral({
        apiKey: overrideKey
      });
    } else {
      return this.defaultClient;
    }
  }

  protected isMistralModel(model = "mistral-small-latest") {
    return (
      model === "mistral-small-latest" ||
      model === "mistral-medium-latest" ||
      model === "mistral-large-latest"
    );
  }
}
/**
 *   protected async formatxAIMsgHistory(
    msgs: MessageSingleton<true>[],
    model: GrokModelIdUnion,
    userId: string,
    imgDetail?: ImageContentBlock["detail"],
    keyFingerprint = "server",
    keyId?: string,
    apiKey = this.xaiKey,
    mgmtKey = this.xaiManagementKey
  ) {
    const formatted = Array.of<ResponsesComprehensive>();

    const lastIndex = msgs.findLastIndex(
      m => m.provider === "GROK" && m.senderType === "AI"
    );

    const isFirstGrokMsg = lastIndex === -1;

    for (const [msgIndex, msg] of msgs.entries()) {
      const isFreshContext = isFirstGrokMsg || msgIndex > lastIndex;
      const isCurrentUserMsg = msgIndex === msgs.length - 1;
      const collectionId = this.collectionRegistry.get(userId) ?? null;
      if (msg.senderType === "USER") {
        const content = Array.of<ContentBlockUnion>();
        const textParts = Array.of<string>();
        try {
          if (msg.attachments && msg.attachments.length > 0) {
            let currentUserFileCount = 0;

            for (const attachment of msg.attachments) {
              const {
                cdnUrl,
                mime: ogMime,
                compatStatus,
                compatCdnUrl,
                compatMime
              } = attachment;
              const url = compatStatus === "ACTIVE" ? compatCdnUrl : cdnUrl;
              const mime = compatStatus === "ACTIVE" ? compatMime : ogMime;

              if (url && mime) {
                const [filename, ext] = this.prisma.filenameToHexExtTuple(
                  url,
                  attachment.compatStatus,
                  false
                );

                const name = `${filename}.${ext}`;

                if (attachment.assetType === "DOCUMENT") {
                  try {
                    const { fileId, docUri } =
                      await this.ensureXaiAssetUploaded(
                        attachment,
                        keyFingerprint,
                        keyId,
                        apiKey,
                        mgmtKey
                      );
                    if (isFreshContext) {
                      try {
                        if (!isCurrentUserMsg) {
                          textParts.push(`[${name}](${docUri})`);
                        } else {
                          if (
                            currentUserFileCount === 0 &&
                            this.canViewDocs(model)
                          ) {
                            const docBlock = {
                              type: "input_file",
                              file_id: fileId
                            } satisfies FileContentBlock;
                            content.push(docBlock);
                            currentUserFileCount += 1;
                          } else {
                            textParts.push(`[${name}](${docUri})`);
                          }
                        }
                      } catch {
                        textParts.push(`[${name}](${docUri})`);
                      }
                    } else {
                      textParts.push(`[${name}](${docUri})`);
                    }
                  } catch (err) {
                    this.logger.warn(
                      { err: this.prisma.safeErrMsg(err) },
                      `Failed to upload PDF to Collections/Files API of collectionId ${collectionId}.`
                    );
                  }
                } else if (attachment.assetType === "IMAGE") {
                  if (
                    isFreshContext &&
                    isCurrentUserMsg &&
                    this.canViewImgs(model)
                  ) {
                    const imgBlock = {
                      type: "input_image",
                      image_url: url,
                      detail: imgDetail ?? "auto"
                    } satisfies ImageContentBlock;
                    content.push(imgBlock);
                  } else {
                    textParts.push(`![${name}](${url})`);
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error(this.prisma.safeErrMsg(err));
        } finally {
          textParts.push(this.messageText(msg));
        }
        content.push({
          type: "input_text",
          text: textParts.join("\n\n")
        } satisfies TextContentBlock);
        formatted.push({
          role: "user",
          content: content
        } as const satisfies ResponsesContentInputSingleton);
      } else {
        const textParts = Array.of<string>();
        const content = Array.of<ContentBlockUnion>();
        const modelIdentifier = `[${msg.provider.toLowerCase()}/${msg.model ?? "model"}]`;
        try {
          if (msg.attachments && msg.attachments.length > 0) {
            for (const att of msg.attachments) {
              const {
                cdnUrl,
                mime: ogMime,
                compatStatus,
                assetType,
                compatCdnUrl,
                compatMime
              } = att;
              const url = compatStatus === "ACTIVE" ? compatCdnUrl : cdnUrl;
              const mime = compatStatus === "ACTIVE" ? compatMime : ogMime;

              if (url && mime) {
                const [filename, ext] = this.prisma.filenameToHexExtTuple(
                  url,
                  att.compatStatus,
                  false
                );

                const name = `${filename}.${ext}`;

                if (assetType === "DOCUMENT") {
                  try {
                    const { docUri } = await this.ensureXaiAssetUploaded(
                      att,
                      keyFingerprint,
                      keyId,
                      apiKey,
                      mgmtKey
                    );
                    textParts.push(`${modelIdentifier}\n[${name}](${docUri})`);
                  } catch (err) {
                    this.logger.warn(
                      { err: this.prisma.safeErrMsg(err) },
                      `Failed to upload PDF to Collections/Files API of collectionId ${collectionId}.`
                    );
                  }
                  // can have image attachments from image gen models in multi-provider/multi-model convos
                } else if (assetType === "IMAGE") {
                  textParts.push(`${modelIdentifier}\n![${name}](${url})`);
                }
              }
            }
          }
        } catch (err) {
          console.error(this.prisma.safeErrMsg(err));
        } finally {
          textParts.push(`${modelIdentifier}\n\n${this.messageText(msg)}`);
        }
        content.push({
          type: "input_text",
          text: textParts.join(`\n\n`)
        } satisfies TextContentBlock);
        formatted.push({
          role: "assistant",
          content
        } as const satisfies ResponsesComprehensive);
      }
    }

    return formatted;
  }
 */
