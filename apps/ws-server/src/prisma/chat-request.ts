import type { ExtractService } from "@/extract/index.ts";
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
import { PrismaAttachmentService } from "@/prisma/attachment.ts";
import type { PrismaDbService } from "@slipstream/db/factory";
import type { AIChatRequest, AllModelsUnion, Rm } from "@slipstream/types";

export class PrismaChatRequestService extends PrismaAttachmentService {
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
      include: { image: true, document: true, audio: true }
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
            ordinal: 0,
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
            ...messageData,
            ordinal: 0,
            messageBlocks: {
              create: {
                content: messageData.content,
                conversationId: convo.id,
                ordinal: 0,
                type: "TEXT"
              }
            }
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
          // ordinal is the authoritative dense sequence — createdAt can tie
          orderBy: { ordinal: "asc" },
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
            ordinal: 0,
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
    const dat = await this.prismaClient.conversation.update({
      where: { id: convo.id },
      include: {
        conversationSettings: true,
        messages: {
          // ordinal is the authoritative dense sequence — createdAt can tie
          orderBy: { ordinal: "asc" },
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
      data: {
        attachments: { connect: connectById },
        messages: {
          create: {
            ordinal: 0,
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
      }
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
    const [{ connectById, withAssetInfo }, ordinal] = await Promise.all([
      this.handleAiChatReqUpdateWithAttachments({
        batchId,
        conversationId,
        userId
      }),
      this.convoCount(conversationId)
    ]);
    const d = await this.prismaClient.conversation.update({
      include: {
        conversationSettings: true,
        messages: {
          // ordinal is the authoritative dense sequence — createdAt can tie
          orderBy: { ordinal: "asc" },
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
            ordinal,
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
    const [{ connectById, withAssetInfo }, ordinal] = await Promise.all([
      this.handleAiChatReqUpdateWithAttachments({
        batchId,
        conversationId,
        userId
      }),
      this.convoCount(conversationId)
    ]);
    const updateConvo = await this.prismaClient.conversation.update({
      include: includeWithAttachments,
      where: { id: conversationId },
      data: {
        attachments: { connect: connectById },
        messages: {
          create: {
            ...messageData,
            ordinal,
            messageBlocks: {
              create: {
                content: messageData.content,
                conversationId,
                ordinal: 0,
                type: "TEXT"
              }
            },
            attachments: { connect: connectById }
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

    const ordinal = await this.convoCount(conversationId);
    const pr = await this.prismaClient.conversation.update({
      include: includeSansAttachments,
      where: { id: conversationId },
      data: {
        messages: {
          create: {
            ...messageData,
            ordinal,
            messageBlocks: {
              create: {
                content: messageData.content,
                conversationId,
                ordinal: 0,
                type: "TEXT"
              }
            }
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
    const ordinal = await this.convoCount(conversationId);
    const pr = await this.prismaClient.conversation.update({
      include: {
        conversationSettings: true,
        messages: {
          // ordinal is the authoritative dense sequence — createdAt can tie
          orderBy: { ordinal: "asc" },
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
            ordinal,
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
}
