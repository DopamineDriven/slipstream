import type {
  HandleAiChatReqCreateSansImgGenAndAttachmentsProps,
  HandleAiChatReqCreateSansImgGenSansAttachmentsProps,
  HandleAiChatReqCreateWithImgGenAndAttachmentsProps,
  HandleAiChatReqCreateWithImgGenSansAttachmentsProps,
  HandleAiChatRequestRT,
  HandleAiChatReqUpdateSansImgGenAndAttachmentsProps,
  HandleAiChatReqUpdateSansImgGenSansAttachmentsProps,
  HandleAiChatReqUpdateWithImgGenAndAttachmentsProps,
  HandleAiChatReqUpdateWithImgGenSansAttachmentsProps
} from "@/types/index.ts";
import { ExtractService } from "@/extract/index.ts";
import { PrismaAttachmentService } from "@/prisma/attachment.ts";
import type { ImageGenOutputCreateNestedOneWithoutAttachmentInput } from "@slipstream/db/node/generated/models";
import type {
  AIChatRequest,
  AIChatResponseDb,
  AllModelsUnion,
  CTR,
  Rm
} from "@slipstream/types";
import { PrismaDbService } from "@slipstream/db/factory";

export class PrismaChatService extends PrismaAttachmentService {
  constructor(
    prisma: PrismaDbService,
    extractor: ExtractService,
    isProd: boolean
  ) {
    super(prisma, extractor, isProd);
  }

  private async handleAiChatReqCreateWithAttachments({
    userId,
    batchId
  }: {
    userId: string;
    batchId: string;
  }) {
    return await this.prismaClient.$transaction(async pr => {
      const attachments = await pr.attachment.findMany({
        where: { batchId, userId },
        take: 10,
        orderBy: [{ createdAt: "desc" }],
        include: { image: true, document: true, audio: true }
      });
      const connectById = attachments.map(({ id }) => ({ id }));
      const extended = attachments.map(t => {
        const { compatStatus, assetType, compatCdnUrl, compatMime, compatExt } =
          t;
        return {
          type: assetType === "IMAGE" ? assetType : ("DOCUMENT" as const),
          compatStatus: compatStatus ?? "ALIASED",
          url: compatCdnUrl ?? "",
          mime: compatMime ?? "",
          ext: compatExt ?? ""
        };
      });

      const withAssetInfo = {
        assetCounts: extended.length,
        assets: extended
      };
      return { withAssetInfo, connectById };
    });
  }

  private async handleAiChatReqUpdateWithAttachments({
    batchId,
    conversationId,
    userId
  }: {
    userId: string;
    batchId: string;
    conversationId: string;
  }) {
    const attachments = await this.prismaClient.attachment.findMany({
      where: { batchId, userId, conversationId, messageId: null },
      take: 10,
      orderBy: [{ createdAt: "desc" }],
      include: { image: true, document: true }
    });
    const extended = attachments.map(t => {
      const { compatStatus, assetType, compatCdnUrl, compatMime, compatExt } =
        t;
      return {
        type: assetType === "IMAGE" ? assetType : ("DOCUMENT" as const),
        compatStatus: compatStatus ?? "ALIASED",
        url: compatCdnUrl ?? "",
        mime: compatMime ?? "",
        ext: compatExt ?? ""
      };
    });

    const withAssetInfo = {
      assetCounts: extended.length,
      assets: extended
    };
    const connectById = attachments.map(({ id }) => ({ id }));
    return { withAssetInfo, connectById };
  }

