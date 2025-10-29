import type {
  BigIntToCompatProps,
  HandleAiChatReqCreateSansImgGenAndAttachmentsProps,
  HandleAiChatReqCreateSansImgGenSansAttachmentsProps,
  HandleAiChatReqCreateWithImgGenAndAttachmentsProps,
  HandleAiChatReqCreateWithImgGenSansAttachmentsProps,
  HandleAiChatRequestRT,
  HandleAiChatReqUpdateSansImgGenAndAttachmentsProps,
  HandleAiChatReqUpdateSansImgGenSansAttachmentsProps,
  HandleAiChatReqUpdateWithImgGenAndAttachmentsProps,
  HandleAiChatReqUpdateWithImgGenSansAttachmentsProps,
  InferTopLevelMime,
  UpdateAttachment,
  UpdateAttachmentCompatProps,
  UpdateAttachmentMetadata,
  UserData
} from "@/types/index.ts";
import type { ExpandedImgSpecs } from "@d0paminedriven/metadata";
import { ExtractService } from "@/extract/index.ts";
import { ModelService } from "@/models/index.ts";
import { Fs } from "@d0paminedriven/fs";
import type {
  $Enums,
  Attachment,
  AudioMetadata,
  DocumentMetadata,
  ImageMetadata,
  VideoMetadata
} from "@slipstream/db/node/generated/client";
import type {
  ImageGenOutputCreateNestedOneWithoutAttachmentInput
} from "@slipstream/db/node/generated/models";
import type {
  AIChatRequest,
  AIChatResponseDb,
  AllModelsUnion,
  CTR,
  ImageGenRequest,
  Providers,
  Rm,
  RTC,
  XOR
} from "@slipstream/types";
import { DbService, PrismaClient } from "@slipstream/db/node";
import { EncryptionService } from "@slipstream/encryption";

export class PrismaService extends ModelService {
  readonly prismaClient: PrismaClient;
  private encryption: EncryptionService;

  constructor(
    prisma: DbService,
    public fs: Fs,
    private extractor: ExtractService,
    private isProd: boolean
  ) {
    super();
    this.encryption = new EncryptionService(process.env.ENCRYPTION_KEY);
    this.prismaClient = prisma.prismaClient;
  }
  public async getAndValidateUserSessionById(id: string) {
    const res = await this.prismaClient.user.findUniqueOrThrow({
      where: { id },
      include: { sessions: true }
    });

    const sesh = res?.sessions.sort(
      (a, b) => b?.expires?.getTime() - a.expires.getTime()
    );
    let isValid = false;
    if (sesh?.[0]) {
      isValid = sesh?.[0].expires.getTime() > new Date(Date.now()).getTime();
    }
    return {
      userId: id,
      email: res.email,
      isValid
    };
  }
  public async getAndValidateUserSessionByEmail(email: string) {
    const res = await this.prismaClient.user.findUnique({
      where: { email },
      include: { sessions: true }
      // cacheStrategy: { ttl: 60, swr: 3600 }
    });
    const id = res?.id ?? "";
    const sesh = res?.sessions.sort(
      (a, b) => b.expires.getTime() - a.expires.getTime()
    );
    let isValid = false;
    if (sesh?.[0]) {
      isValid = sesh?.[0].expires.getTime() > new Date(Date.now()).getTime();
    }
    return {
      userId: id,
      isValid
    };
  }

  public async updateProfile({
    city,
    country,
    latlng,
    region,
    tz,
    postalCode,
    userId
  }: { [P in keyof UserData]-?: UserData[P] } & { userId: string }) {
    const [lat, lng] = this.handleLatLng(latlng); // formatted `${lat},${lng}` in the cookie value for the key latlng
    await this.prismaClient.profile.upsert({
      where: { userId },
      create: {
        city,
        country,
        userId: userId,
        timezone: tz,
        region,
        postalCode,
        lat,
        lng
      },
      update: {
        city,
        country,
        region,
        userId,
        postalCode,
        timezone: tz,
        lat,
        lng
      }
    });
  }

  /**
   * ```ts
   * (property) userProviderKeyMap: Map<`${string}_openai` | `${string}_grok` | `${string}_gemini` | `${string}_anthropic`, string | undefined>
   * ```
   */
  private userProviderKeyMap = new Map<Providers, string | undefined>();

