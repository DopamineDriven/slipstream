import type {
  StreamSummaryMessageParams,
  SummarizerToolCallRecord
} from "@/anthropic/types.ts";
import type { Logger as PinoLogger } from "pino";
import type { AllModelsUnion } from "@slipstream/types";

export type GatewayRequestContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface GatewayCompletionsToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type GatewayRequestMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | GatewayRequestContentPart[] }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: GatewayCompletionsToolCall[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export interface GatewayCompletionsUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
}

interface GatewayCompletionsResponse {
  choices?: {
    message?: {
      role: "assistant";
      content: string | null;
      /** deepseek-style reasoning surface */
      reasoning_content?: string | null;
      /** gateway-normalized reasoning surface (provider-dependent) */
      reasoning?: string | null;
      tool_calls?: GatewayCompletionsToolCall[];
    };
    finish_reason?: string | null;
  }[];
  usage?: GatewayCompletionsUsage;
}

/** structural minimum for the fleet function-tool defs — every provider's `as const` literal satisfies it */
export interface GatewaySummarizerTool {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: unknown;
  };
}

/** the per-arm public contract — mirrors OpenAIStreamSummaryParams minus effort (gateway arms reason by default) */
export interface GatewaySummaryMessageParams<
  TModel extends AllModelsUnion = AllModelsUnion
> {
  model: TModel;
  /** undefined = no cap — the request omits max_tokens and the provider ceiling applies */
  maxOutputTokens: number | undefined;
  system: string;
  content: string | GatewayRequestContentPart[];
  /** the memory service's summarizer executor closure — same one the anthropic + Sol arms ride */
  executeToolCall?: StreamSummaryMessageParams["executeToolCall"];
  maxToolUseRounds?: number;
  callDeadlineMs?: number;
}

/**
 * The shared gateway summarizer loop (HMEM §6.1) — one non-streaming
 * chat-completions agentic loop for every Vercel-AI-Gateway arm
 * (deepseek/kimi/minimax/zai/alibaba). Mirrors the Sol arm's posture:
 * non-streaming per round (ZDR-friendly — no server-side chaining, and the
 * gateway's zeroDataRetention flag rides every request), manual message
 * threading, tool EXECUTION via the memory service's closure.
 *
 * Each arm constructs its own instance with its provider's parts — slug
 * prefix, workup-inherited tool defs, and the malformed-args parser arrive
 * via constructor injection; the class owns only the dialect-invariant
 * round mechanics.
 */
export class GatewaySummaryLoopService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    /** gateway routing prefix, e.g. `deepseek` → `deepseek/${model}` */
    private readonly slugPrefix:
      | "deepseek"
      | "moonshotai"
      | "minimax"
      | "zai"
      | "alibaba",
    /** the fleet function-tool defs from the arm's memory-free workup */
    private readonly tools: readonly GatewaySummarizerTool[],
    /** the arm's malformed-args recovery parser (workup-inherited) */
    private readonly parseToolArguments: (rawArguments: string) => unknown
  ) {}

  public async streamSummaryMessage<TModel extends AllModelsUnion>(
    params: GatewaySummaryMessageParams<TModel>
  ) {
    const slug = `${this.slugPrefix}/${params.model}` as const;
    if (!this.apiKey) {
      throw new Error(`gateway summarizer arm ${slug} has no api key`);
    }
    const { executeToolCall } = params;
    const maxToolUseRounds = params.maxToolUseRounds ?? 0;
    const callDeadlineMs = params.callDeadlineMs ?? 900_000;

    const messages = Array.of<GatewayRequestMessage>(
      { role: "system", content: params.system },
      { role: "user", content: params.content }
    );

    const toolUse = Array.of<SummarizerToolCallRecord>();
    const reasoningParts = Array.of<string>();
    const usage = Array.of<GatewayCompletionsUsage>();
    let reasoningDuration = 0;

    for (let round = 0; round <= maxToolUseRounds; round++) {
      // wave forward-progress depends on every job settling — a stalled
      // request aborts into the caller's ERROR/retry path, never lives forever
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), callDeadlineMs);
      let data: GatewayCompletionsResponse;
      const roundStartedAt = performance.now();
      try {
        const res = await fetch(this.baseUrl, {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: slug,
            messages,
            stream: false,
            ...(params.maxOutputTokens != null
              ? { max_tokens: params.maxOutputTokens }
              : {}),
            ...(executeToolCall && this.tools.length > 0
              ? { tools: this.tools, tool_choice: "auto" as const }
              : {}),
            providerOptions: {
              gateway: {
                zeroDataRetention: true
              }
            }
          })
        });
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(
            `gateway summarizer ${slug} error (${res.status}, ${res.statusText}): ${errorText.slice(0, 600)}`
          );
        }
        data = await res.json<GatewayCompletionsResponse>();
      } finally {
        clearTimeout(deadline);
      }
      reasoningDuration += Math.round(performance.now() - roundStartedAt);
      if (data.usage) {
        usage.push(data.usage);
      }

      const message = data.choices?.[0]?.message;
      if (!message) {
        throw new Error(`gateway summarizer ${slug} returned no choices`);
      }
      // arms run uncapped — if a provider applies its own small default when
      // max_tokens is omitted, this is the receipt that exposes it
      if (data.choices?.[0]?.finish_reason === "length") {
        this.logger.warn(
          { slug, round },
          "gateway summarizer output truncated by provider ceiling (finish_reason=length)"
        );
      }

      const reasoning = message.reasoning_content ?? message.reasoning;
      if (reasoning && reasoning.length > 0) {
        reasoningParts.push(reasoning);
      }

      const functionCalls = message.tool_calls ?? [];
      const canContinue =
        functionCalls.length > 0 &&
        executeToolCall != null &&
        round < maxToolUseRounds;

      if (!canContinue) {
        if (functionCalls.length > 0) {
          this.logger.warn(
            { slug, round, dropped: functionCalls.length },
            "gateway summarizer terminal round dropped unexecuted tool calls"
          );
        }
        return {
          text: message.content ?? "",
          reasoningText:
            reasoningParts.length > 0 ? reasoningParts.join("\n\n") : null,
          reasoningDuration,
          toolUse,
          usage
        } as const;
      }

      // thread the assistant turn (with its tool_calls) then one tool message
      // per call — the chat-completions continuation shape all five speak
      messages.push({
        role: "assistant",
        content: message.content,
        tool_calls: functionCalls
      });
      for (const call of functionCalls) {
        const name = call.function.name;
        try {
          const parsed = this.parseToolArguments(call.function.arguments);
          const output = await executeToolCall(name, parsed);
          toolUse.push({ round, name, input: parsed, output, isError: false });
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: output
          });
        } catch (err) {
          const failure = err instanceof Error ? err.message : String(err);
          toolUse.push({
            round,
            name,
            input: call.function.arguments,
            output: failure,
            isError: true
          });
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: `${name} error: ${failure}`
          });
        }
      }
    }

    throw new Error(
      `unreachable: gateway summarizer ${slug} loop exited without a terminal response`
    );
  }
}