  private async handleAiChatReqCreateWithAttachmentsWithImgGen({
    batchId,
    create,
    includeWithAttachments,
    messageData,
    userId,
    apiKey,
    keyId
  }: HandleAiChatReqCreateWithImgGenAndAttachmentsProps) {
    const { connectById, withAssetInfo } =
      await this.handleAiChatReqCreateWithAttachments({ userId, batchId });
    const convo = await this.prismaClient.conversation.create({
      data: {
        userId,
        userKeyId: keyId,
        conversationSettings: { create }
      }
    });
    const createConvo = await this.prismaClient.conversation.update({
      where: { id: convo.id },
      include: includeWithAttachments,
      data: {
        attachments: { connect: connectById },
        messages: {
          create: {
            messageBlocks: {
              create: {
                content: messageData.content,
                conversationId: convo.id,
                ordinal: 0,
                type: "TEXT"
              }
            },
            attachments: { connect: connectById },
            ...messageData
          }
        }
      }
    });

    const lastMsg = createConvo.messages.at(-1);
    if (!lastMsg) throw new Error("no last message found");

    return this.toCompatPropsExtened(
      "image_gen_request",
      this.bigintToNumber("image_gen_request", {
        apiKey,
        ...createConvo
      }),
      {
        jobId: lastMsg?.imageGenJob?.id,
        requestMessageId: lastMsg?.id,
        ...withAssetInfo
      }
    );
  }

  private async handleAiChatReqCreateSansAttachmentsWithImgGen({
    create,
    includeSansAttachments,
    messageData,
    userId,
    apiKey,
    keyId
  }: HandleAiChatReqCreateWithImgGenSansAttachmentsProps) {
    const conversationSettings = { create };

    const convo = await this.prismaClient.conversation.create({
      data: {
        userId,
        userKeyId: keyId,
        conversationSettings
      }
    });
    const p = await this.prismaClient.conversation.update({
      where: { id: convo.id },
      include: includeSansAttachments,
      data: {
        messages: {
          create: {
            messageBlocks: {
              create: {
                content: messageData.content,
                conversationId: convo.id,
                ordinal: 0,
                type: "TEXT"
              }
            },
            ...messageData
          }
        }
      }
    });

    const apiKeyAndRes = { apiKey, ...p };
    const lastMsg = apiKeyAndRes.messages.at(-1);
    return this.toCompatPropsExtened(
      "image_gen_request",
      this.bigintToNumber("image_gen_request", apiKeyAndRes),
      {
        jobId: lastMsg?.imageGenJob?.id,
        requestMessageId: lastMsg?.id,
        assetCounts: 0,
        assets: undefined
      }
    );
  }

