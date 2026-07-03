import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { Anthropic } from "@anthropic-ai/sdk";
import { AnthropicBaseService } from "@/anthropic/base.ts";
import type { AnthropicModelIdUnion } from "@slipstream/types";

/**
 * The conversation-memory summarizer rides the SAME battle-tested call shape
 * as the chat path — beta headers, adaptive thinking, ceiling-clamped
 * max_tokens — via AnthropicBaseService. A raw client with none of that
 * produced format-noncompliant output from the very same model.
 */
export class AnthropicSummarizerService extends AnthropicBaseService {
  constructor(logger: LoggerService, prisma: PrismaService, apiKey: string) {
    super(logger, prisma, apiKey);
  }

  public async streamSummaryMessage(params: {
    model: AnthropicModelIdUnion;
    maxOutputTokens: number;
    system: string;
    content: Anthropic.Beta.BetaContentBlockParam[];
  }) {
    const { thinking, max_tokens } = this.handleMaxTokensAndThinking(
      params.model,
      params.maxOutputTokens
    );

    return await this.getClient()
      .beta.messages.stream({
        model: params.model,
        max_tokens,
        thinking,
        system: params.system,
        messages: [{ role: "user", content: params.content }],
        betas: this.handleBetaHeaders(params.model, false)
      })
      .finalMessage();
  }
}
