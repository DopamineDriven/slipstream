import type { ExtractService } from "@/extract/index.ts";
import { PrismaChatRequestService } from "@/prisma/chat-request.ts";
import type { PrismaDbService } from "@slipstream/db/factory";
import type { ImageGenOutputCreateNestedOneWithoutAttachmentInput } from "@slipstream/db/node/generated/models";
import type {
  AIChatResponse,
  AIChatResponseDb,
  AttachmentSingleton,
  ConversationSingleton,
  CTR,
  MessageSingleton,
  Rm,
  TTSJobSingleton
} from "@slipstream/types";

export class PrismaChatResponseService extends PrismaChatRequestService {
  constructor(
    prisma: PrismaDbService,
    extractor: ExtractService,
    isProd: boolean
  ) {
    super(prisma, extractor, isProd);
  }
  private bigIntToIntMsg(
    messages: Rm<MessageSingleton<true | false>, "userKey">[]
  ) {
    return messages.map(msg => {
      let t: TTSJobSingleton<true | false> | undefined;
      const { attachments, ttsJob, ...rest } = msg;
      if (ttsJob) {
        t = ttsJob;
      } else {
        t = undefined;
      }
      const atts = attachments.map(att => {
        const { size, ...attRest } = att;
        return {
          ttsJob: t
            ? ({
                ...t,
                sizeBytes: t?.sizeBytes ? Number(t.sizeBytes) : null
              } as const)
            : undefined,
          ...attRest,
          size: size ? Number(size) : null
        } as Rm<AttachmentSingleton<true>, "providerLinks">;
      });
      return {
        ttsJob: t
          ? ({
              ...t,
              sizeBytes: t?.sizeBytes ? Number(t.sizeBytes) : null
            } as const)
          : undefined,
        ...rest,
        attachments: atts
      } as Rm<MessageSingleton<true>, "userKey">;
    });
  }