  private async handleAiChatReqCreateSansAttachmentsSansImgGen({
    apiKey,
    create,
    keyId,
    prompt,
    provider,
    userId,
    model
  }: HandleAiChatReqCreateSansImgGenSansAttachmentsProps) {
    const convo = await this.prismaClient.conversation.create({
      data: {
        userId,
        userKeyId: keyId,
        conversationSettings: { create }
      }
    });
    const p = await this.prismaClient.conversation.update({
      where: { id: convo.id },
      include: {
        conversationSettings: true,
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            imageGenJob: true,
            messageBlocks: true,
            attachments: {
              where: {
                OR: [
                  { origin: { not: "GENERATED" } },
                  {
                    AND: [
                      { origin: "GENERATED" },
                      { imageGenOutput: { kind: "FINAL" } }
                    ]
                  }
                ]
              },
              orderBy: { createdAt: "asc" },
              include: {
                image: true,
                audio: true,
                document: true,
                imageGenOutput: true
              }
            }
          }
        }
      },
      data: {
        messages: {
          create: {
            messageBlocks: {
              create: {
                content: prompt,
                conversationId: convo.id,
                ordinal: 0,
                type: "TEXT"
              }
            },
            content: prompt,
            provider: this.providerToPrismaFormat(provider),
            senderType: "USER",
            model,
            userId,
            userKeyId: keyId
          }
        }
      }
    });
    const apiKeyAndRes = { apiKey, ...p };
    const lastMsg = apiKeyAndRes.messages.at(-1);
    return this.toCompatPropsExtened(
      "ai_chat_request",
      this.bigintToNumber("ai_chat_request", apiKeyAndRes),
      {
        jobId: lastMsg?.imageGenJob?.id ?? undefined,
        requestMessageId: lastMsg?.id,
        assetCounts: 0,
        assets: undefined
      }
    );
  }

  private async handleAiChatReqCreateWithAttachmentsSansImgGen({
    batchId,
    create,
    prompt,
    userId,
    apiKey,
    keyId,
    provider,
    model
  }: HandleAiChatReqCreateSansImgGenAndAttachmentsProps) {
    const { connectById, withAssetInfo } =
      await this.handleAiChatReqCreateWithAttachments({ userId, batchId });
    const conversationSettings = { create };
    const convo = await this.prismaClient.conversation.create({
      data: {
        userId,
        userKeyId: keyId,
        conversationSettings
      }
    });
    const dataConvoCreate = {
      attachments: { connect: connectById },
      messages: {
        create: {
          attachments: { connect: connectById },
          messageBlocks: {
            create: {
              content: prompt,
              conversationId: convo.id,
              ordinal: 0,
              type: "TEXT"
            }
          },
          content: prompt,
          provider: this.providerToPrismaFormat(provider),
          senderType: "USER",
          model: model ?? null,
          userId,
          userKeyId: keyId
        }
      }
    } as const;
    const dat = await this.prismaClient.conversation.update({
      where: { id: convo.id },
      include: {
        conversationSettings: true,
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            imageGenJob: true,
            messageBlocks: true,
            attachments: {
              where: {
                OR: [
                  { origin: { not: "GENERATED" } },
                  {
                    AND: [
                      { origin: "GENERATED" },
                      { imageGenOutput: { kind: "FINAL" } }
                    ]
                  }
                ]
              },
              orderBy: { createdAt: "asc" },
              include: {
                image: true,
                document: true,
                audio: true,
                imageGenOutput: true
              }
            }
          }
        }
      },
      data: dataConvoCreate
    });
    const lastMsg = dat.messages.at(-1);
    return this.toCompatPropsExtened(
      "ai_chat_request",
      this.bigintToNumber("ai_chat_request", {
        apiKey,
        ...dat
      }),

      {
        jobId: lastMsg?.imageGenJob?.id,
        requestMessageId: lastMsg?.id,
        ...withAssetInfo
      }
    );
  }

  private async handleAiChatReqUpdateWithAttachmentsSansImageGen({
    apiKey,
    batchId,
    conversationId,
    update,
    keyId,
    prompt,
    provider,
    userId,
    model
  }: HandleAiChatReqUpdateSansImgGenAndAttachmentsProps) {
    const { connectById, withAssetInfo } =
      await this.handleAiChatReqUpdateWithAttachments({
        batchId,
        conversationId,
        userId
      });

    const d = await this.prismaClient.conversation.update({
      include: {
        conversationSettings: true,
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            imageGenJob: true,
            messageBlocks: true,
            attachments: {
              where: {
                OR: [
                  { origin: { not: "GENERATED" } },
                  {
                    AND: [
                      { origin: "GENERATED" },
                      { imageGenOutput: { kind: "FINAL" } }
                    ]
                  }
                ]
              },
              orderBy: { createdAt: "asc" },
              include: {
                image: true,
                document: true,
                audio: true,
                imageGenOutput: true
              }
            }
          }
        }
      },
      where: { id: conversationId },
      data: {
        attachments: { connect: connectById },
        messages: {
          create: {
            messageBlocks: {
              create: {
                content: prompt,
                conversationId,
                ordinal: 0,
                type: "TEXT"
              }
            },
            attachments: { connect: connectById },
            content: prompt,
            senderType: "USER",
            provider: this.providerToPrismaFormat(provider),
            model,
            userId,
            userKeyId: keyId
          }
        },
        conversationSettings: {
          update
        },
        userId,
        userKeyId: keyId
      }
    });
    const lastMsg = d.messages.at(-1);
    return this.toCompatPropsExtened(
      "ai_chat_request",
      this.bigintToNumber("ai_chat_request", {
        apiKey,
        ...d
      }),
      {
        jobId: lastMsg?.imageGenJob?.id,
        requestMessageId: lastMsg?.id,
        ...withAssetInfo
      }
    );
  }

  private async handleAiChatReqUpdateWithAttachmentsWithImageGen({
    apiKey,
    batchId,
    conversationId,
    update,
    includeWithAttachments,
    keyId,
    messageData,
    userId
  }: HandleAiChatReqUpdateWithImgGenAndAttachmentsProps) {
    const conversationSettings = {
      update
    } as const;
    const { connectById, withAssetInfo } =
      await this.handleAiChatReqUpdateWithAttachments({
        batchId,
        conversationId,
        userId
      });
    const updateConvo = await this.prismaClient.conversation.update({
      include: includeWithAttachments,
      where: { id: conversationId },
      data: {
        attachments: { connect: connectById },
        messages: {
          create: {
            messageBlocks: {
              create: {
                content: messageData.content,
                conversationId,
                ordinal: 0,
                type: "TEXT"
              }
            },
            attachments: { connect: connectById },
            ...messageData
          }
        },
        conversationSettings,
        userId,
        userKeyId: keyId
      }
    });

    const lastMsg = updateConvo.messages.at(-1);
    return this.toCompatPropsExtened(
      "image_gen_request",
      this.bigintToNumber("image_gen_request", {
        apiKey,
        ...updateConvo
      }),
      {
        jobId: lastMsg?.imageGenJob?.id,
        requestMessageId: lastMsg?.id,
        ...withAssetInfo
      }
    );
  }

  private async handleAiChatReqUpdateSansAttachmentsWithImageGen({
    apiKey,
    conversationId,
    includeSansAttachments,
    keyId,
    messageData,
    update,
    userId
  }: HandleAiChatReqUpdateWithImgGenSansAttachmentsProps) {
    const conversationSettings = {
      update
    } as const;
    const pr = await this.prismaClient.conversation.update({
      include: includeSansAttachments,
      where: { id: conversationId },
      data: {
        messages: {
          create: {
            messageBlocks: {
              create: {
                content: messageData.content,
                conversationId,
                ordinal: 0,
                type: "TEXT"
              }
            },
            ...messageData
          }
        },
        conversationSettings,
        userId,
        userKeyId: keyId
      }
    });
    const apiKeyAndRes = { apiKey, ...pr };
    const lastMsg = apiKeyAndRes.messages.at(-1);
    return this.toCompatPropsExtened(
      "image_gen_request",
      this.bigintToNumber("image_gen_request", apiKeyAndRes),
      {
        jobId: lastMsg?.imageGenJob?.id,
        requestMessageId: lastMsg?.id,
        assetCounts: 0,
        assets: undefined
      }
    );
  }

  private async handleAiChatReqUpdateSansAttachmentsSansImageGen({
    apiKey,
    keyId,
    prompt,
    provider,
    update,
    userId,
    model,
    conversationId
  }: HandleAiChatReqUpdateSansImgGenSansAttachmentsProps) {
    const pr = await this.prismaClient.conversation.update({
      include: {
        conversationSettings: true,
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            messageBlocks: true,
            imageGenJob: true,
            attachments: {
              where: {
                OR: [
                  { origin: { not: "GENERATED" } },
                  {
                    AND: [
                      { origin: "GENERATED" },
                      { imageGenOutput: { kind: "FINAL" } }
                    ]
                  }
                ]
              },
              orderBy: { createdAt: "asc" },
              include: {
                image: true,
                document: true,
                audio: true,
                imageGenOutput: true
              }
            }
          }
        }
      },
      where: { id: conversationId },
      data: {
        messages: {
          create: {
            messageBlocks: {
              create: {
                content: prompt,
                conversationId,
                ordinal: 0,
                type: "TEXT"
              }
            },
            content: prompt,
            senderType: "USER",
            provider: this.providerToPrismaFormat(provider),
            model,
            userId,
            userKeyId: keyId
          }
        },
        conversationSettings: {
          update
        },
        userId,
        userKeyId: keyId
      }
    });
    const apiKeyAndRes = { apiKey, ...pr };
    const lastMsg = apiKeyAndRes.messages.at(-1);
    return this.toCompatPropsExtened(
      "ai_chat_request",
      this.bigintToNumber("ai_chat_request", apiKeyAndRes),
      {
        jobId: lastMsg?.imageGenJob?.id,
        requestMessageId: lastMsg?.id,
        assetCounts: 0,
        assets: undefined
      }
    );
  }

  public async handleAiChatRequest({
    userId,
    batchId,
    provider,
    prompt,
    conversationId,
    ...data
  }: Rm<AIChatRequest, "type"> & {
    userId: string;
  }): Promise<HandleAiChatRequestRT> {
    const { keyId, apiKey } = await this.handleApiKeyLookup(provider, userId);
    const {
      model: textModel,
      topP,
      maxTokens,
      systemPrompt,
      temperature
    } = data;

    if (provider === "gemini" || provider === "grok" || provider === "openai") {
      const model =
        typeof data?.model === "undefined" && data?.imgGenEnabled === true
          ? (this.fallbackImgGenModelByProvider(provider) as AllModelsUnion)
          : data?.model;

      const { includeSansAttachments, includeWithAttachments, messageData } =
        this.handleAiChatRequestImgGenWorkup({
          userId: userId,
          batchId,
          prompt,
          conversationId,
          imgGenEnabled: data.imgGenEnabled,
          provider,
          model: model,
          hasProviderConfigured: data.hasProviderConfigured,
          apiKey,
          keyId,
          ...data
        });

      /** CREATE */
      if (conversationId === "new-chat") {
        /** CREATE, WITH ATTACHMENTS */
        if (typeof batchId !== "undefined") {
          /** CREATE, WITH ATTACHMENTS, WITH IMAGE GEN */
          if (data.imgGenEnabled === true) {
            return await this.handleAiChatReqCreateWithAttachmentsWithImgGen({
              batchId,
              create: {
                maxTokens,
                topP,
                enableAssetGen: true,
                systemPrompt,
                temperature
              },
              apiKey,
              includeWithAttachments,
              keyId,
              messageData,
              userId
            });
          } else {
            /** CREATE, WITH ATTACHMENTS, SANS IMAGE GEN */
            return await this.handleAiChatReqCreateWithAttachmentsSansImgGen({
              apiKey,
              batchId,
              create: { maxTokens, systemPrompt, temperature, topP },
              keyId,
              prompt,
              provider,
              userId,
              model
            });
          }
        } else {
          /** CREATE, SANS ATTACHMENTS, WITH IMAGE GEN */
          if (data.imgGenEnabled === true) {
            return await this.handleAiChatReqCreateSansAttachmentsWithImgGen({
              apiKey,
              create: {
                maxTokens,
                enableAssetGen: true,
                systemPrompt,
                temperature,
                topP
              },
              includeSansAttachments,
              keyId,
              messageData,
              userId
            });
          }
          /** CREATE, SANS ATTACHMENTS, SANS IMAGE GEN */
          return await this.handleAiChatReqCreateSansAttachmentsSansImgGen({
            apiKey,
            create: { maxTokens, systemPrompt, temperature, topP },
            keyId,
            prompt,
            provider,
            userId,
            model
          });
        }
      } else {
        /** UPDATE, WITH ATTACHMENTS*/
        if (typeof batchId !== "undefined") {
          /** UPDATE, WITH ATTACHMENTS, WITH IMAGE GEN */
          if (data.imgGenEnabled === true) {
            return await this.handleAiChatReqUpdateWithAttachmentsWithImageGen({
              apiKey,
              batchId,
              conversationId,
              update: {
                enableAssetGen: true,
                maxTokens,
                systemPrompt,
                temperature,
                topP
              },
              includeWithAttachments,
              keyId,
              messageData,
              userId
            });
          }
          /** UPDATE, WITH ATTACHMENTS, SANS IMAGE GEN */
          return await this.handleAiChatReqUpdateWithAttachmentsSansImageGen({
            apiKey,
            batchId,
            conversationId,
            keyId,
            prompt,
            provider,
            update: { maxTokens, systemPrompt, temperature, topP },
            userId,
            model
          });
        }
        /** UPDATE, SANS ATTACHMENTS, WITH IMAGE GEN */
        if (data.imgGenEnabled === true) {
          return await this.handleAiChatReqUpdateSansAttachmentsWithImageGen({
            apiKey,
            conversationId,
            includeSansAttachments,
            keyId,
            messageData,
            update: {
              enableAssetGen: true,
              maxTokens,
              systemPrompt,
              temperature,
              topP
            },
            userId
          });
        }

        /** UPDATE, SANS ATTACHMENTS, SANS IMAGE GEN */
        return await this.handleAiChatReqUpdateSansAttachmentsSansImageGen({
          apiKey,
          conversationId,
          keyId,
          prompt,
          provider,
          update: { maxTokens, systemPrompt, temperature, topP },
          userId,
          model
        });
      }
    }
    if (conversationId === "new-chat") {
      if (typeof batchId !== "undefined") {
        /** CREATE, WITH ATTACHMENTS, SANS IMAGE GEN */
        return await this.handleAiChatReqCreateWithAttachmentsSansImgGen({
          apiKey,
          batchId,
          create: { maxTokens, systemPrompt, temperature, topP },
          keyId,
          prompt,
          provider,
          userId,
          model: textModel
        });
      }
      /** CREATE, SANS ATTACHMENTS, SANS IMAGE GEN */
      return await this.handleAiChatReqCreateSansAttachmentsSansImgGen({
        apiKey,
        create: { maxTokens, systemPrompt, temperature, topP },
        keyId,
        prompt,
        provider,
        userId,
        model: textModel
      });
    } else {
      /** UPDATE, WITH ATTACHMENTS, SANS IMAGE GEN */
      if (typeof batchId !== "undefined") {
        return await this.handleAiChatReqUpdateWithAttachmentsSansImageGen({
          apiKey,
          batchId,
          conversationId,
          keyId,
          prompt,
          provider,
          update: { maxTokens, systemPrompt, temperature, topP },
          userId,
          model: textModel
        });
      }
      /** UPDATE, SANS ATTACHMENTS, SANS IMAGE GEN */
      return await this.handleAiChatReqUpdateSansAttachmentsSansImageGen({
        apiKey,
        conversationId,
        keyId,
        prompt,
        provider,
        update: { maxTokens, systemPrompt, temperature, topP },
        userId,
        model: textModel
      });
    }
  }

  public async handleAiChatResponse({
    userId,
    provider,
    jobId,
    requestMessageId,
    ...data
  }: Rm<CTR<AIChatResponseDb, "provider">, "type"> & {
    uploadDuration?: number;
    requestMessageId?: string;
    jobId?: string;
    mime?: string;
  }) {
    const { keyId } = await this.handleApiKeyLookup(provider, userId);

    const mapImgs = data.imgGenFields?.images
      ?.concat(data.imgGenFields?.partialImages ?? [])
      ?.map(t => {
        const p = t.cdnUrl?.split(/\//gm);
        const filename = p?.at(-1);
        const pathFragments = filename?.split(/-/gm);
        const seriesId = t.itemId ?? t.seriesId ?? pathFragments?.[1] ?? "";
        console.log({ [`t.jobId`]: t.jobId, jobId: jobId });
        const da = {
          bucket: t.bucket,
          key: t.key,
          versionId: t.versionId,
          s3ObjectId: t.s3ObjectId,
          cdnUrl: t.cdnUrl,
          assetType: "IMAGE",
          storageClass: t.storageClass ?? undefined,
          origin: "GENERATED",
          compatMime: t.mime,
          etag: t.etag,
          compatCdnUrl: t.cdnUrl,
          compatStatus: "ALIASED",
          uploadDuration: t.uploadDuration,
          compatS3ObjectId: t.s3ObjectId,
          compatVersionId: t.versionId,
          compatKey: t.key,
          compatExt: t.ext,
          contentDisposition: t.contentDisposition,
          cacheControl: t.cacheControl,
          ext: t.ext,
          mime: t.mime,
          seriesId: t.itemId,
          region: "us-east-1",
          status: "READY",
          uploadMethod: "GENERATED",
          generationGroupId: t.generationGroupId,
          size: t.size ? BigInt(t.size) : undefined,
          s3LastModified: t.s3LastModified
            ? new Date(t.s3LastModified)
            : new Date(Date.now()),
          filename: t.filename,
          compatReadyAt: new Date(Date.now()),
          checksumAlgo: t?.checksumAlgo,
          checksumSha256: t.checksumSha256,
          image: t.image ? { create: t.image } : undefined,
          imageGenOutput: t.jobId
            ? ({
                create: {
                  mime: t.mime,
                  revisedPrompt: data.imgGenFields?.revisedPrompt,
                  kind: t.kind,
                  ext: t.ext,
                  height: t.image?.height,
                  width: t.image?.width,
                  jobId: t.jobId,
                  isPartial: t.kind === "FINAL" ? false : true,
                  jobIndex: 0,
                  seriesId: t.itemId ?? t.imageGenOutput?.seriesId ?? seriesId,
                  seriesIndex: t.index
                }
              } satisfies ImageGenOutputCreateNestedOneWithoutAttachmentInput)
            : jobId
              ? ({
                  create: {
                    mime: t.mime,
                    revisedPrompt: data.imgGenFields?.revisedPrompt,
                    kind: t.kind,
                    ext: t.ext,
                    height: t.image?.height,
                    width: t.image?.width,
                    jobId,
                    isPartial: t.kind === "FINAL" ? false : true,
                    jobIndex: 0,
                    seriesId: t.itemId ?? seriesId,
                    seriesIndex: t.index
                  }
                } satisfies ImageGenOutputCreateNestedOneWithoutAttachmentInput)
              : undefined
        } as const;
        return {
          ...da,
          user: { connect: { id: userId } }
        };
      });

    const transaction = await this.prismaClient.$transaction(async t => {
      const persist = await t.conversation.update({
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              messageBlocks: true,
              attachments: { include: { imageGenOutput: true, image: true } }
            }
          },
          conversationSettings: true
        },
        where: { id: data.conversationId },
        data: {
          messages: {
            create: {
              messageType: data?.imgGenEnabled === true ? "IMAGE_GEN" : "TEXT",
              attachments: mapImgs ? { create: mapImgs } : undefined,
              messageBlocks:
                data.messageBlocks && data.messageBlocks.length > 0
                  ? {
                      create: data.messageBlocks.map(block => ({
                        content: block.content,
                        conversationId: data.conversationId,
                        durationMs: block.durationMs,
                        ordinal: block.ordinal,
                        type: block.type
                      }))
                    }
                  : undefined,
              senderType: "AI",
              responseOutput: data.responseOutput ?? undefined,
              provider: this.providerToPrismaFormat(provider),
              model: data.model,
              thinkingDuration: data.thinkingDuration,
              thinkingText: data?.thinkingText,
              isImageGen: data.imgGenEnabled ?? false,
              userKeyId: keyId,
              content: data.imgGenFields?.revisedPrompt ?? data.chunk
            }
          },
          userId,
          title: data.title,
          userKeyId: keyId
        }
      });

      const msg = persist.messages[0];
      if (!msg) throw new Error("AIChatResponse Message was not created");
      const aiMsgId = msg?.id;

      if (
        data.imgGenEnabled === true &&
        typeof data.imgGenFields !== "undefined"
      ) {
        const imgGenAttachmentId = msg?.attachments.find(
          t => t.imageGenOutput?.kind === "FINAL"
        )?.id;
        if (!jobId || !data.imgGenFields?.images)
          throw new Error("no jobid to associate image gen with");
        const s = data.imgGenFields.images;
        if (data.imgGenFields.partialImages)
          s.concat(data.imgGenFields.partialImages);

        const outputs = {
          connect: msg.attachments
            .map(t => t.imageGenOutput?.id)
            .filter(t => typeof t !== "undefined")
            .map(v => ({ id: v }))
        } as const;
        await t.imageGenJob.update({
          where: { id: jobId },
          data: {
            stage: "COMPLETED",
            outputSize: data.imgGenFields.outputSize,
            provider: this.providerToPrismaFormat(provider),
            durationMs: data.imgGenFields.duration,
            outputBackground: data.imgGenFields.outputBackground,
            usage: data.usage,
            temperature: data.temperature,
            topP: data.topP,
            systemPrompt: data.systemPrompt,
            outputCompression: data.imgGenFields.outputCompression,
            outputFormat: data.imgGenFields.outputFormat,
            requestMessageId,
            progress: 100,
            nCompleted: s.filter(v => v.kind === "FINAL")?.length ?? 1,
            model: data.model,
            outputQuality: data.imgGenFields.outputQuality,
            revisedPrompt: data.imgGenFields.revisedPrompt,
            outputs
          }
        });
        return { aiMsgId, persist, imgGenAttachmentId };
      } else return { aiMsgId, persist, imgGenAttachmentId: undefined };
    });

    return transaction;
  }
}
