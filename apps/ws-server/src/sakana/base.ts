import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { Logger as PinoLogger } from "pino";
import { OpenAI } from "openai";
import type { S3Storage } from "@slipstream/storage-s3";

interface ReasoningProps {
  effort: "high" | "xhigh";
}

export class SakanaBaseService {
  protected baseUrl = "https://api.sakana.ai/v1";
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
        { msgPrefix: "[sakana] " }
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

  protected handleReasoning(model: string, effort?: "high" | "xhigh" | "max") {
    if (!this.prisma.isSakanaModel(model)) return;
    else {
      const normalizedEffort = effort === "max" ? "xhigh" : effort;
      if (model === "fugu") {
        return {
          effort: normalizedEffort ?? "high"
        } as const satisfies ReasoningProps;
      } else {
        return {
          effort: normalizedEffort ?? "xhigh"
        } as const satisfies ReasoningProps;
      }
    }
  }
}
