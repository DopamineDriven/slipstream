import type { LoggerService } from "@/logger/index.ts";
import type {
  MistralFunctionTool,
  MistralLocalToolFunctionTool,
  MistralMessageReq,
  ToolTypes
} from "@/mistral/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { Logger as PinoLogger } from "pino";
import { MistralStreamContentService } from "@/mistral/stream-content.ts";
import { Mistral } from "@mistralai/mistralai";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { LocalToolName, MistralModelIdUnion } from "@slipstream/types";
import { LOCAL_TOOL_DEFINITIONS } from "@slipstream/types";

export class MistralWorkupService extends MistralStreamContentService {
  protected defaultClient: Mistral;
  protected logger: PinoLogger;

  constructor(
    logger: LoggerService,
    protected prisma: PrismaService,
    protected redis: EnhancedRedisPubSub,
    protected userStoreVector: UserStoreVectorService,
    protected apiKey: string
  ) {
    super();
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[mistral] " }
      );
    this.defaultClient = new Mistral({
      apiKey: this.apiKey
    });
  }

  protected getClient(overrideKey?: string) {
    if (overrideKey) {
      return new Mistral({
        apiKey: overrideKey
      });
    }

    return this.defaultClient;
  }

  protected isMistralModel(model = "mistral-medium-3.5") {
    return (
      model === "mistral-small-latest" ||
      model === "mistral-medium-3" ||
      model === "mistral-medium-3.5" ||
      model === "mistral-large-latest"
    );
  }

  protected resolveModel(model = "mistral-medium-3.5") {
    if (this.isMistralModel(model)) {
      return model;
    }

    return "mistral-medium-3.5" satisfies MistralModelIdUnion;
  }

  protected handleReasoning(m: MistralModelIdUnion) {
    if (m === "mistral-small-latest") return "high";
    if (m === "mistral-medium-3") return "high";
    if (m === "mistral-medium-3.5") return "high";
    else return;
  }

  protected async stream(
    model: MistralModelIdUnion,
    messages: MistralMessageReq[],
    apiKey?: string,
    options?: {
      temperature?: number;
      topP?: number;
      tools?: ToolTypes;
    }
  ) {
    const client = this.getClient(apiKey);

    return await client.chat.stream({
      model,
      messages,
      reasoningEffort: this.handleReasoning(model),
      temperature: options?.temperature ?? 0.7,
      tools: options?.tools,
      parallelToolCalls: true,
      stream: true,
      safePrompt: false
    });
  }

  protected fileSearchFunctionTool() {
    return this.prisma.FileSearchTool() satisfies MistralFunctionTool;
  }

  protected memorySearchFunctionTool() {
    return this.prisma.memorySearchTool() satisfies MistralFunctionTool;
  }

  protected memoryGetChunkFunctionTool() {
    return this.prisma.memoryGetChunkTool() satisfies MistralFunctionTool;
  }

  /**
   * Local read-only tool bridge (Sovereign CLI) — canonical definitions
   * mapped into mistral's completions function-tool dialect. Plain JSON
   * Schema, so this is a near-identity map (parameters === inputSchema).
   * Empty when the CLI advertises nothing.
   */
  protected localToolFunctionTools(names: readonly LocalToolName[]) {
    const advertised = new Set<string>(names);
    return LOCAL_TOOL_DEFINITIONS.filter(d => advertised.has(d.name)).map(
      d =>
        ({
          type: "function",
          function: {
            name: d.name,
            description: d.description,
            parameters: d.inputSchema
          }
        }) satisfies MistralLocalToolFunctionTool
    );
  }
}
