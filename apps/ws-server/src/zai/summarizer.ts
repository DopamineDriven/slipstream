import type { LoggerService } from "@/logger/index.ts";
import type { GatewaySummaryMessageParams } from "@/memory/summarizer-loop.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import { GatewaySummaryLoopService } from "@/memory/summarizer-loop.ts";
import { ZaiWorkupService } from "@/zai/workup.ts";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { ZaiModelIdUnion } from "@slipstream/types";

/**
 * The Zai summarizer arm (HMEM §6): extends the memory-free workup for
 * the battle-tested plumbing — gateway posture, fleet function-tool defs,
 * malformed-args parsers — while tool EXECUTION arrives as a closure from
 * the memory service's executeSummarizerToolCall, the identical path every
 * arm rides. Round mechanics live in the ctor-wired GatewaySummaryLoopService.
 */
export class ZaiSummarizerService extends ZaiWorkupService {
  private readonly summaryLoop: GatewaySummaryLoopService;

  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    redis: EnhancedRedisPubSub,
    userStoreVector: UserStoreVectorService,
    apiKey?: string
  ) {
    super(logger, prisma, redis, userStoreVector, apiKey);
    this.summaryLoop = new GatewaySummaryLoopService(
      this.logger,
      this.baseUrl,
      this.apiKey,
      "zai",
      [
        this.fileSearchFunctionTool(),
        this.memorySearchFunctionTool(),
        this.memoryGetChunkFunctionTool()
      ],
      rawArguments => this.parseFileSearchArguments(rawArguments)
    );
  }

  public async streamSummaryMessage(
    params: GatewaySummaryMessageParams<ZaiModelIdUnion>
  ) {
    return await this.summaryLoop.streamSummaryMessage(params);
  }
}
