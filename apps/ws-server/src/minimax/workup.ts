import type { LoggerService } from "@/logger/index.ts";
import type { MiniMaxChatCompletionsRes } from "@/minimax/sse.ts";
import type {
  MiniMaxFunctionTool,
  MiniMaxLocalToolFunctionTool,
  MiniMaxRequestMessage
} from "@/minimax/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { Logger as PinoLogger } from "pino";
import { createMiniMaxSSEParser } from "@/minimax/sse.ts";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { LocalToolName, MiniMaxModelIdUnion } from "@slipstream/types";
import { LOCAL_TOOL_DEFINITIONS } from "@slipstream/types";

export class MiniMaxWorkupService {
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
        { msgPrefix: "[MiniMax] " }
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
    model = "minimax-m3" satisfies MiniMaxModelIdUnion,
    messages: readonly MiniMaxRequestMessage[],
    apiKey?: string,
    options?: {
      temperature?: number;
      top_p?: number;
      max_completion_tokens?: number;
      tools?: readonly (MiniMaxFunctionTool | MiniMaxLocalToolFunctionTool)[];
    }
  ): AsyncGenerator<MiniMaxChatCompletionsRes, void, unknown> {
    const key = apiKey ?? this.apiKey;

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: `minimax/${model}`,
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
        `MiniMax API error (${response.status}, ${response.statusText}): ${errorText}`
      );
    }

    const parser = createMiniMaxSSEParser(response);

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
        }) satisfies MiniMaxLocalToolFunctionTool
    );
  }

  protected fileSearchFunctionTool() {
    return this.prisma.FileSearchTool() satisfies MiniMaxFunctionTool;
  }

  protected memorySearchFunctionTool() {
    return this.prisma.memorySearchTool() satisfies MiniMaxFunctionTool;
  }

  protected memoryGetChunkFunctionTool() {
    return this.prisma.memoryGetChunkTool() satisfies MiniMaxFunctionTool;
  }
}
