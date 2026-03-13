import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { Logger as PinoLogger } from "pino";
import { Anthropic } from "@anthropic-ai/sdk";
import type { AnthropicModelIdUnion } from "@slipstream/types";

export class AnthropicBaseService {
  protected defaultClient: Anthropic;
  protected logger: PinoLogger;
  constructor(
    logger: LoggerService,
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

  protected handleBetaHeaders(
    model: AnthropicModelIdUnion,
    withLocalStore = false
  ) {
    switch (model) {
      case "claude-sonnet-4-6":
      case "claude-opus-4-6": {
        if (withLocalStore) {
          return [
            "advanced-tool-use-2025-11-20",
            "context-1m-2025-08-07",
            "files-api-2025-04-14",
            "extended-cache-ttl-2025-04-11",
            "web-fetch-2025-09-10",
            "code-execution-2025-08-25"
          ] satisfies Anthropic.Beta.AnthropicBeta[];
        } else {
          return [
            "context-1m-2025-08-07",
            "files-api-2025-04-14",
            "extended-cache-ttl-2025-04-11",
            "code-execution-2025-08-25"
          ] satisfies Anthropic.Beta.AnthropicBeta[];
        }
      }
      // effort parameter is only supported by claude opus 4.5
      case "claude-opus-4-5-20251101": {
        if (withLocalStore) {
          // advanced-tool-use supported by claude sonnet|opus 4.5/4.6 only
          return [
            "advanced-tool-use-2025-11-20",
            "effort-2025-11-24",
            "files-api-2025-04-14",
            "web-fetch-2025-09-10",
            "extended-cache-ttl-2025-04-11",
            "code-execution-2025-08-25"
          ] satisfies Anthropic.Beta.AnthropicBeta[];
        } else {
          return [
            "effort-2025-11-24",
            "files-api-2025-04-14",
            "extended-cache-ttl-2025-04-11",
            "web-fetch-2025-09-10",
            "code-execution-2025-08-25"
          ] satisfies Anthropic.Beta.AnthropicBeta[];
        }
      }
      // input context window 1m is only supported by claude sonnet 4 & 4.5 / Opus 4.6
      case "claude-sonnet-4-5-20250929":
      case "claude-sonnet-4-20250514": {
        // advanced-tool-use supported by claude sonnet|opus 4.5/4.6 only
        if (withLocalStore && model === "claude-sonnet-4-5-20250929") {
          return [
            "advanced-tool-use-2025-11-20",
            "files-api-2025-04-14",
            "extended-cache-ttl-2025-04-11",
            "web-fetch-2025-09-10",
            "context-1m-2025-08-07",
            "code-execution-2025-08-25"
          ] satisfies Anthropic.Beta.AnthropicBeta[];
        } else {
          return [
            "files-api-2025-04-14",
            "extended-cache-ttl-2025-04-11",
            "context-1m-2025-08-07",
            "web-fetch-2025-09-10",
            "code-execution-2025-08-25"
          ] satisfies Anthropic.Beta.AnthropicBeta[];
        }
      }
      case "claude-opus-4-20250514":
      case "claude-opus-4-1-20250805":
      case "claude-haiku-4-5-20251001": {
        return [
          "files-api-2025-04-14",
          "extended-cache-ttl-2025-04-11",
          "web-fetch-2025-09-10",
          "code-execution-2025-08-25"
        ] satisfies Anthropic.Beta.AnthropicBeta[];
      }
      case "claude-3-haiku-20240307":
      default: {
        return [
          "files-api-2025-04-14",
          "extended-cache-ttl-2025-04-11"
        ] satisfies Anthropic.Beta.AnthropicBeta[];
      }
    }
  }

  protected outputTokenCeilingByModel = {
    "claude-sonnet-4-6": 64000,
    "claude-opus-4-6": 128000,
    "claude-3-haiku-20240307": 4096,
    "claude-opus-4-20250514": 32000,
    "claude-opus-4-1-20250805": 32000,
    "claude-opus-4-5-20251101": 64000,
    "claude-haiku-4-5-20251001": 64000,
    "claude-sonnet-4-20250514": 64000,
    "claude-sonnet-4-5-20250929": 64000
  } as const;

  protected inputTokenCeilingByModel = {
    "claude-sonnet-4-6": 1000000,
    "claude-opus-4-6": 1000000,
    "claude-3-haiku-20240307": 200000,
    "claude-opus-4-20250514": 200000,
    "claude-opus-4-1-20250805": 200000,
    "claude-opus-4-5-20251101": 200000,
    "claude-haiku-4-5-20251001": 200000,
    "claude-sonnet-4-20250514": 1000000,
    "claude-sonnet-4-5-20250929": 1000000
  } as const;

  protected getMaxTokens = <const T extends AnthropicModelIdUnion>(
    model: T
  ) => {
    return this.outputTokenCeilingByModel[model];
  };

  protected handleMaxTokens(mod: AnthropicModelIdUnion, max_tokens?: number) {
    const model = mod as AnthropicModelIdUnion;
    if (max_tokens && max_tokens <= this.getMaxTokens(model)) {
      return max_tokens;
    } else {
      return this.getMaxTokens(model);
    }
  }

  protected handleThinking(mod: AnthropicModelIdUnion, max_tokens?: number) {
    switch (mod) {
      case "claude-sonnet-4-6":
      case "claude-opus-4-6":
      case "claude-opus-4-1-20250805":
      case "claude-opus-4-20250514":
      case "claude-sonnet-4-20250514":
      case "claude-haiku-4-5-20251001":
      case "claude-opus-4-5-20251101":
      case "claude-sonnet-4-5-20250929": {
        if (this.handleMaxTokens(mod, max_tokens) >= 1024) {
          if (mod === "claude-opus-4-6" || mod === "claude-sonnet-4-6") {
            return {
              type: "adaptive"
            } as const satisfies Anthropic.Beta.BetaThinkingConfigAdaptive;
          }
          return {
            type: "enabled",
            budget_tokens: this.getMaxTokens(mod) - 1024
          } as const satisfies Anthropic.Beta.BetaThinkingConfigEnabled;
        } else {
          if (mod === "claude-opus-4-6" || mod === "claude-sonnet-4-6") {
            return {
              type: "adaptive"
            } as const satisfies Anthropic.Beta.BetaThinkingConfigAdaptive;
          }
          return {
            type: "disabled"
          } as const satisfies Anthropic.Beta.BetaThinkingConfigDisabled;
        }
      }
      case "claude-3-haiku-20240307":
      default: {
        return {
          type: "disabled"
        } as const satisfies Anthropic.Beta.BetaThinkingConfigDisabled;
      }
    }
  }

  protected handleMaxTokensAndThinking(
    mod: AnthropicModelIdUnion,
    max_tokens?: number
  ) {
    return {
      thinking: this.handleThinking(mod, max_tokens),
      max_tokens: this.handleMaxTokens(mod, max_tokens)
    };
  }
}