  public bigintToInt({
    messages,
    ...rest
  }: ConversationSingleton<false | true>) {
    return {
      ...rest,
      messages: this.bigIntToIntMsg(messages)
    } as ConversationSingleton<true>;
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
    const persistedThinkingDuration =
      typeof data.thinkingDuration === "number"
        ? Math.round(data.thinkingDuration)
        : undefined;
    const persistedMessageBlocks = data.messageBlocks?.map(block => ({
      content: block.content,
      conversationId: data.conversationId,
      durationMs: Math.round(block.durationMs),
      ordinal: block.ordinal,
      type: block.type
    }));

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

    // lyria audio — n=1, no partials: one envelope, one nested create; the
    // audio + audioGenOutput relations ride the same transaction the message
    // is born in (imgGen parity, singular)
    const a = data.audioGenFields?.audio;
    const mapAudio = a
      ? ({
          bucket: a.bucket,
          key: a.key,
          versionId: a.versionId,
          s3ObjectId: a.s3ObjectId,
          cdnUrl: a.cdnUrl,
          assetType: "AUDIO",
          storageClass: a.storageClass ?? undefined,
          origin: "GENERATED",
          etag: a.etag,
          compatMime: a.compatMime ?? a.mime,
          compatCdnUrl: a.compatCdnUrl ?? a.cdnUrl,
          compatStatus: "ALIASED",
          uploadDuration: a.uploadDuration,
          compatS3ObjectId: a.compatS3ObjectId ?? a.s3ObjectId,
          compatVersionId: a.compatVersionId ?? a.versionId,
          compatKey: a.compatKey ?? a.key,
          compatExt: a.compatExt ?? a.ext,
          contentDisposition: a.contentDisposition,
          cacheControl: a.cacheControl,
          ext: a.ext,
          mime: a.mime,
          seriesId: a.itemId,
          region: a.region,
          status: "READY",
          uploadMethod: "GENERATED",
          generationGroupId: a.generationGroupId,
          size: a.size ? BigInt(a.size) : undefined,
          s3LastModified: a.s3LastModified
            ? new Date(a.s3LastModified)
            : new Date(Date.now()),
          filename: a.filename,
          compatReadyAt: new Date(Date.now()),
          checksumAlgo: a.checksumAlgo,
          checksumSha256: a.checksumSha256,
          audio: a.audio ? { create: a.audio } : undefined,
          audioGenOutput: a.audioGenOutput
            ? {
                create: {
                  mime: a.audioGenOutput.mime,
                  ext: a.audioGenOutput.ext,
                  jobId: a.audioGenOutput.jobId
                }
              }
            : jobId
              ? {
                  create: {
                    mime: a.mime,
                    ext: a.ext,
                    jobId
                  }
                }
              : undefined,
          user: { connect: { id: userId } }
        } as const)
      : undefined;
    const ordinal = await this.convoCount(data.conversationId);
    const transaction = await this.prismaClient.$transaction(async t => {
      const persist = await t.conversation.update({
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 2,
            include: {
              ttsJob: true,
              messageBlocks: true,
              imageGenJob: true,
              attachments: {
                include: {
                  imageGenOutput: true,
                  audioGenOutput: true,
                  image: true,
                  document: true,
                  audio: true
                }
              }
            }
          },
          conversationSettings: true
        },
        where: { id: data.conversationId },
        data: {
          messages: {
            create: {
              messageType:
                data?.imgGenEnabled === true
                  ? "IMAGE_GEN"
                  : data?.audioGenEnabled === true
                    ? "AUDIO_GEN"
                    : "TEXT",
              attachments: mapImgs
                ? { create: mapImgs }
                : mapAudio
                  ? { create: [mapAudio] }
                  : undefined,
              ordinal,
              messageBlocks:
                persistedMessageBlocks && persistedMessageBlocks.length > 0
                  ? {
                      create: persistedMessageBlocks
                    }
                  : undefined,
              senderType: "AI",
              responseOutput: data.responseOutput ?? undefined,
              provider: this.providerToPrismaFormat(provider),
              model: data.model,
              thinkingDuration: persistedThinkingDuration,
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
      const { messages, ...c } = persist;
      const ttv = messages.map(t => {
        const { ttsJob, ...rest } = t;
        return {
          ttsJob: ttsJob
            ? {
                ...ttsJob,
                sizeBytes: ttsJob?.sizeBytes ? Number(ttsJob.sizeBytes) : null
              }
            : undefined,
          ...rest
        };
      });
      const convo = this.bigintToInt({ ...c, messages: ttv });
      const msg = persist.messages[0];
      if (!msg) throw new Error("AIChatResponse Message was not created");
      const aiMsgId = msg?.id;

      if (
        data.audioGenEnabled === true &&
        typeof data.audioGenFields !== "undefined"
      ) {
        const audioGenAttachmentId = msg?.attachments.find(
          t => t.audioGenOutput != null
        )?.id;
        if (jobId) {
          await t.audioGenJob.update({
            where: { id: jobId },
            data: {
              stage: "COMPLETED",
              durationMs: data.audioGenFields.duration
                ? Math.round(data.audioGenFields.duration)
                : undefined,
              usage: data.usage,
              progress: 100
            }
          });
        }
        const { messages, ...e } = persist;
        const msgs = messages.map(t => {
          return {
            ...t,
            ttsJob: {
              ...t.ttsJob,
              sizeBytes: t.ttsJob?.sizeBytes ? Number(t.ttsJob.sizeBytes) : null
            }
          };
        });

        const cleaned = { messages: msgs, ...e };
        return {
          aiMsgId,
          persist: cleaned,
          imgGenAttachmentId: undefined,
          audioGenAttachmentId,
          convo: convo satisfies AIChatResponse["convo"]
        };
      }

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

        if (data.imgGenFields.partialImages) {
          s.push(...data.imgGenFields.partialImages);
        }

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

        const { messages, ...e } = persist;
        const msgs = messages.map(t => {
          return {
            ...t,
            ttsJob: {
              ...t.ttsJob,
              sizeBytes: t.ttsJob?.sizeBytes ? Number(t.ttsJob.sizeBytes) : null
            }
          };
        });

        const cleaned = { messages: msgs, ...e };
        return {
          aiMsgId,
          persist: cleaned,
          imgGenAttachmentId,
          audioGenAttachmentId: undefined,
          convo: convo satisfies AIChatResponse["convo"]
        };
      } else {
        const { messages, ...e } = persist;
        const msgs = messages.map(t => {
          return {
            ...t,
            ttsJob: {
              ...t.ttsJob,
              sizeBytes: t.ttsJob?.sizeBytes ? Number(t.ttsJob.sizeBytes) : null
            }
          };
        });

        const cleaned = { messages: msgs, ...e };

        return {
          aiMsgId,
          persist: cleaned,
          imgGenAttachmentId: undefined,
          audioGenAttachmentId: undefined,
          convo: convo satisfies AIChatResponse["convo"]
        };
      }
    });

    return transaction;
  }
}
