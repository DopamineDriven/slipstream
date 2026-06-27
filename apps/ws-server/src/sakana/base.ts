import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { Logger as PinoLogger } from "pino";
import { OpenAI } from "openai";
import type { S3Storage } from "@slipstream/storage-s3";

interface ReasoningProps {
  effort: "high" | "xhigh" | "max";
}

export class SakanaBaseService {
  protected defaultClient: OpenAI;
  protected logger: PinoLogger;
  constructor(
    logger: LoggerService,
    protected prisma: PrismaService,
    protected userStoreVector: UserStoreVectorService,
    protected apiKey: string,
    protected s3: S3Storage
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
      baseURL: "https://api.sakana.ai/v1",
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

  public isSakanaModel(id: string) {
    return id === "fugu" || id === "fugu-ultra";
  }

  protected handleReasoning(model: string, effort?: "high" | "xhigh" | "max") {
    if (!this.isSakanaModel(model)) return;
    else {
      if (model === "fugu") {
        return {
          effort: effort ?? "xhigh"
        } as const satisfies ReasoningProps;
      } else {
        return {
          effort: effort ?? "max"
        } as const satisfies ReasoningProps;
      }
    }
  }
}
