import type {
  AnthropicFileRecord
} from "@/anthropic/types.ts";
import type { Logger as PinoLogger } from "pino";
import { LoggerService } from "@/logger/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { Anthropic } from "@anthropic-ai/sdk";
import { VoyageEmbeddingService } from "@/voyage/index.ts";


export class AnthropicVectorStoreWorkup {
  protected defaultClient: Anthropic;
  protected logger: PinoLogger;
  private assetCache = new Map<
    string,
    { fileId: string; dbRecordId: string; lastCheckedAt: Date | null }
  >();
  // Registry of all Anthropic files with access tracking
  private fileRegistry = new Map<string, AnthropicFileRecord>();
  private lastRegistrySync: Date | null = null;
  constructor(
    logger: LoggerService,
    protected voyage: VoyageEmbeddingService,
    protected prisma: PrismaService,
    protected apiKey: string
  ) {
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[anthropic] " }
      );
    this.defaultClient = new Anthropic({
      apiKey: this.apiKey,
      logLevel: "debug",
      logger: this.logger
    });
  }
  protected getClient(overrideKey?: string) {
    const client = this.defaultClient;
    if (overrideKey) {
      return client.withOptions({ apiKey: overrideKey });
    }
    return client;
  }
}
