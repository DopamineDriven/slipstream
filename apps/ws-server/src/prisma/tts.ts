import type { ExtractService } from "@/extract/index.ts";
import type { TTSTypes } from "@/tts/types.ts";
import { PrismaProviderStoreService } from "@/prisma/provider-store.ts";
import type { PrismaDbService } from "@slipstream/db/factory";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { Rm, TTSJobSingleton } from "@slipstream/types";

export type CreateTTSJobParams = {
  conversationId: string;
  sourceMessageId: string;
  userId: string;
  provider: string;
  voice: string;
  language: string;
  codec: string;
  sampleRate: number;
  bitrate: number;
  charCount: number;
};

export type UpdateTTSJobFields = {
  durationMs?: number;
  generationMs?: number;
  sizeBytes?: bigint;
  error?: string;
  cdnUrl?: string;
  attachmentId?: string;
};

export class PrismaTTSService extends PrismaProviderStoreService {
  constructor(
    prisma: PrismaDbService,
    extractor: ExtractService,
    isProd: boolean
  ) {
    super(prisma, extractor, isProd);
  }

  private ttsJobBigIntToNum(job: TTSJobSingleton<true | false>) {
    const { sizeBytes, ...rest } = job;
    return {
      ...rest,
      sizeBytes: sizeBytes ? Number(sizeBytes) : 0
    } satisfies TTSJobSingleton<true>;
  }

  public async getMsgContentForTTS(msgId: string) {
    return await this.prismaClient.message.findUniqueOrThrow({
      where: { id: msgId },
      select: {
        content: true,
        conversationId: true,
        model: true,
        messageBlocks: true,
        provider: true,
        senderType: true
      }
    });
  }

  public async createTTSJob(params: TTSTypes.CreateTTSJob) {
    const job = await this.prismaClient.tTSJob.create({
      data: {
        ...params,
        status: "QUEUED"
      }
    });
    return this.ttsJobBigIntToNum(job);
  }

  public async updateTTSJobStatus(
    jobId: string,
    status: $Enums.TTSStatus,
    fields?: TTSTypes.UpdateTTSJob
  ) {
    const job = await this.prismaClient.tTSJob.update({
      where: { id: jobId },
      data: { status, ...fields }
    });
    return this.ttsJobBigIntToNum(job);
  }

  public async deleteTTSJob(jobId: string) {
    await this.prismaClient.tTSJob.delete({ where: { id: jobId } });
  }

  public async findExistingTTSJob(sourceMessageId: string, userId: string) {
    const job = await this.prismaClient.tTSJob.findUnique({
      where: { userId_sourceMessageId: { userId, sourceMessageId } }
    });
    if (!job) return null;
    return this.ttsJobBigIntToNum(job);
  }

  public async hasTTSJobsOnFile(userId: string) {
    const getCount = await this.prismaClient.tTSJob.count({
      where: { userId }
    });
    return getCount > 0;
  }

  public async findAllTTSJobs(userId: string) {
    const ttsJobFindMany = await this.prismaClient.tTSJob.findMany({
      take: 2000,
      where: { userId },
      select: {
        conversationId: true,
        createdAt: true,
        cdnUrl: true,
        codec: true,
        attachmentId: true,
        durationMs: true,
        error: true,
        updatedAt: true,
        sourceMessageId: true,
        status: true,
        sizeBytes: true,
        bitrate: true,
        generationMs: true,
        sampleRate: true,
        voice: true,
        language: true,
        provider: true,
        id: true,
        charCount: true
      }
    });
    return this.findManyBigIntHelper(ttsJobFindMany, userId);
  }

  private findManyBigIntHelper(
    props: Rm<TTSJobSingleton<true | false>, "userId">[],
    userId: string
  ) {
    return props.map(t => {
      return {
        ...t,
        userId,
        sizeBytes: t.sizeBytes ? Number(t.sizeBytes) : null
      } satisfies TTSJobSingleton<true>;
    });
  }
}