  public async handleApiKeyLookup(provider: Providers, userId?: string) {
    if (!userId) {
      this.userProviderKeyMap.clear();
      throw new Error("unauthorized");
    }
    const rec = await this.prismaClient.userKey.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: this.providerToPrismaFormat(provider)
        }
      }
    });
    if (!rec) {
      console.error(`No API key configured for ${provider}!`);
      return { apiKey: null, keyId: null };
    }
    try {
      const hasKey = this.userProviderKeyMap.get(provider);
      if (typeof hasKey !== "undefined") {
        return { apiKey: hasKey, keyId: rec.id };
      }

      const decrypted = await this.encryption.decryptText({
        authTag: rec.authTag,
        data: rec.apiKey,
        iv: rec.iv
      });

      this.userProviderKeyMap.set(provider, decrypted);

      return { apiKey: decrypted, keyId: rec.id };
    } catch (err) {
      if (err instanceof Error) {
        console.error(`Decryption failed for: ${provider}, ` + err.message);
        return { apiKey: null, keyId: null };
      } else return { apiKey: null, keyId: null };
    }
  }

  public parseDraftId(draftId: string) {
    if (/^(?:[A-Za-z0-9_-]+~){3}(?:0|[1-9][0-9]*)$/.test(draftId) === false) {
      throw new Error(`invalid draftId ${draftId}`);
    }
    const toArr = draftId.split("~");

    return toArr.map((v, o) =>
      o !== toArr.length - 1 ? v : Number.parseInt(v, 10)
    ) as [string, string, string, number];
  }

  public bigintToNumber<
    const T extends "image_gen_request" | "ai_chat_request"
  >(
    target: T,
    props: BigIntToCompatProps<typeof target>["props"]
  ): BigIntToCompatProps<typeof target>["rt"] {
    const { messages, ...rest } = props;
    const msgArr = messages.map(t => {
      const { attachments, ...rest } = t;

      const cleanAttachments = attachments.map(att => {
        const size =
          typeof att.size === "bigint"
            ? att.size === 0n
              ? 0
              : Number(att.size)
            : null;
        const cleaned = { ...att, size };
        return cleaned;
      });
      return { attachments: cleanAttachments, ...rest };
    });
    return { messages: msgArr, ...rest } satisfies BigIntToCompatProps<
      typeof target
    >["rt"];
  }

  private toCompatPropsExtened<
    const T extends "image_gen_request" | "ai_chat_request"
  >(
    target: T,
    rt: BigIntToCompatProps<typeof target>["rt"],
    assetInfo: {
      /**
       * count of assets bound to the current user messsage
       */
      jobId?: string;
      requestMessageId?: string;
      assetCounts: number;
      assets?: {
        type: $Enums.AssetType;
        compatStatus: $Enums.CompatStatus;
        url: string;
        mime: string;
        ext: string;
      }[];
    }
  ): BigIntToCompatProps<typeof target>["rtExtended"] {
    return {
      ...rt,
      ...assetInfo
    } satisfies BigIntToCompatProps<typeof target>["rtExtended"];
  }

  public async handleImageGenRequest({
    userId,
    batchId,
    provider,
    model: m,
    hasProviderConfigured,
    ...data
  }: RTC<Rm<ImageGenRequest, "type">, "output_quality"> & { userId: string }) {
    let keyId: string | null = null,
      apiKey: string | null = null;
    if (hasProviderConfigured) {
      const { keyId: kId, apiKey: apiK } = await this.handleApiKeyLookup(
        provider,
        userId
      );
      keyId = kId;
      apiKey = apiK;
    }

    const {
      conversationId,
      includeSansAttachments,
      topP,
      includeWithAttachments,
      maxTokens,
      messageData,
      systemPrompt,
      temperature
    } = this.handleAiChatRequestImgGenWorkup({
      userId: userId,
      batchId,
      provider,
      model: m,
      hasProviderConfigured,
      apiKey,
      keyId,
      ...data
    });

    if (conversationId === "new-chat") {
      const conversationSettings = {
        create: {
          maxTokens,
          topP,
          enableAssetGen: true,
          systemPrompt,
          temperature
        }
      } as const;
      if (typeof batchId !== "undefined") {
        const batchIt = await this.prismaClient.$transaction(async pr => {
          const attachments = await pr.attachment.findMany({
            where: { batchId, userId },
            take: 10,
            orderBy: [{ createdAt: "desc" }],
            include: { image: true, document: true }
          });
          const extended = attachments.map(t => {
            const {
              compatStatus,
              assetType,
              compatCdnUrl,
              compatMime,
              compatExt
            } = t;
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

          const create = await pr.conversation.create({
            include: includeWithAttachments,
            data: {
              attachments: { connect: connectById },
              messages: {
                create: {
                  attachments: { connect: connectById },
                  ...messageData
                }
              },
              conversationSettings,
              userKeyId: keyId,
              userId
            }
          });
          const requestMessageId = create.messages?.[0]?.id;
          const imgGenJobId = create.messages?.[0]?.imageGenJob?.id;
          return { create, withAssetInfo, imgGenJobId, requestMessageId };
        });

        return this.toCompatPropsExtened(
          "image_gen_request",
          this.bigintToNumber("image_gen_request", {
            apiKey,
            ...batchIt.create
          }),
          {
            jobId: batchIt.imgGenJobId,
            requestMessageId: batchIt.requestMessageId,
            ...batchIt.withAssetInfo
          }
        );
      }

      const p = await this.prismaClient.conversation.create({
        include: includeSansAttachments,
        data: {
          messages: {
            create: {
              ...messageData
            }
          },
          conversationSettings,
          userKeyId: keyId,
          userId
        }
      });
      const apiKeyAndRes = { apiKey, ...p };

      return this.toCompatPropsExtened(
        "image_gen_request",
        this.bigintToNumber("image_gen_request", apiKeyAndRes),
        {
          jobId: apiKeyAndRes.messages[0]?.imageGenJob?.id,
          requestMessageId: apiKeyAndRes.messages[0]?.id,
          assetCounts: 0,
          assets: undefined
        }
      );
    } else {
      const conversationSettings = {
        update: {
          maxTokens,
          topP,
          enableAssetGen: true,
          systemPrompt,
          temperature
        }
      } as const;
      if (typeof batchId !== "undefined") {
        const batchIt = await this.prismaClient.$transaction(async pr => {
          const attachments = await pr.attachment.findMany({
            where: { batchId, userId, conversationId, messageId: null },
            take: 10,
            orderBy: [{ createdAt: "desc" }],
            include: { image: true, document: true }
          });
          const extended = attachments.map(t => {
            const {
              compatStatus,
              assetType,
              compatCdnUrl,
              compatMime,
              compatExt
            } = t;
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
          const create = await pr.conversation.update({
            include: includeWithAttachments,
            where: { id: conversationId },
            data: {
              attachments: { connect: connectById },
              messages: {
                create: {
                  attachments: { connect: connectById },
                  ...messageData
                }
              },
              conversationSettings,
              userId,
              userKeyId: keyId
            }
          });
          return {
            create,
            withAssetInfo: {
              jobId: create.messages[0]?.imageGenJob?.id,
              requestMessageId: create.messages[0]?.id,
              ...withAssetInfo
            }
          };
        });
        return this.toCompatPropsExtened(
          "image_gen_request",
          this.bigintToNumber("image_gen_request", {
            apiKey,
            ...batchIt.create
          }),
          batchIt.withAssetInfo
        );
      }
      const pr = await this.prismaClient.conversation.update({
        include: includeSansAttachments,
        where: { id: conversationId },
        data: {
          messages: {
            create: {
              ...messageData
            }
          },
          conversationSettings,
          userId,
          userKeyId: keyId
        }
      });
      const apiKeyAndRes = { apiKey, ...pr };
      return this.toCompatPropsExtened(
        "image_gen_request",
        this.bigintToNumber("image_gen_request", apiKeyAndRes),
        {
          jobId: apiKeyAndRes.messages[0]?.imageGenJob?.id,
          requestMessageId: apiKeyAndRes.messages[0]?.id,
          assetCounts: 0,
          assets: undefined
        }
      );
    }
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
        include: { image: true, document: true }
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
    const conversationSettings = { create };
    const { connectById, withAssetInfo } =
      await this.handleAiChatReqCreateWithAttachments({ userId, batchId });

    const createConvo = await this.prismaClient.conversation.create({
      include: includeWithAttachments,
      data: {
        attachments: { connect: connectById },
        messages: {
          create: {
            attachments: { connect: connectById },
            ...messageData
          }
        },
        conversationSettings,
        userKeyId: keyId,
        userId
      }
    });
    // surface these for all WithImgGen (for types of "img_gen_request" at the ORM level -- verifies an image gen request is in progress)
    const requestMessageId = createConvo.messages?.[0]?.id;
    const imgGenJobId = createConvo.messages?.[0]?.imageGenJob?.id;
    return this.toCompatPropsExtened(
      "image_gen_request",
      this.bigintToNumber("image_gen_request", {
        apiKey,
        ...createConvo
      }),
      { jobId: imgGenJobId, requestMessageId, ...withAssetInfo }
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
    const p = await this.prismaClient.conversation.create({
      include: includeSansAttachments,
      data: {
        messages: {
          create: {
            ...messageData
          }
        },
        conversationSettings,
        userKeyId: keyId,
        userId
      }
    });

    const apiKeyAndRes = { apiKey, ...p };
    const requestMessageId = p.messages?.[0]?.id;
    const imgGenJobId = p.messages?.[0]?.imageGenJob?.id;
    return this.toCompatPropsExtened(
      "image_gen_request",
      this.bigintToNumber("image_gen_request", apiKeyAndRes),
      {
        jobId: imgGenJobId,
        requestMessageId,
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
    const p = await this.prismaClient.conversation.create({
      include: {
        conversationSettings: true,
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            imageGenJob: true,
            attachments: {
              orderBy: { createdAt: "asc" },
              include: {
                image: true,
                document: true
              }
            }
          }
        }
      },
      data: {
        messages: {
          create: {
            content: prompt,
            provider: this.providerToPrismaFormat(provider),
            senderType: "USER",
            model,
            userId,
            userKeyId: keyId
          }
        },
        conversationSettings: {
          create
        },
        userKeyId: keyId,
        userId
      }
    });
    const apiKeyAndRes = { apiKey, ...p };
    return this.toCompatPropsExtened(
      "ai_chat_request",
      this.bigintToNumber("ai_chat_request", apiKeyAndRes),
      {
        jobId: apiKeyAndRes.messages[0]?.imageGenJob?.id ?? undefined,
        requestMessageId: apiKeyAndRes.messages[0]?.id,
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

    const includeConvoCreate = {
      conversationSettings: true,
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          imageGenJob: true,
          attachments: {
            orderBy: { createdAt: "asc" },
            include: {
              image: true,
              document: true
            }
          }
        }
      }
    } as const;

    const conversationSettings = { create };

    const dataConvoCreate = {
      attachments: { connect: connectById },
      messages: {
        create: {
          attachments: { connect: connectById },
          content: prompt,
          provider: this.providerToPrismaFormat(provider),
          senderType: "USER",
          model: model ?? null,
          userId,
          userKeyId: keyId
        }
      },
      conversationSettings,
      userKeyId: keyId,
      userId
    } as const;
    const dat = await this.prismaClient.conversation.create({
      include: includeConvoCreate,
      data: dataConvoCreate
    });

    return this.toCompatPropsExtened(
      "ai_chat_request",
      this.bigintToNumber("ai_chat_request", {
        apiKey,
        ...dat
      }),

      {
        jobId: dat.messages[0]?.imageGenJob?.id,
        requestMessageId: dat.messages[0]?.id,
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
            attachments: {
              orderBy: { createdAt: "asc" },
              include: {
                image: true,
                document: true
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
    return this.toCompatPropsExtened(
      "ai_chat_request",
      this.bigintToNumber("ai_chat_request", {
        apiKey,
        ...d
      }),
      {
        jobId: d?.messages[0]?.imageGenJob?.id,
        requestMessageId: d.messages[0]?.id,
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
            attachments: { connect: connectById },
            ...messageData
          }
        },
        conversationSettings,
        userId,
        userKeyId: keyId
      }
    });
    return this.toCompatPropsExtened(
      "image_gen_request",
      this.bigintToNumber("image_gen_request", {
        apiKey,
        ...updateConvo
      }),
      {
        jobId: updateConvo.messages?.[0]?.imageGenJob?.id,
        requestMessageId: updateConvo.messages?.[0]?.id,
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
            ...messageData
          }
        },
        conversationSettings,
        userId,
        userKeyId: keyId
      }
    });
    const apiKeyAndRes = { apiKey, ...pr };
    return this.toCompatPropsExtened(
      "image_gen_request",
      this.bigintToNumber("image_gen_request", apiKeyAndRes),
      {
        jobId: apiKeyAndRes.messages?.[0]?.imageGenJob?.id,
        requestMessageId: apiKeyAndRes.messages?.[0]?.id,
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
            imageGenJob: true,
            attachments: {
              orderBy: { createdAt: "asc" },
              include: {
                image: true,
                document: true
              }
            }
          }
        }
      },
      where: { id: conversationId },
      data: {
        messages: {
          create: {
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
    return this.toCompatPropsExtened(
      "ai_chat_request",
      this.bigintToNumber("ai_chat_request", apiKeyAndRes),
      {
        jobId: apiKeyAndRes.messages?.[0]?.imageGenJob?.id,
        requestMessageId: apiKeyAndRes.messages?.[0]?.id,
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

  /**
   * Count user messages sent in the past window that used fallback (no user key).
   * Default window is last 24 hours and only counts USER-sent messages.
   */
  public async countFallbackUserMessages(
    userId: string,
    windowMs = 24 * 60 * 60 * 1000
  ): Promise<number> {
    const since = new Date(Date.now() - windowMs);
    return this.prismaClient.message.count({
      where: {
        userId,
        senderType: "USER",
        userKeyId: null,
        createdAt: { gte: since }
      }
    });
  }

  private async handleImageData(cdnUrl: string) {
    const specs = (await this.extractor.extractRemote(
      cdnUrl,
      4096 * 24
    )) as ExpandedImgSpecs;
    const v = this.handleAssetMetadata(specs);
    if (v.type === "IMAGE" && v.img) {
      return { ...v.img };
    } else throw new Error("no image found");
  }

  public async handleAiChatResponse({
    userId,
    provider,
    jobId,
    requestMessageId,
    ...data
  }: Rm<CTR<AIChatResponseDb, "provider">, "type"> & {
    bucket?: string;
    key?: string;
    versionId?: string;
    cdnUrl?: string;
    uploadDuration?: number;
    s3ObjectId?: string;
    size?: number;
    requestMessageId?: string;
    jobId?: string;
    width?: number;
    height?: number;
    mime?: string;
  }) {
    const { keyId } = await this.handleApiKeyLookup(provider, userId);
    let agg: Record<string, number> = {};
    const mapImgs = data.imgGenFields?.images
      ?.concat(data.imgGenFields?.partialImages ?? [])
      ?.map(t => {
        agg[t.itemId] = (agg[t.itemId] ?? 0) + 1;
        const da = {
          bucket: t.bucket,
          key: t.key,
          versionId: t.versionId,
          s3ObjectId: t.s3ObjectId,
          cdnUrl: t.cdnUrl,
          assetType: "IMAGE",
          storageClass: t.StorageClass,
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
          contentDisposition: t.ContentDisposition,
          cacheControl: t.CacheControl,
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
          checksumAlgo: t.Checksum?.algo,
          checksumSha256: t.Checksum?.value,
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
                  seriesId: t.itemId,
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
            include: { attachments: true }
          },
          conversationSettings: true
        },
        where: { id: data.conversationId },
        data: {
          messages: {
            create: {
              messageType: data?.imgGenEnabled === true ? "IMAGE_GEN" : "TEXT",
              attachments: mapImgs ? { create: mapImgs } : undefined,
              senderType: "AI",
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

      if (data.imgGenEnabled === true) {
        if (!jobId || !data.imgGenFields?.images)
          throw new Error("no jobid to associate image gen with");
        const s = data.imgGenFields.images;
        if (data.imgGenFields.partialImages)
          s.concat(data.imgGenFields.partialImages);
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
            revisedPrompt: data.imgGenFields.revisedPrompt
          }
        });
        return persist;
      } else return persist;
    });

    return transaction;
  }

  public convoId(conversationId?: string | null) {
    return conversationId && conversationId !== "new-chat"
      ? conversationId
      : null;
  }

  async createAttachment({
    conversationId,
    ...data
  }: CTR<Partial<Attachment>, "userId" | "bucket" | "key"> &
    XOR<
      XOR<
        { image?: Partial<ImageMetadata> },
        { document?: Partial<DocumentMetadata> }
      >,
      XOR<
        { audio?: Partial<AudioMetadata> },
        { video?: Partial<VideoMetadata> }
      >
    >) {
    const mime = data.mime ?? "application/octet-stream";
    const assetType = data.assetType ?? "UNKNOWN";
    const extension = this.contentTypeToExt(mime) ?? data.ext ?? "bin";
    if (this.isSupportedType(assetType, extension)) {
      if (assetType === "IMAGE" && data.image) {
        const { image } = data;
        return await this.prismaClient.attachment.create({
          include: { image: true },
          data: {
            ...data,
            assetType,
            document: undefined,
            audio: undefined,
            video: undefined,
            conversationId: this.convoId(conversationId),
            image: {
              create: {
                ...image,
                aspectRatio: image.width ?? 1 / (image?.height ?? 1),
                width: image.width ?? 0,
                height: image.height ?? 0
              }
            }
          }
        });
      } else if (assetType === "DOCUMENT" && data.document) {
        const { document, image: _image } = data;
        return await this.prismaClient.attachment.create({
          data: {
            ...data,
            assetType,
            image: undefined,
            video: undefined,
            audio: undefined,
            conversationId: this.convoId(conversationId),
            document: {
              create: {
                format: document?.format ?? "application/pdf",
                ...document
              }
            }
          }
        });
      } else if (assetType === "AUDIO" && data.audio) {
        const {
          audio,
          video: _video,
          document: _document,
          image: _image
        } = data;
        return await this.prismaClient.attachment.create({
          data: {
            ...data,
            assetType,
            image: undefined,
            video: undefined,
            document: undefined,
            conversationId: this.convoId(conversationId),
            audio: {
              create: {
                format: audio?.format ?? "audio/mpeg",
                duration: audio?.duration ?? 0,
                ...data.audio
              }
            }
          }
        });
      } else if (assetType === "VIDEO" && data.video) {
        const {
          video,
          audio: _audio,
          document: _document,
          image: _image
        } = data;
        return await this.prismaClient.attachment.create({
          data: {
            ...data,
            assetType,
            image: undefined,
            audio: undefined,
            document: undefined,
            conversationId: this.convoId(conversationId),
            video: {
              create: {
                format: video?.format ?? "video/mp4",
                duration: video?.duration ?? 0,
                width: video.width ?? 0,
                height: video.height ?? 0,
                ...data.video
              }
            }
          }
        });
      }
    }
    return await this.prismaClient.attachment.create({
      data: {
        ...data,
        document: undefined,
        video: undefined,
        audio: undefined,
        image: undefined,
        conversationId: this.convoId(conversationId)
      }
    });
  }

  public contentTypeToExt(contentType?: string) {
    return contentType
      ? this.fs.mimeToExt(contentType as keyof typeof this.fs.toExtObj)
      : undefined;
  }

  /**
   * Update an attachment record
   */
  async updateAttachment({
    metadata,
    ...att
  }: {
    data: UpdateAttachment;
    metadata?: UpdateAttachmentMetadata;
  }) {
    const { data } = att;

    const { conversationId, ...rest } = data;

    return await this.prismaClient.attachment.update({
      where: {
        id: rest.id
      },
      include: { image: true, document: true },
      data: {
        ...rest,
        image:
          metadata?.type === "IMAGE" && metadata.img
            ? {
                upsert: {
                  where: { attachmentId: rest.id },
                  create: { ...metadata.img },
                  update: { ...metadata.img }
                }
              }
            : undefined,
        document:
          metadata?.type === "DOCUMENT" && metadata.doc
            ? {
                upsert: {
                  where: { attachmentId: rest.id },
                  create: { ...metadata.doc },
                  update: { ...metadata.doc }
                }
              }
            : undefined,
        conversationId: this.convoId(conversationId)
      }
    });
  }

  /**
   * Get attachment by ID
   * [string,string,string] -> [bucket, key, versionId]
   */
  async getAttachment(
    props: XOR<[string, string, string], string>
  ): Promise<Attachment | null> {
    if (!Array.isArray(props)) {
      return await this.prismaClient.attachment.findUnique({
        where: { id: props }
      });
    }
    return await this.prismaClient.attachment.findUnique({
      where: {
        s3ObjectId: `s3://${props[0]}/${props[1]}#${props[2] ?? "nov"}`
      }
    });
  }

  /**
   * Get attachments by convoId
   */
  async getConversationAttachments(conversationId: string) {
    return await this.prismaClient.conversation.findUnique({
      where: { id: conversationId },
      include: { attachments: { orderBy: { createdAt: "desc" } } }
    });
  }

  /**
   * Get attachments by messageId
   */
  async getMessageAttachments(messageId: string) {
    return await this.prismaClient.message.findUnique({
      where: { id: messageId },
      include: { attachments: { orderBy: { createdAt: "desc" } } }
    });
  }

  /**
   * Hard delete old soft-deleted attachments (cleanup job)
   */
  async purgeDeletedAttachments(daysOld = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const result = await this.prismaClient.attachment.deleteMany({
      where: {
        deletedAt: {
          gte: cutoffDate
        }
      }
    });

    return result.count;
  }

  /**
   * Get user's total storage usage
   */
  async getUserStorageUsage(userId: string): Promise<{
    totalSize: bigint;
    fileCount: number;
    byOrigin: Record<string, { size: bigint; count: number }>;
  }> {
    const attachments = await this.prismaClient.attachment.findMany({
      where: {
        userId,
        deletedAt: null,
        status: { not: "DELETED" }
      },
      select: {
        size: true,
        origin: true
      }
    });

    const byOrigin: Record<
      $Enums.AssetOrigin,
      { size: bigint; count: number }
    > = {
      GENERATED: { size: 0n, count: 0 },
      IMPORTED: { size: 0n, count: 0 },
      PASTED: { size: 0n, count: 0 },
      REMOTE: { size: 0n, count: 0 },
      SCRAPED: { size: 0n, count: 0 },
      SCREENSHOT: { size: 0n, count: 0 },
      UPLOAD: { size: 0n, count: 0 }
    };
    let totalSize = 0n;

    for (const attachment of attachments) {
      const size = attachment.size ?? 0n;
      totalSize += size;

      if (!byOrigin[attachment.origin]) {
        byOrigin[attachment.origin] = { size: 0n, count: 0 };
      }
      byOrigin[attachment.origin].size += size;
      byOrigin[attachment.origin].count++;
    }

    return {
      totalSize,
      fileCount: attachments.length,
      byOrigin
    };
  }

  async createBatchedAttachments({
    conversationId,
    ...data
  }: CTR<
    Rm<RTC<Attachment>, "id">,
    "bucket" | "key" | "userId" | "versionId" | "s3ObjectId"
  >) {
    return await this.prismaClient.attachment.createManyAndReturn({
      data: { ...data, conversationId: conversationId ?? "new-chat" },
      skipDuplicates: true,
      select: {
        id: true,
        bucket: true,
        key: true,
        createdAt: true,
        conversationId: true,
        sourceUrl: true,
        mime: true,
        s3ObjectId: true,
        versionId: true,
        cdnUrl: true,
        etag: true,
        ext: true,
        status: true,
        size: true,
        messageId: true,
        userId: true
      }
    });
  }

  /**
   * Copy attachment to another conversation
   * attachmentId can be id | [bucket,key,conversationId] -> [string,string,string]
   */
  async copyAttachment(
    attachmentId: XOR<string, [string, string, string]>,
    targetConversationId: string,
    userId: string
  ) {
    return await this.prismaClient.$transaction(async tx => {
      const source = await this.getAttachment(attachmentId);
      if (!source) {
        throw new Error("Source attachment not found");
      }

      if (source.userId !== userId) {
        throw new Error("Unauthorized to copy this attachment");
      }
      const {
        s3ObjectId,
        conversationId: _oldConvId,
        messageId: _oldMsgId,
        id: _oldId,
        ...rest
      } = source;

      return await tx.attachment.create({
        data: { s3ObjectId, conversationId: targetConversationId, ...rest }
      });
    });
  }

  /**
   * Get recent attachments for a user
   */
  async getUserRecentAttachments(userId: string, take = 10) {
    return (await this.prismaClient.user.findUnique({
      where: { id: userId },
      select: {
        attachments: {
          include: {
            conversation: { select: { id: true, title: true } },
            message: { select: { id: true } }
          },
          take,
          orderBy: { createdAt: "desc" },
          where: { status: "READY" }
        }
      }
    })) satisfies {
      attachments: ({
        conversation: {
          id: string;
          title: string | null;
        } | null;
        message: {
          id: string;
        } | null;
      } & Attachment)[];
    } | null;
  }

  /**
   * Update attachment metadata
   */
  async updateAttachmentMetadata(attachmentId: string): Promise<Attachment> {
    const attachment = await this.getAttachment(attachmentId);

    if (!attachment) {
      throw new Error("Attachment not found");
    }
    if (!attachment.cdnUrl)
      throw new Error("cdn url not available for metadata extraction");

    const {
      aspectRatio,
      width,
      height,
      colorSpace,
      frames,
      format,
      iccProfile,
      orientation,
      hasAlpha,
      animated,
      exifDateTimeOriginal
    } = await this.fs.getImageSpecsFlexi(attachment.cdnUrl);

    return this.prismaClient.attachment.update({
      where: { id: attachmentId },
      data: {
        image: {
          connectOrCreate: {
            where: { attachmentId },
            create: {
              aspectRatio,
              format,
              height,
              width,
              animated,
              colorSpace,
              exifDateTimeOriginal,
              frames,
              hasAlpha,
              iccProfile,
              orientation
            }
          }
        }
      }
    });
  }

  public getTopLevelMime(
    target: keyof typeof this.mimeToExt
  ):
    | "audio"
    | "application"
    | "image"
    | "video"
    | "multipart"
    | "text"
    | "model"
    | "haptics"
    | "font" {
    return target.split("/")?.[0] as InferTopLevelMime<typeof target>;
  }

  /**
   * Get storage statistics for a conversation
   */
  public async getConversationStorageStats(conversationId: string): Promise<{
    totalSize: bigint;
    fileCount: number;
    byType: Record<$Enums.AssetOrigin, { size: bigint; count: number }>;
    oldestAttachment?: Date;
    newestAttachment?: Date;
  }> {
    const { attachments } =
      await this.prismaClient.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        select: {
          attachments: {
            orderBy: { createdAt: "asc" },
            where: { status: { not: "DELETED" } },
            select: {
              size: true,
              mime: true,
              sourceUrl: true,
              cdnUrl: true,
              ext: true,
              createdAt: true,
              uploadMethod: true
            }
          }
        }
      });

    const byType: Record<string, { size: bigint; count: number }> = {};
    let totalSize = 0n;

    for (const attachment of attachments) {
      if (attachment.size !== null) {
        totalSize += attachment.size;
      }
      const type = this.getTopLevelMime(
        attachment.mime as keyof typeof this.mimeToExt
      );

      if (!(type in byType)) {
        byType[type] = { size: 0n, count: 0 };
      }
      if (
        byType &&
        type in byType &&
        byType[type]?.size &&
        byType[type]?.count
      ) {
        byType[type].size += totalSize;
        byType[type].count++;
      }
    }

    return {
      totalSize,
      fileCount: attachments.length,
      byType,
      oldestAttachment: attachments[0]?.createdAt,
      newestAttachment: attachments[attachments.length - 1]?.createdAt
    };
  }

  public async findActiveOpenAIAsset(
    attachmentId: string,
    keyFingerprint = "server"
  ) {
    return this.prismaClient.attachmentProvider.findFirst({
      where: {
        attachmentId,
        provider: "OPENAI",
        keyFingerprint,
        state: "ACTIVE"
        // no TTL for OpenAI files; they persist until you delete them
      }
    });
  }

  public async findUniqueAttachment(attachmentId: string) {
    return await this.prismaClient.attachment.findUnique({
      where: { id: attachmentId }
    });
  }

  public async updateAttachmentCompat({
    attachmentId,
    compatCdnUrl,
    compatKey,
    compatReadyAt,
    compatStatus,
    compatExt,
    compatMime,
    compatS3ObjectId,
    compatVersionId
  }: UpdateAttachmentCompatProps) {
    return await this.prismaClient.attachment.update({
      where: { id: attachmentId },
      data: {
        compatCdnUrl,
        compatStatus,
        compatReadyAt,
        compatKey,
        compatExt,
        compatMime,
        compatVersionId,
        compatS3ObjectId
      }
    });
  }

  public async findActiveGeminiAsset(
    attachmentId: string,
    keyFingerprint: string
  ) {
    return this.prismaClient.attachmentProvider.findFirst({
      where: {
        attachmentId,
        provider: "GEMINI",
        keyFingerprint,
        state: "ACTIVE",
        expiresAt: { gt: new Date() }
      }
    });
  }

  public async upsertOpenAIAssetMapping(
    attachmentId: string,
    keyFingerprint = "server",
    mime: string,
    keyId?: string
  ) {
    return this.prismaClient.attachmentProvider.upsert({
      where: {
        attachmentId_provider_keyFingerprint: {
          attachmentId,
          provider: "OPENAI",
          keyFingerprint
        }
      },
      update: {
        state: "PENDING",
        errorCode: null,
        errorMessage: null,
        lastCheckedAt: new Date(Date.now())
      },
      create: {
        attachmentId,
        provider: "OPENAI",
        userKeyId: keyId,
        keyFingerprint,
        state: "PENDING",
        mime
      }
    });
  }

  public async upsertGeminiAssetMapping(
    attachmentId: string,
    keyFingerprint = "server",
    mime: string,
    keyId?: string
  ) {
    return this.prismaClient.attachmentProvider.upsert({
      where: {
        attachmentId_provider_keyFingerprint: {
          attachmentId: attachmentId,
          provider: "GEMINI",
          keyFingerprint
        }
      },
      update: {
        state: "PENDING",
        errorCode: null,
        errorMessage: null,
        lastCheckedAt: new Date(Date.now())
      },
      create: {
        attachmentId: attachmentId,
        provider: "GEMINI",
        userKeyId: keyId,
        keyFingerprint,
        state: "PENDING",
        mime
      }
    });
  }

  public async finalizeOpenAIAsset(
    mappingId: string,
    providerRef: string,
    size?: bigint
  ) {
    await this.prismaClient.attachmentProvider.update({
      where: { id: mappingId },
      data: {
        state: "ACTIVE",
        providerRef, // store openai file_id here
        size,
        readyAt: new Date(Date.now()),
        lastCheckedAt: new Date(Date.now())
      }
    });
  }

  public async finalizeGeminiAsset(
    mappingId: string,
    providerUri: string,
    providerRef: string,
    expiresAt: Date
  ) {
    await this.prismaClient.attachmentProvider.update({
      where: { id: mappingId },
      data: {
        state: "ACTIVE",
        providerUri,
        providerRef,
        expiresAt,
        readyAt: new Date(Date.now()),
        lastCheckedAt: new Date(Date.now())
      }
    });
  }

  public async markOpenAIAssetFailed(mappingId: string, errorMessage: string) {
    await this.prismaClient.attachmentProvider.update({
      where: { id: mappingId },
      data: {
        state: "FAILED",
        errorMessage,
        lastCheckedAt: new Date(Date.now())
      }
    });
  }

  public async markGeminiAssetFailed(mappingId: string, errorMessage: string) {
    await this.prismaClient.attachmentProvider.update({
      where: { id: mappingId },
      data: {
        state: "FAILED",
        errorMessage,
        lastCheckedAt: new Date(Date.now())
      }
    });
  }

  public async getNestedAssets(conversationId: string) {
    return await this.prismaClient.conversation.findUnique({
      where: { id: conversationId },
      include: {
        attachments: { where: { conversationId } },
        messages: { orderBy: { createdAt: "asc" } },
        conversationSettings: true
      }
    });
  }

  public async findActiveAnthropicAsset(
    attachmentId: string,
    keyFingerprint = "server"
  ) {
    return this.prismaClient.attachmentProvider.findFirst({
      where: {
        attachmentId,
        provider: "ANTHROPIC",
        keyFingerprint,
        state: "ACTIVE",
        expiresAt: { gt: new Date() }
      }
    });
  }

  public async upsertAnthropicAssetMapping(
    attachmentId: string,
    keyFingerprint = "server",
    mime: string,
    keyId?: string
  ) {
    return this.prismaClient.attachmentProvider.upsert({
      where: {
        attachmentId_provider_keyFingerprint: {
          attachmentId,
          provider: "ANTHROPIC",
          keyFingerprint
        }
      },
      update: {
        state: "PENDING",
        errorCode: null,
        errorMessage: null,
        lastCheckedAt: new Date()
      },
      create: {
        attachmentId,
        provider: "ANTHROPIC",
        userKeyId: keyId,
        keyFingerprint,
        state: "PENDING",
        mime
      }
    });
  }

  public async finalizeAnthropicAsset(
    mappingId: string,
    fileId: string,
    expiresAt: Date,
    size?: bigint
  ) {
    await this.prismaClient.attachmentProvider.update({
      where: { id: mappingId },
      data: {
        state: "ACTIVE",
        providerRef: fileId,
        expiresAt,
        size,
        readyAt: new Date(),
        lastCheckedAt: new Date()
      }
    });
  }

  public async markAnthropicAssetFailed(
    mappingId: string,
    errorMessage: string
  ) {
    await this.prismaClient.attachmentProvider.update({
      where: { id: mappingId },
      data: {
        state: "FAILED",
        errorMessage,
        lastCheckedAt: new Date()
      }
    });
  }
}
