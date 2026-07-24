import type { AlibabaChatCompletionsRes } from "@/alibaba/sse.ts";
import type {
  AlibabaFunctionTool,
  AlibabaLocalToolFunctionTool,
  AlibabaRequestMessage
} from "@/alibaba/types.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { Logger as PinoLogger } from "pino";
import { createAlibabaSSEParser } from "@/alibaba/sse.ts";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { AlibabaModelIdUnion, LocalToolName } from "@slipstream/types";
import { LOCAL_TOOL_DEFINITIONS } from "@slipstream/types";

export class AlibabaWorkupService {
  protected readonly baseUrl =
    "https://ai-gateway.vercel.sh/v1/chat/completions";
  protected logger: PinoLogger;

  constructor(
    logger: LoggerService,
    protected prisma: PrismaService,
    protected redis: EnhancedRedisPubSub,
    protected userStoreVector: UserStoreVectorService,
    protected apiKey?: string
  ) {
    this.logger = logger
      .getPinoInstance()
      .child(
        { pid: process.pid, node_version: process.version },
        { msgPrefix: "[Alibaba] " }
      );
  }

  protected get maxToolDefaults() {
    return {
      fileSearch: {
        defaultResults: 5,
        minResults: 5,
        maxResults: 15
      },
      // backstop only, not a working budget — memory tools dual-wield across rounds
      maxToolRounds: 10_000_000
    } as const satisfies {
      fileSearch: {
        defaultResults: number;
        minResults: number;
        maxResults: number;
      };
      maxToolRounds: number;
    };
  }

  protected async *stream(
    model = "qwen3.7-max" satisfies AlibabaModelIdUnion,
    messages: readonly AlibabaRequestMessage[],
    apiKey?: string,
    options?: {
      temperature?: number;
      top_p?: number;
      max_completion_tokens?: number;
      tools?: readonly (AlibabaFunctionTool | AlibabaLocalToolFunctionTool)[];
    }
  ): AsyncGenerator<AlibabaChatCompletionsRes, void, unknown> {
    const key = apiKey ?? this.apiKey;

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: `alibaba/${model}`,
        messages,
        stream: true,
        tools: options?.tools,
        providerOptions: {
          gateway: {
            zeroDataRetention: true
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Alibaba API error (${response.status}, ${response.statusText}): ${errorText}`
      );
    }

    const parser = createAlibabaSSEParser(response);

    for await (const event of parser) {
      yield event.data;
    }
  }

  /**
   * Local read-only tool bridge (Sovereign CLI) — canonical definitions
   * mapped into the gateway's OpenAI-compatible completions dialect. Plain
   * JSON Schema, so this is a near-identity map (parameters ===
   * inputSchema). Empty when the CLI advertises nothing.
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
        }) satisfies AlibabaLocalToolFunctionTool
    );
  }

  protected fileSearchFunctionTool() {
    return this.prisma.FileSearchTool() satisfies AlibabaFunctionTool;
  }

  protected memorySearchFunctionTool() {
    return this.prisma.memorySearchTool() satisfies AlibabaFunctionTool;
  }

  protected memoryGetChunkFunctionTool() {
    return this.prisma.memoryGetChunkTool() satisfies AlibabaFunctionTool;
  }
}
