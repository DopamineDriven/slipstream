import type {
  BigIntToCompatProps,
  InferTopLevelMime,
  UpdateAttachment,
  UpdateAttachmentCompatProps,
  UpdateAttachmentMetadata,
  UserData
} from "@/types/index.ts";
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
  AIChatRequest,
  AIChatResponse,
  CTR,
  ImageGenModels,
  ImageGenProviders,
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
    public fs: Fs
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

  private handleImgGenCount = (
    model?: ImageGenModels,
    data?: { n?: number }
  ) => {
    if (model === "dall-e-3") {
      if (typeof data?.n !== "undefined") {
        return data.n > 1 ? 1 : data.n < 1 ? 1 : data.n;
      }
      return 1;
    }
    if (
      model === "imagen-3.0-generate-002" ||
      model === "imagen-4.0-fast-generate-001" ||
      model === "imagen-4.0-generate-001" ||
      model === "imagen-4.0-ultra-generate-001"
    ) {
      if (typeof data?.n !== "undefined") {
        return data.n > 4 ? 4 : data.n < 1 ? 1 : data.n;
      }
      return 1;
    }
    if (typeof data?.n !== "undefined") {
      return data.n > 10 ? 10 : data.n < 1 ? 1 : data.n;
    }
    return 1;
  };

  private handleImgGenBg(
    provider: ImageGenProviders,
    model?: ImageGenModels,
    data?: {
      background?: "transparent" | "opaque" | "auto" | undefined;
      format?: "png" | "jpeg" | "webp";
    }
  ) {
    if (provider !== "openai") return undefined;
    if (!model) return undefined;
    if (!(model === "gpt-image-1" || model === "gpt-image-1-mini"))
      return undefined;
    if (
      typeof data?.background !== "undefined" &&
      typeof data?.format !== "undefined" &&
      data.format !== "jpeg"
    ) {
      return data?.background;
    } else return undefined;
  }

  /**
   * **gpt-image-1 only**
   */
  private handleInputFidelity(
    provider: ImageGenProviders,
    model?: ImageGenModels,
    data?: {
      input_fidelity?: string;
    }
  ) {
    if (provider !== "openai") return undefined;
    if (!model) return undefined;
    if (model !== "gpt-image-1") return undefined;
    const iF = data?.input_fidelity as "low" | "high" | undefined;
    if (typeof iF !== "undefined" && /^(low|high)$/gm.test(iF)) {
      return iF;
    } else return "high";
  }

  private handleImgGenCompression(
    provider: "grok" | "gemini" | "openai",
    model?: ImageGenModels,
    data?: {
      output_compression?: number | undefined;
      output_format?: string;
    }
  ) {
    if (provider === "grok") return undefined;
    const f = data?.output_format as "png" | "jpeg" | "webp" | undefined;
    if (
      model === "dall-e-2" ||
      model === "dall-e-3" ||
      model === "grok-2-image-1212" ||
      model === "gemini-2.5-flash-image"
    ) {
      return undefined;
    }
    if (!model) return undefined;
    if (provider === "openai" && typeof f !== "undefined") {
      if (
        (model === "gpt-image-1" || model === "gpt-image-1-mini") &&
        typeof data?.output_compression !== "undefined"
      ) {
        return f === "png"
          ? undefined
          : data.output_compression >= 0 && data.output_compression <= 100
            ? data.output_compression
            : 100;
      } else return undefined;
    }
    if (
      provider === "gemini" &&
      typeof data?.output_compression !== "undefined" &&
      (model === "imagen-3.0-generate-002" ||
        model === "imagen-4.0-fast-generate-001" ||
        model === "imagen-4.0-generate-001" ||
        model === "imagen-4.0-ultra-generate-001")
    ) {
      return data.output_compression >= 0 && data.output_compression <= 100
        ? data.output_compression
        : data.output_compression > 100
          ? 100
          : 75;
    } else return undefined;
  }

  private handleModeration<const T extends ImageGenProviders>(
    provider: T,
    model?: ImageGenModels,
    data?: { moderation?: string }
  ) {
    if (provider !== "openai") return undefined;
    if (!(model === "gpt-image-1" || model === "gpt-image-1-mini"))
      return undefined;
    const m = data?.moderation as "auto" | "low" | undefined;
    if (typeof m !== "undefined" && /^(low|auto)$/gm.test(m)) {
      return m;
    } else return "low";
  }

  private handlePersonGeneration<const T extends ImageGenProviders>(
    provider: T,
    model?: ImageGenModels,
    data?: { personGeneration?: string }
  ) {
    if (provider !== "gemini") {
      return undefined;
    }
    if (
      !(
        model === "imagen-3.0-generate-002" ||
        model === "imagen-4.0-fast-generate-001" ||
        model === "imagen-4.0-generate-001" ||
        model === "imagen-4.0-ultra-generate-001"
      )
    )
      return undefined;
    const p = data?.personGeneration as
      | "allow_adult"
      | "allow_all"
      | "dont_allow"
      | undefined;
    if (typeof p !== "undefined") {
      if (/^(dont_allow|allow_(all|adult))$/gm.test(p)) {
        return p;
      } else return "allow_adult";
    } else return "allow_adult";
  }

  private handleImgGenOutputQuality(
    provider: ImageGenProviders,
    model?: ImageGenModels,
    data?: { output_quality?: string }
  ) {
    let oq;
    if (provider === "grok") return undefined;
    if (model === "gemini-2.5-flash-image" || model === "grok-2-image-1212")
      return undefined;
    if (
      !(
        model === "dall-e-2" ||
        model === "dall-e-3" ||
        model === "gpt-image-1" ||
        model === "gpt-image-1-mini"
      )
    ) {
      oq = data?.output_quality as "1K" | "2K" | undefined;
      if (typeof oq !== "undefined" && /^(1|2)K$/gm.test(oq)) {
        return oq;
      } else return "1K";
    }
    if (model === "dall-e-2") {
      oq = data?.output_quality as "standard" | "auto" | undefined;
      if (typeof oq !== "undefined" && /^(standard|auto)$/gm.test(oq)) {
        return oq;
      } else return "auto";
    } else if (model === "dall-e-3") {
      oq = data?.output_quality as "hd" | "standard" | "auto" | undefined;
      if (typeof oq !== "undefined" && /^(hd|standard|auto)$/gm.test(oq)) {
        return oq;
      } else return "auto";
    } else {
      oq = data?.output_quality as
        | "high"
        | "medium"
        | "low"
        | "auto"
        | undefined;
      if (typeof oq !== "undefined" && /^(high|medium|low|auto)$/gm.test(oq)) {
        return oq;
      } else return "auto";
    }
  }

  private fallbackImgGenModelByProvider(
    provider: ImageGenProviders,
    model?: ImageGenModels
  ) {
    return (
      model ??
      (provider === "openai"
        ? ("gpt-image-1" as const)
        : provider === "gemini"
          ? ("gemini-2.5-flash-image" as const)
          : ("grok-2-image-1212" as const))
    );
  }

  private handlePartialImgGen(
    provider: ImageGenProviders,
    model?: ImageGenModels,
    data?: { partialImagesRequested?: number }
  ) {
    if (provider !== "openai") return undefined;
    if (typeof model === "undefined") return undefined;
    if (model === "gpt-image-1" || model === "gpt-image-1-mini") {
      if (typeof data?.partialImagesRequested !== "undefined") {
        if (
          data.partialImagesRequested >= 0 &&
          data.partialImagesRequested <= 3
        ) {
          return data.partialImagesRequested;
        }
        if (data.partialImagesRequested > 3) {
          return 3;
        } else return 0;
      } else return 0;
    }
  }

  private handleOutputSize(
    model?: ImageGenModels,
    data?: { output_size?: string }
  ) {
    let os;
    if (model === "grok-2-image-1212") return undefined;
    else if (model === "dall-e-2") {
      os = data?.output_size as
        | "256x256"
        | "512x512"
        | "1024x1024"
        | "auto"
        | undefined;
      if (
        typeof os !== "undefined" &&
        /^(256x256|512x512|1024x1024|auto)$/gm.test(os)
      ) {
        return os;
      } else return "auto";
    } else if (model === "dall-e-3") {
      os = data?.output_size as
        | "1024x1024"
        | "1792x1024"
        | "1024x1792"
        | "auto"
        | undefined;
      if (
        typeof os !== "undefined" &&
        /^(1792x1024|1024x1792|1024x1024|auto)$/gm.test(os)
      ) {
        return os;
      } else return "auto";
    } else if (model === "gemini-2.5-flash-image") {
      os = data?.output_size as
        | "1:1"
        | "2:3"
        | "3:2"
        | "3:4"
        | "4:3"
        | "4:5"
        | "5:4"
        | "9:16"
        | "16:9"
        | "21:9"
        | undefined;
      if (
        typeof os !== "undefined" &&
        /^(1:1|2:3|3:2|3:4|4:3|4:5|5:4|9:16|16:9|21:9)$/gm.test(os)
      ) {
        return os;
      } else return "1:1";
    } else if (model === "gpt-image-1" || model === "gpt-image-1-mini") {
      os = data?.output_size as
        | "1024x1024"
        | "1536x1024"
        | "1024x1536"
        | "auto"
        | undefined;
      if (
        typeof os !== "undefined" &&
        /^(1536x1024|1024x1536|1024x1024|auto)$/gm.test(os)
      ) {
        return os;
      } else return "1:1";
    } else {
      os = data?.output_size as
        | "1:1"
        | "9:16"
        | "16:9"
        | "3:4"
        | "4:3"
        | undefined;
      if (typeof os !== "undefined" && /^(1:1|3:4|4:3|9:16|16:9)$/gm.test(os)) {
        return os;
      } else return "1:1";
    }
  }

  public async handleImageGenRequest({
    userId,
    batchId,
    provider,
    model: m,
    conversationId,
    hasProviderConfigured,
    ...data
  }: Rm<ImageGenRequest, "type"> & { userId: string }) {
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
    const model = this.fallbackImgGenModelByProvider(provider, m),
      outputCompression = this.handleImgGenCompression(provider, model, {
        output_compression: data.output_compression,
        output_format: data.output_format
      }),
      outputBackground = this.handleImgGenBg(provider, model, {
        background: data.output_background,
        format:
          (data.output_format as "jpeg" | "png" | "webp" | undefined) ?? "png"
      }),
      moderation = this.handleModeration(provider, model, {
        moderation: data.moderation
      }),
      negativePrompt = data?.negativePrompt ?? undefined,
      seed = data?.seed ?? undefined,
      nRequested = this.handleImgGenCount(model, { n: data.n }),
      inputFidelity = this.handleInputFidelity(provider, model, {
        input_fidelity: data.input_fidelity
      }),
      personGeneration = this.handlePersonGeneration(provider, model, {
        personGeneration: data.personGeneration
      }),
      progress = 0,
      partialImagesRequested = this.handlePartialImgGen(provider, model, {
        partialImagesRequested: data.output_partial_images
      }),
      outputFormat =
        provider === "grok" ? "png" : (data?.output_format ?? "png"),
      outputSize = this.handleOutputSize(model, {
        output_size: data.output_size
      }),
      stage = "QUEUED",
      prompt = data?.prompt,
      topP = data?.topP,
      nCompleted = 0,
      temperature = data.temperature,
      systemPrompt = data.systemPrompt,
      maxTokens = data.maxTokens,
      outputQuality = this.handleImgGenOutputQuality(provider, model, {
        output_quality: data.output_quality
      }),
      userKeyId = keyId,
      imageGenJob = {
        create: {
          userKeyId,
          userId,
          inputFidelity,
          moderation,
          negativePrompt,
          nRequested,
          nCompleted,
          outputBackground,
          outputCompression,
          outputFormat,
          partialImagesRequested,
          outputSize,
          progress,
          seed,
          personGeneration,
          stage,
          outputQuality,
          topP,
          model,
          prompt,
          provider: this.providerToPrismaFormat(provider)
        }
      } as const,
      messageData = {
        content: prompt,
        provider: this.providerToPrismaFormat(provider),
        senderType: "USER",
        model,
        userId,
        userKeyId,
        imageGenJob
      } as const,
      includeWithAttachments = {
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
      } as const,
      includeSansAttachments = {
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
          const connectById = attachments.map(({ id }) => ({ id }));

          return await pr.conversation.create({
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
        });
        return this.bigintToNumber("image_gen_request", {
          apiKey,
          ...batchIt
        });
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
      return this.bigintToNumber("image_gen_request", apiKeyAndRes);
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

          const connectById = attachments.map(({ id }) => ({ id }));
          return await pr.conversation.update({
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
        });
        return this.bigintToNumber("image_gen_request", {
          apiKey,
          ...batchIt
        });
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
      return this.bigintToNumber("image_gen_request", apiKeyAndRes);
    }
  }

  public async handleAiChatRequest({
    userId,
    batchId,
    provider,
    conversationId,
    ...data
  }: Rm<AIChatRequest, "type"> & {
    userId: string;
  }) {
    const { keyId, apiKey } = await this.handleApiKeyLookup(provider, userId);
    if (conversationId === "new-chat") {
      if (typeof batchId !== "undefined") {
        const batchIt = await this.prismaClient.$transaction(async pr => {
          const attachments = await pr.attachment.findMany({
            where: { batchId, userId },
            take: 10,
            orderBy: [{ createdAt: "desc" }],
            include: { image: true, document: true }
          });
          const connectById = attachments.map(({ id }) => ({ id }));

          return await pr.conversation.create({
            include: {
              conversationSettings: true,
              messages: {
                orderBy: { createdAt: "asc" },
                include: {
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
              attachments: { connect: connectById },
              messages: {
                create: {
                  attachments: { connect: connectById },
                  content: data.prompt,
                  provider: this.providerToPrismaFormat(provider),
                  senderType: "USER",
                  model: data.model,
                  userId,
                  userKeyId: keyId
                }
              },
              conversationSettings: {
                create: {
                  maxTokens: data.maxTokens,
                  topP: data.topP,
                  systemPrompt: data.systemPrompt,
                  temperature: data.temperature
                }
              },
              userKeyId: keyId,
              userId
            }
          });
        });
        return this.bigintToNumber("ai_chat_request", {
          apiKey,
          ...batchIt
        });
      }

      const p = await this.prismaClient.conversation.create({
        include: {
          conversationSettings: true,
          messages: {
            orderBy: { createdAt: "asc" },
            include: {
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
              content: data.prompt,
              provider: this.providerToPrismaFormat(provider),
              senderType: "USER",
              model: data.model,
              userId,
              userKeyId: keyId
            }
          },
          conversationSettings: {
            create: {
              maxTokens: data.maxTokens,
              topP: data.topP,
              systemPrompt: data.systemPrompt,
              temperature: data.temperature
            }
          },
          userKeyId: keyId,
          userId
        }
      });
      const apiKeyAndRes = { apiKey, ...p };
      return this.bigintToNumber("ai_chat_request", apiKeyAndRes);
    } else {
      if (typeof batchId !== "undefined") {
        const batchIt = await this.prismaClient.$transaction(async pr => {
          const attachments = await pr.attachment.findMany({
            where: { batchId, userId, conversationId, messageId: null },
            take: 10,
            orderBy: [{ createdAt: "desc" }],
            include: { image: true, document: true }
          });

          const connectById = attachments.map(({ id }) => ({ id }));

          return await pr.conversation.update({
            include: {
              conversationSettings: true,
              messages: {
                orderBy: { createdAt: "asc" },
                include: {
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
                  content: data.prompt,
                  senderType: "USER",
                  provider: this.providerToPrismaFormat(provider),
                  model: data.model,
                  userId,
                  userKeyId: keyId
                }
              },
              conversationSettings: {
                update: {
                  topP: data.topP,
                  systemPrompt: data.systemPrompt,
                  maxTokens: data.maxTokens,
                  temperature: data.temperature
                }
              },
              userId,
              userKeyId: keyId
            }
          });
        });
        return this.bigintToNumber("ai_chat_request", {
          apiKey,
          ...batchIt
        });
      }
      const pr = await this.prismaClient.conversation.update({
        include: {
          conversationSettings: true,
          messages: {
            orderBy: { createdAt: "asc" },
            include: {
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
              content: data.prompt,
              senderType: "USER",
              provider: this.providerToPrismaFormat(provider),
              model: data.model,
              userId,
              userKeyId: keyId
            }
          },
          conversationSettings: {
            update: {
              topP: data.topP,
              systemPrompt: data.systemPrompt,
              maxTokens: data.maxTokens,
              temperature: data.temperature
            }
          },
          userId,
          userKeyId: keyId
        }
      });
      const apiKeyAndRes = { apiKey, ...pr };
      return this.bigintToNumber("ai_chat_request", apiKeyAndRes);
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

  public async handleAiChatResponse({
    userId,
    provider,
    ...data
  }: Rm<CTR<AIChatResponse, "provider">, "type">) {
    const { keyId } = await this.handleApiKeyLookup(provider, userId);
    return this.prismaClient.conversation.update({
      include: { messages: true, conversationSettings: true },
      where: { id: data.conversationId },
      data: {
        messages: {
          create: {
            content: data.chunk,
            senderType: "AI",
            provider: this.providerToPrismaFormat(provider),
            model: data.model,
            thinkingDuration: data.thinkingDuration,
            thinkingText: data?.thinkingText,
            userId,
            userKeyId: keyId
          }
        },
        userId,
        title: data.title,
        userKeyId: keyId
      }
    });
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
