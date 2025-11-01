import type { PrismaClientWithAccelerate } from "@/lib/prisma";
import { ErrorHelperService } from "@/orm/err-helper";
import type {
  $Enums,
  Conversation,
  ConversationSettings,
  Message
} from "@slipstream/db/edge-client";

export type GetMessagesByConversationIdRT =
  | null
  | (Conversation & {
      messages: Message[];
      conversationSettings: ConversationSettings | null;
    });

export class PrismaUserMessageService extends ErrorHelperService {
  constructor(public prismaClient: PrismaClientWithAccelerate) {
    super();
  }
  public async getMessages(conversationId: string): Promise<Message[]> {
    return await this.prismaClient.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      cacheStrategy: { swr: 3600, ttl: 60 }
    });
  }

  public sanitizeTitle(generatedTitle: string) {
    return generatedTitle.trim().replace(/^(['"])(.*?)\1$/, "$2");
  }

  public async getSidebarData(userId: string) {
    return await this.prismaClient.conversation
      .findMany({
        where: { userId },
        orderBy: [{ updatedAt: "desc" }]
      })
      .then(t => {
        return t.map(v => ({
          id: v.id,
          title: this.sanitizeTitle(v.title ?? "Untitled"),
          updatedAt: v.updatedAt
        }));
      });
  }

  public async getMessagesByConversationId(conversationId: string) {
    return await this.prismaClient.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        conversationSettings: true
      }
    });
  }

  public async getMessagesByConversationIdWithAssets(
    conversationId: string
  ): Promise<
    | ({
        conversationSettings: {
          id: string;
          createdAt: Date;
          updatedAt: Date;
          conversationId: string;
          systemPrompt: string | null;
          enableThinking: boolean | null;
          trackUsage: boolean | null;
          enableWebSearch: boolean | null;
          enableAssetGen: boolean | null;
          reasoningEffort: $Enums.ReasoningEffort | null;
          outputVerbosity: $Enums.OutputVerbosity | null;
          maxTokens: number | null;
          usageAlerts: boolean | null;
          temperature: number | null;
          topP: number | null;
        } | null;
        messages: ({
          imageGenJob: {
            error: string | null;
            model: string;
            id: string;
            userId: string;
            userKeyId: string | null;
            createdAt: Date;
            updatedAt: Date;
            systemPrompt: string | null;
            temperature: number | null;
            topP: number | null;
            provider: $Enums.Provider;
            requestMessageId: string;
            keyFingerprint: string | null;
            prompt: string;
            nRequested: number;
            nCompleted: number;
            seed: number | null;
            negativePrompt: string | null;
            outputSize: string | null;
            outputQuality: string | null;
            outputFormat: string | null;
            outputBackground: string | null;
            outputCompression: number | null;
            partialImagesRequested: number | null;
            inputFidelity: string | null;
            personGeneration: string | null;
            moderation: string | null;
            stage: $Enums.ImageGenStage;
            progress: number;
            etaSeconds: number | null;
            durationMs: number | null;
            usage: number | null;
            revisedPrompt: string | null;
          } | null;
          attachments: ({
            imageGenOutput: {
              id: string;
              createdAt: Date;
              updatedAt: Date;
              revisedPrompt: string | null;
              seriesId: string;
              ext: string | null;
              mime: string | null;
              jobId: string;
              jobIndex: number;
              kind: $Enums.ImageGenOutputKind;
              seriesIndex: number;
              isPartial: boolean;
              attachmentId: string;
              width: number | null;
              height: number | null;
            } | null;
            image: {
              createdAt: Date;
              updatedAt: Date;
              attachmentId: string;
              width: number;
              height: number;
              format: $Enums.ImageFormat;
              aspectRatio: number | null;
              frames: number;
              hasAlpha: boolean | null;
              animated: boolean;
              orientation: number | null;
              colorSpace: $Enums.ColorSpace | null;
              exifDateTimeOriginal: Date | null;
              cameraMake: string | null;
              cameraModel: string | null;
              lensModel: string | null;
              gpsLat: number | null;
              gpsLon: number | null;
              dominantColorHex: string | null;
              iccProfile: string | null;
            } | null;
            document: {
              title: string | null;
              createdAt: Date;
              updatedAt: Date;
              attachmentId: string;
              format: string;
              pageCount: number | null;
              wordCount: number | null;
              language: string | null;
              author: string | null;
              subject: string | null;
              keywords: string[];
              pdfVersion: string | null;
              isEncrypted: boolean;
              isSearchable: boolean;
              encoding: string | null;
              lineCount: number | null;
              textPreview: string | null;
            } | null;
          } & {
            id: string;
            userId: string;
            createdAt: Date;
            updatedAt: Date;
            conversationId: string | null;
            draftId: string | null;
            batchId: string | null;
            generationGroupId: string | null;
            seriesId: string | null;
            messageId: string | null;
            s3ObjectId: string | null;
            origin: $Enums.AssetOrigin;
            status: $Enums.AssetStatus;
            uploadMethod: $Enums.UploadMethod;
            assetType: $Enums.AssetType;
            uploadDuration: number | null;
            cdnUrl: string | null;
            publicUrl: string | null;
            sourceUrl: string | null;
            thumbnailKey: string | null;
            compatMime: string | null;
            compatExt: string | null;
            compatVersionId: string | null;
            compatKey: string | null;
            compatS3ObjectId: string | null;
            compatStatus: $Enums.CompatStatus | null;
            compatReadyAt: Date | null;
            compatCdnUrl: string | null;
            bucket: string;
            key: string;
            versionId: string | null;
            region: string;
            cacheControl: string | null;
            contentDisposition: string | null;
            contentEncoding: string | null;
            expiresAt: Date | null;
            size: bigint | null;
            filename: string | null;
            ext: string | null;
            mime: string | null;
            etag: string | null;
            checksumAlgo: $Enums.ChecksumAlgo;
            checksumSha256: string | null;
            storageClass: string | null;
            sseAlgorithm: string | null;
            sseKmsKeyId: string | null;
            s3LastModified: Date | null;
            deletedAt: Date | null;
          })[];
        } & {
          model: string | null;
          id: string;
          userId: string | null;
          userKeyId: string | null;
          createdAt: Date;
          updatedAt: Date;
          conversationId: string;
          senderType: $Enums.SenderType;
          provider: $Enums.Provider;
          content: string;
          thinkingText: string | null;
          thinkingDuration: number | null;
          isImageGen: boolean;
          messageType: $Enums.MessageType;
          liked: boolean | null;
          disliked: boolean | null;
          tryAgain: boolean | null;
        })[];
      } & {
        id: string;
        shareToken: string | null;
        userId: string;
        userKeyId: string | null;
        title: string | null;
        createdAt: Date;
        updatedAt: Date;
        branchId: string | null;
        parentId: string | null;
        isShared: boolean;
      })
    | null
  > {
    return await this.prismaClient.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },

          include: {
            imageGenJob: true,
            attachments: {
              orderBy: { createdAt: "asc" },
              include: { image: true, document: true, imageGenOutput: true }
              // select: {
              //   messageId: true,
              //   conversationId: true,
              //   versionId: true,
              //   uploadMethod: true,
              //   createdAt: true,
              //   id: true,
              //   filename: true,
              //   mime: true,
              //   size: true,
              //   cdnUrl: true,
              //   publicUrl: true,
              //   assetType: true,
              //   imageGenOutput: true,
              //   ext: true,
              //   draftId: true,
              //   batchId: true,
              //   generationGroupId: true,
              //   document: true,
              //   image: true
              // }
            }
          }
        },
        conversationSettings: true
      }
    });
  }

  public async getTitleByConversationId(conversationId: string) {
    return await this.prismaClient.conversation
      .findUnique({
        where: { id: conversationId },
        select: { title: true }
      })
      .then(t => {
        return t?.title ?? "Untitled";
      });
  }

  public async updateConversationTitle(
    conversationId: string,
    updatedTitle: string
  ) {
    return await this.prismaClient.conversation.update({
      where: { id: conversationId },
      data: { title: updatedTitle }
    });
  }

  public async deleteConversation(conversationId: string) {
    return await this.prismaClient.conversation.delete({
      where: { id: conversationId }
    });
  }
}
/**
 * : Promise<
    | ({
        conversationSettings: {
          id: string;
          createdAt: Date;
          updatedAt: Date;
          conversationId: string;
          systemPrompt: string | null;
          enableThinking: boolean | null;
          trackUsage: boolean | null;
          enableWebSearch: boolean | null;
          enableAssetGen: boolean | null;
          reasoningEffort:
            | $Enums.ReasoningEffort
            | null;
          outputVerbosity:
            | $Enums.OutputVerbosity
            | null;
          maxTokens: number | null;
          usageAlerts: boolean | null;
          temperature: number | null;
          topP: number | null;
        } | null;
        messages: ({
          imageGenJob:
            | ({
                outputs: {
                  id: string;
                  createdAt: Date;
                  updatedAt: Date;
                  seriesId: string;
                  ext: string | null;
                  mime: string | null;
                  revisedPrompt: string | null;
                  jobId: string;
                  jobIndex: number;
                  kind: $Enums.ImageGenOutputKind;
                  seriesIndex: number;
                  isPartial: boolean;
                  attachmentId: string;
                  width: number | null;
                  height: number | null;
                }[];
              } & {
                id: string;
                userId: string;
                userKeyId: string | null;
                createdAt: Date;
                updatedAt: Date;
                provider: $Enums.Provider;
                model: string;
                systemPrompt: string | null;
                temperature: number | null;
                topP: number | null;
                error: string | null;
                requestMessageId: string;
                keyFingerprint: string | null;
                prompt: string;
                nRequested: number;
                nCompleted: number;
                seed: number | null;
                negativePrompt: string | null;
                outputSize: string | null;
                outputQuality: string | null;
                outputFormat: string | null;
                outputBackground: string | null;
                outputCompression: number | null;
                partialImagesRequested: number | null;
                inputFidelity: string | null;
                personGeneration: string | null;
                moderation: string | null;
                stage: $Enums.ImageGenStage;
                progress: number;
                etaSeconds: number | null;
                durationMs: number | null;
                usage: number | null;
                revisedPrompt: string | null;
              })
            | null;
          attachments: {
            id: string;
            createdAt: Date;
            conversationId: string | null;
            imageGenOutput: {
              id: string;
              createdAt: Date;
              updatedAt: Date;
              seriesId: string;
              ext: string | null;
              mime: string | null;
              revisedPrompt: string | null;
              jobId: string;
              jobIndex: number;
              kind: $Enums.ImageGenOutputKind;
              seriesIndex: number;
              isPartial: boolean;
              attachmentId: string;
              width: number | null;
              height: number | null;
            } | null;
            draftId: string | null;
            batchId: string | null;
            generationGroupId: string | null;
            messageId: string | null;
            uploadMethod: $Enums.UploadMethod;
            assetType: $Enums.AssetType;
            cdnUrl: string | null;
            publicUrl: string | null;
            versionId: string | null;
            size: bigint | null;
            filename: string | null;
            ext: string | null;
            mime: string | null;
            image: {
              createdAt: Date;
              updatedAt: Date;
              attachmentId: string;
              width: number;
              height: number;
              format: $Enums.ImageFormat;
              aspectRatio: number | null;
              frames: number;
              hasAlpha: boolean | null;
              animated: boolean;
              orientation: number | null;
              colorSpace:
                | $Enums.ColorSpace
                | null;
              exifDateTimeOriginal: Date | null;
              cameraMake: string | null;
              cameraModel: string | null;
              lensModel: string | null;
              gpsLat: number | null;
              gpsLon: number | null;
              dominantColorHex: string | null;
              iccProfile: string | null;
            } | null;
            document: {
              title: string | null;
              createdAt: Date;
              updatedAt: Date;
              attachmentId: string;
              format: string;
              pageCount: number | null;
              wordCount: number | null;
              language: string | null;
              author: string | null;
              subject: string | null;
              keywords: string[];
              pdfVersion: string | null;
              isEncrypted: boolean;
              isSearchable: boolean;
              encoding: string | null;
              lineCount: number | null;
              textPreview: string | null;
            } | null;
          }[];
        } & {
          id: string;
          userId: string | null;
          userKeyId: string | null;
          createdAt: Date;
          updatedAt: Date;
          conversationId: string;
          senderType: $Enums.SenderType;
          provider: $Enums.Provider;
          model: string | null;
          content: string;
          thinkingText: string | null;
          thinkingDuration: number | null;
          isImageGen: boolean;
          messageType: $Enums.MessageType;
          liked: boolean | null;
          disliked: boolean | null;
          tryAgain: boolean | null;
        })[];
      } & {
        id: string;
        userId: string;
        userKeyId: string | null;
        title: string | null;
        createdAt: Date;
        updatedAt: Date;
        branchId: string | null;
        parentId: string | null;
        isShared: boolean;
        shareToken: string | null;
      })
    | null
  >
 */
