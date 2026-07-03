import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { Anthropic } from "@anthropic-ai/sdk";
import { AnthropicBaseService } from "@/anthropic/base.ts";
import type { AnthropicModelIdUnion } from "@slipstream/types";

/** one traced in-house tool round-trip — persisted raw for data-driven config feedback */
export interface SummarizerToolCallRecord {
  round: number;
  name: string;
  input: unknown;
  output: string;
  isError: boolean;
}

export interface StreamSummaryMessageParams {
  model: AnthropicModelIdUnion;
  maxOutputTokens: number;
  effort: "high" | "xhigh" | "max";
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  /** in-house tools offered to the call (e.g. user-store file_search) */
  tools?: Anthropic.Beta.BetaToolUnion[];
  /** executes one tool call; results feed back into the loop until end_turn */
  executeToolCall?: (name: string, input: unknown) => Promise<string>;
  /** hard cap on tool round-trips — defense against foraging spirals */
  maxToolUseRounds?: number;
  /** per-round wall-clock deadline; a stalled stream aborts instead of living forever */
  callDeadlineMs?: number;
}

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

  /**
   * Agentic summary call with full observability: adaptive-thinking blocks
   * are captured (text + stream-event-timed duration) and every in-house
   * tool round-trip is traced. Thinking blocks ride back into follow-up
   * rounds verbatim — their signatures must survive the loop.
   */
  public async streamSummaryMessage(params: StreamSummaryMessageParams) {
    const { thinking, max_tokens } = this.handleMaxTokensAndThinking(
      params.model,
      params.maxOutputTokens
    );
    const betas = this.handleBetaHeaders(params.model, false);
    const maxToolUseRounds = params.maxToolUseRounds ?? 0;
    const callDeadlineMs = params.callDeadlineMs ?? 900_000;
    const { executeToolCall } = params;

    const messages = Array.of<Anthropic.Beta.BetaMessageParam>();
    messages.push({ role: "user", content: params.content });

    const toolUse = Array.of<SummarizerToolCallRecord>();
    const reasoningParts = Array.of<string>();
    let reasoningDuration = 0;

    for (let round = 0; round <= maxToolUseRounds; round++) {
      const stream = this.getClient().beta.messages.stream({
        model: params.model,
        max_tokens,
        thinking,
        output_config: { effort: params.effort },
        system: params.system,
        messages,
        ...(params.tools && params.tools.length > 0
          ? { tools: params.tools }
          : {}),
        betas
      });

      // wall-clock the thinking phase via content_block_start/stop pairs —
      // the final message carries the text but not the time
      const thinkingStartedAt = new Map<number, number>();
      stream.on("streamEvent", event => {
        if (
          event.type === "content_block_start" &&
          event.content_block.type === "thinking"
        ) {
          thinkingStartedAt.set(event.index, performance.now());
        } else if (event.type === "content_block_stop") {
          const started = thinkingStartedAt.get(event.index);
          if (started != null) {
            reasoningDuration += performance.now() - started;
            thinkingStartedAt.delete(event.index);
          }
        }
      });

      // wave forward-progress depends on every job settling — a stalled
      // stream aborts into the caller's ERROR/retry path, never lives forever
      const deadline = setTimeout(() => stream.abort(), callDeadlineMs);
      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await stream.finalMessage();
      } finally {
        clearTimeout(deadline);
      }

      for (const block of message.content) {
        if (block.type === "thinking" && block.thinking.length > 0) {
          reasoningParts.push(block.thinking);
        }
      }

      const toolUses = message.content.filter(
        block => block.type === "tool_use"
      );
      const canContinue =
        message.stop_reason === "tool_use" &&
        toolUses.length > 0 &&
        executeToolCall != null &&
        round < maxToolUseRounds;

      if (!canContinue) {
        return {
          text: message.content
            .filter(block => block.type === "text")
            .map(block => block.text)
            .join("\n"),
          reasoningText:
            reasoningParts.length > 0 ? reasoningParts.join("\n\n") : null,
          reasoningDuration: Math.round(reasoningDuration),
          toolUse
        } as const;
      }

      // assistant blocks return verbatim (signed thinking must survive the
      // round-trip), then the tool results ride a user turn
      messages.push({ role: "assistant", content: message.content });
      const toolResults = Array.of<Anthropic.Beta.BetaToolResultBlockParam>();
      for (const tu of toolUses) {
        try {
          const output = await executeToolCall(tu.name, tu.input);
          toolUse.push({
            round,
            name: tu.name,
            input: tu.input,
            output,
            isError: false
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: output
          });
        } catch (err) {
          const failure = this.prisma.safeErrMsg(err);
          toolUse.push({
            round,
            name: tu.name,
            input: tu.input,
            output: failure,
            isError: true
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `${tu.name} error: ${failure}`,
            is_error: true
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
    }

    throw new Error(
      "unreachable: summary loop exited without a terminal message"
    );
  }
}
