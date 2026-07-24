import type { KimiChatCompletionsRes } from "@/kimi/sse.ts";
import type {
  KimiFunctionTool,
  KimiLocalToolFunctionTool,
  KimiRequestMessage
} from "@/kimi/types.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { Logger as PinoLogger } from "pino";
import { createKimiSSEParser } from "@/kimi/sse.ts";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { KimiModelIdUnion, LocalToolName } from "@slipstream/types";
import { LOCAL_TOOL_DEFINITIONS } from "@slipstream/types";

export class KimiWorkupService {
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
        { msgPrefix: "[Kimi] " }
      );
  }

  protected async *stream(
    model = "kimi-k2.6" satisfies KimiModelIdUnion,
    messages: readonly KimiRequestMessage[],
    apiKey?: string,
    options?: {
      temperature?: number;
      top_p?: number;
      max_completion_tokens?: number;
      tools?: readonly (KimiFunctionTool | KimiLocalToolFunctionTool)[];
    }
  ): AsyncGenerator<KimiChatCompletionsRes, void, unknown> {
    const key = apiKey ?? this.apiKey;

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: `moonshotai/${model}`,
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
        `Kimi API error (${response.status}, ${response.statusText}): ${errorText}`
      );
    }

    const parser = createKimiSSEParser(response);

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
        }) satisfies KimiLocalToolFunctionTool
    );
  }

  protected fileSearchFunctionTool() {
    return this.prisma.FileSearchTool() satisfies KimiFunctionTool;
  }

  protected memorySearchFunctionTool() {
    return this.prisma.memorySearchTool() satisfies KimiFunctionTool;
  }

  protected memoryGetChunkFunctionTool() {
    return this.prisma.memoryGetChunkTool() satisfies KimiFunctionTool;
  }
}
