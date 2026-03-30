import type { ExtractService } from "@/extract/index.ts";
import { PrismaProviderStoreService } from "@/prisma/provider-store.ts";
import type { PrismaDbService } from "@slipstream/db/factory";
import type { $Enums } from "@slipstream/db/node/generated/client";

export interface CreateTTSJobParams {
  sourceMessageId: string;
  userId: string;
  provider: string;
  voice: string;
  language: string;
  codec: string;
  sampleRate: number;
  bitrate: number;
  charCount: number;
}

export interface UpdateTTSJobFields {
  durationMs?: number;
  generationMs?: number;
  sizeBytes?: bigint;
  error?: string;
  cdnUrl?: string;
  attachmentId?: string;
}

export class PrismaTTSService extends PrismaProviderStoreService {
  constructor(
    prisma: PrismaDbService,
    extractor: ExtractService,
    isProd: boolean
  ) {
    super(prisma, extractor, isProd);
  }

  private ttsJobBigIntToNum<const T extends { sizeBytes: bigint | null }>(
    job: T
  ) {
    const { sizeBytes, ...rest } = job;
    return { ...rest, sizeBytes: sizeBytes ? Number(sizeBytes) : 0 };
  }

  public async getMsgContentForTTS(msgId: string) {
    return await this.prismaClient.message.findUniqueOrThrow({
      where: { id: msgId },
      select: { content: true, conversationId: true }
    });
  }

  public async createTTSJob(params: CreateTTSJobParams) {
    const job = await this.prismaClient.tTSJob.create({
      data: {
        sourceMessageId: params.sourceMessageId,
        userId: params.userId,
        provider: params.provider,
        voice: params.voice,
        language: params.language,
        codec: params.codec,
        sampleRate: params.sampleRate,
        bitrate: params.bitrate,
        charCount: params.charCount,
        status: "QUEUED"
      }
    });
    return this.ttsJobBigIntToNum(job);
  }

  public async updateTTSJobStatus(
    jobId: string,
    status: $Enums.TTSStatus,
    fields?: UpdateTTSJobFields
  ) {
    const job = await this.prismaClient.tTSJob.update({
      where: { id: jobId },
      data: { status, ...fields }
    });
    return this.ttsJobBigIntToNum(job);
  }

  public async findExistingTTSJob(sourceMessageId: string, userId: string) {
    const job = await this.prismaClient.tTSJob.findUnique({
      where: { userId_sourceMessageId: { userId, sourceMessageId } }
    });
    if (!job) return null;
    return this.ttsJobBigIntToNum(job);
  }
}
