import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { Logger as PinoLogger } from "pino";
import type { MetaReasoningEffort } from "@/meta/types.ts";
import { OpenAI } from "openai";
import type { S3Storage } from "@slipstream/storage-s3";

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

  protected handleReasoning(
    model: string,
    effort?: MetaReasoningEffort["effort"]
  ) {
    if (!this.prisma.isMetaModel(model)) return;
    else {
      const normalizedEffort =
        effort === "none" || effort === "low" || effort === "minimal"
          ? "medium"
          : effort;
        return {
          effort: normalizedEffort ?? "xhigh"
        } as const satisfies MetaReasoningEffort;
    }
  }
}
