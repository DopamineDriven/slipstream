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
  protected supportsAdaptive(mod: string) {
    return (
      mod === "claude-opus-5" ||
      mod === "claude-opus-4-8" ||
      mod === "claude-opus-4-7" ||
      mod === "claude-opus-4-6" ||
      mod === "claude-sonnet-4-6" ||
      mod === "claude-fable-5" ||
      mod === "claude-sonnet-5"
    );
  }

  protected supportsEffort(mod: string) {
    return this.supportsAdaptive(mod) || mod === "claude-opus-4-5-20251101";
  }

  protected handleBetaHeaders(
    model: AnthropicModelIdUnion,
    withLocalStore = false
  ) {
    switch (model) {
      /**
       * Avoid paying the prompt-cache cost twice when you retry a refused Claude Fable 5 request on another model.
       * https://platform.claude.com/docs/en/build-with-claude/fallback-credit
       */
      case "claude-opus-5":
      case "claude-fable-5":
      case "claude-sonnet-5":
      case "claude-opus-4-8":
      case "claude-opus-4-7":
      case "claude-sonnet-4-6":
      case "claude-opus-4-6": {
        if (withLocalStore) {
          return [
            "advanced-tool-use-2025-11-20",
            "fallback-credit-2026-06-01",
            "files-api-2025-04-14",
            "extended-cache-ttl-2025-04-11",
            "web-fetch-2025-09-10",
            "code-execution-2025-08-25"
          ] satisfies Anthropic.Beta.AnthropicBeta[];
        } else {
          return [
            "files-api-2025-04-14",
            "fallback-credit-2026-06-01",
            "extended-cache-ttl-2025-04-11",
            "code-execution-2025-08-25"
          ] satisfies Anthropic.Beta.AnthropicBeta[];
        }
      }
      case "claude-opus-4-5-20251101": {
        if (withLocalStore) {
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
      case "claude-sonnet-4-5-20250929": {
        if (withLocalStore) {
          return [
            "advanced-tool-use-2025-11-20",
            "files-api-2025-04-14",
            "extended-cache-ttl-2025-04-11",
            "web-fetch-2025-09-10",
            "code-execution-2025-08-25"
          ] satisfies Anthropic.Beta.AnthropicBeta[];
        } else {
          return [
            "files-api-2025-04-14",
            "extended-cache-ttl-2025-04-11",
            "web-fetch-2025-09-10",
            "code-execution-2025-08-25"
          ] satisfies Anthropic.Beta.AnthropicBeta[];
        }
      }
      case "claude-opus-4-1-20250805":
      case "claude-haiku-4-5-20251001": {
        return [
          "files-api-2025-04-14",
          "extended-cache-ttl-2025-04-11",
          "web-fetch-2025-09-10"
        ] satisfies Anthropic.Beta.AnthropicBeta[];
      }
    }
  }

  protected outputTokenCeilingByModel = {
    "claude-opus-5": 128000,
    "claude-sonnet-5": 128000,
    "claude-fable-5": 128000,
    "claude-opus-4-8": 128000,
    "claude-opus-4-7": 128000,
    "claude-sonnet-4-6": 128000,
    "claude-opus-4-6": 128000,
    "claude-opus-4-5-20251101": 64000,
    "claude-haiku-4-5-20251001": 64000,
    "claude-sonnet-4-5-20250929": 64000,
    "claude-opus-4-1-20250805": 32000
  } as const;

  protected inputTokenCeilingByModel = {
    "claude-opus-5": 1000000,
    "claude-sonnet-5": 1000000,
    "claude-fable-5": 1000000,
    "claude-opus-4-8": 1000000,
    "claude-opus-4-7": 1000000,
    "claude-sonnet-4-6": 1000000,
    "claude-opus-4-6": 1000000,
    "claude-sonnet-4-5-20250929": 200000,
    "claude-opus-4-5-20251101": 200000,
    "claude-haiku-4-5-20251001": 200000,
    "claude-opus-4-1-20250805": 200000
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
    if (this.handleMaxTokens(mod, max_tokens) >= 1024) {
      if (this.prisma.isAnthropicAdaptiveModel(mod)) {
        return {
          type: "adaptive",
          display: "summarized"
        } as const satisfies Anthropic.Beta.BetaThinkingConfigAdaptive;
      }
      return {
        type: "enabled",
        budget_tokens: this.getMaxTokens(mod) - 1024
      } as const satisfies Anthropic.Beta.BetaThinkingConfigEnabled;
    } else {
      if (this.prisma.isAnthropicAdaptiveModel(mod)) {
        return {
          type: "adaptive",
          display: "summarized"
        } as const satisfies Anthropic.Beta.BetaThinkingConfigAdaptive;
      }
      return {
        type: "disabled"
      } as const satisfies Anthropic.Beta.BetaThinkingConfigDisabled;
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
