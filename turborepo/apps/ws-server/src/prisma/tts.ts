import type { ExtractService } from "@/extract/index.ts";
import type { CreateUserStoreRT } from "@/prisma/types.ts";
import { PrismaProviderStoreService } from "@/prisma/provider-store.ts";
import type { PrismaDbService } from "@slipstream/db/factory";
import type { DX, MessageSingleton, UserTTSRequest } from "@slipstream/types";

export type TTSPropsCreate = DX<MessageSingleton<true> & UserTTSRequest>;

export class PrismaTTSService extends PrismaProviderStoreService {
  constructor(
    prisma: PrismaDbService,
    extractor: ExtractService,
    isProd: boolean
  ) {
    super(prisma, extractor, isProd);
  }

  private bigintToNum(data: CreateUserStoreRT<false>) {
    const { totalBytes, ...rest } = data;
    return {
      totalBytes: totalBytes ? Number(totalBytes) : 0,
      ...rest
    } satisfies CreateUserStoreRT<true>;
  }

  public async getMsgContentForTTS(msgId: string) {
    return await this.prismaClient.message.findUniqueOrThrow({
      where: { id: msgId },
      select: { content: true, conversationId: true }
    });
  }


  // public async getManyTts(userId: string) {
  //   const x = await this.prismaClient.message.findMany({
  //     where: { userId, ttsJob: { isNot: undefined } },
  //     include: {ttsJob: true},
  //     take: 1000
  //   });
  //   for (const xx of x) {
  //     if (!xx.ttsJob) continue;
  //     xx.conversationId;
  //     xx.id;

  //     xx.ttsJob.cdnUrl
  //   }
  // }
}
