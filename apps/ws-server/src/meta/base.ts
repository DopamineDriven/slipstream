import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { MetaReasoningEffort } from "@/meta/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { Reasoning } from "openai/resources/shared";
import type { Logger as PinoLogger } from "pino";
import { OpenAI } from "openai";
import type { S3Storage } from "@slipstream/storage-s3";

/**
 *video/mp4, audio/mpeg, audio/wav
 *
 * https://dev.meta.ai/docs/video-understanding#supported-formats
 */
export class MetaBaseService {
  protected baseUrl = "https://api.meta.ai/v1";
  protected defaultClient: OpenAI;
  protected logger: PinoLogger;
  constructor(
    logger: LoggerService,
    protected prisma: PrismaService,
    protected userStoreVector: UserStoreVectorService,
    protected apiKey: string,
    protected s3: S3Storage,
    protected memoryService: ConversationMemoryVectorService
  ) {
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[meta] " }
      );
    this.defaultClient = new OpenAI({
      logLevel: "debug",
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      logger: this.logger
    });
  }

  public getClient(overrideKey?: string) {
    const client = this.defaultClient;
    if (overrideKey) {
      return client.withOptions({ apiKey: overrideKey });
    }
    return client;
  }
  private normalizeEffort(effort: string) {
    return effort === "none" || effort === "low" || effort === "minimal";
  }

  /**
   * only muse-spark-1.3 accepts max reasoning
   *
   * https://dev.meta.ai/docs/reasoning#summaries
   */
  protected handleReasoning(
    model: string,
    effort?: MetaReasoningEffort["effort"]
  ) {
    if (!this.prisma.isMetaModel(model)) return;
    else if (!(model === "muse-spark-1.3")) {
      const normalizedEffort =
        effort && this.normalizeEffort(effort)
          ? "medium"
          : effort === "max"
            ? "xhigh"
            : effort;
      return {
        effort: normalizedEffort ?? "xhigh",
        summary: "detailed"
      } as const satisfies Reasoning;
    } else {
      const normalizedEffort =
        effort && this.normalizeEffort(effort) ? "xhigh" : "max";
      return {
        effort: normalizedEffort,
        summary: "detailed"
      } as const satisfies Reasoning;
    }
  }
}
