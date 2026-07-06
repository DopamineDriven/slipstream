import type {
  StreamSummaryMessageParams,
  SummarizerToolCallRecord
} from "@/anthropic/types.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { OpenAI } from "openai";
import type { ReasoningEffort } from "openai/resources/shared.mjs";
import { OpenAIServiceWorkup } from "@/openai/workup.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { OpenAiModelIdUnion } from "@slipstream/types";

export interface OpenAIStreamSummaryParams {
  model: OpenAiModelIdUnion;
  maxOutputTokens: number;
  effort: ReasoningEffort;
  system: string;
  /** content parts for the single user turn (input_text + input_image) */
  content: OpenAI.Responses.ResponseInputMessageContentList;
  /** the memory service's summarizer executor closure — same one the anthropic arm rides */
  executeToolCall?: StreamSummaryMessageParams["executeToolCall"];
  maxToolUseRounds?: number;
  callDeadlineMs?: number;
}

/**
 * The GPT-5.5 summarizer arm (HMEM Part II §6): extends the memory-free
 * OpenAIServiceWorkup for the battle-tested call posture — client, reasoning
 * knobs, verbosity, the fleet function-tool defs, and the malformed-args
 * parsers — while tool EXECUTION arrives as a closure from the memory
 * service's private executeSummarizerToolCall, the identical path the
 * anthropic arm rides. The audition compares models, not tool plumbing.
 *
 * Non-streaming responses.create per round with store: false and manual
 * input threading (ZDR-friendly — no server-side response chaining),
 * mirroring the responses-chat continuation idiom. reasoningDuration is
 * per-round wall-clock summed (OpenAI does not itemize thinking time;
 * usage.output_tokens_details.reasoning_tokens carries the token split).
 */
export class OpenAISummarizerService extends OpenAIServiceWorkup {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStoreVector: UserStoreVectorService,
    apiKey: string,
    s3: S3Storage
  ) {
    super(logger, prisma, userStoreVector, apiKey, s3);
  }

  /** the executor closure switches on the anthropic-era canonical names */
  private canonicalToolName(wireName: string) {
    return wireName === "user_store_search" ? "file_search" : wireName;
  }

  public async streamSummaryMessage(params: OpenAIStreamSummaryParams) {
    const { executeToolCall } = params;
    const maxToolUseRounds = params.maxToolUseRounds ?? 0;
    const callDeadlineMs = params.callDeadlineMs ?? 900_000;
    const client = this.getClient();

    const tools = executeToolCall
      ? ([
          this.userStoreSearchFunctionTool(),
          this.memorySearchFunctionTool(),
          this.memoryGetChunkFunctionTool()
        ] satisfies OpenAI.Responses.Tool[])
      : ([] satisfies OpenAI.Responses.Tool[]);

    let input = Array.of<OpenAI.Responses.ResponseInputItem>({
      role: "user",
      content: params.content
    });

    const toolUse = Array.of<SummarizerToolCallRecord>();
    const reasoningParts = Array.of<string>();
    const usage = Array.of<OpenAI.Responses.ResponseUsage>();
    let reasoningDuration = 0;

    for (let round = 0; round <= maxToolUseRounds; round++) {
      // wave forward-progress depends on every job settling — a stalled
      // request aborts into the caller's ERROR/retry path, never lives forever
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), callDeadlineMs);
      let response: OpenAI.Responses.Response;
      const roundStartedAt = performance.now();
      try {
        response = await client.responses.create(
          {
            model: params.model,
            input,
            instructions: params.system,
            store: false,
            max_output_tokens: params.maxOutputTokens,
            reasoning: this.openaiReasoning(
              params.model,
              params.effort,
              "auto",
              false
            ),
            text: this.openAiVerbosity(params.model, "medium", false),
            truncation: "auto",
            ...(tools.length > 0
              ? {
                  tools,
                  tool_choice: "auto" as const,
                  parallel_tool_calls: true
                }
              : {})
          },
          { signal: controller.signal }
        );
      } finally {
        clearTimeout(deadline);
      }
      reasoningDuration += Math.round(performance.now() - roundStartedAt);
      if (response.usage) {
        usage.push(response.usage);
      }

      for (const item of response.output) {
        if (item.type === "reasoning") {
          for (const s of item.summary) {
            if (s.text.length > 0) {
              reasoningParts.push(s.text);
            }
          }
        }
      }

      const functionCalls = response.output.filter(
        item => item.type === "function_call"
      );
      const canContinue =
        functionCalls.length > 0 &&
        executeToolCall != null &&
        round < maxToolUseRounds;

      if (!canContinue) {
        return {
          text: response.output_text,
          reasoningText:
            reasoningParts.length > 0 ? reasoningParts.join("\n\n") : null,
          reasoningDuration,
          toolUse,
          usage
        } as const;
      }

      // function_call items ride back with their outputs — the proven
      // responses-chat continuation shape
      const continuation = Array.of<OpenAI.Responses.ResponseInputItem>(
        ...functionCalls
      );
      for (const call of functionCalls) {
        const name = this.canonicalToolName(call.name);
        try {
          const parsed = this.parseFileSearchArguments(call.arguments);
          const output = await executeToolCall(name, parsed);
          toolUse.push({
            round,
            name,
            input: parsed,
            output,
            isError: false
          });
          continuation.push({
            type: "function_call_output",
            call_id: call.call_id,
            output
          });
        } catch (err) {
          const failure = this.prisma.safeErrMsg(err);
          toolUse.push({
            round,
            name,
            input: call.arguments,
            output: failure,
            isError: true
          });
          continuation.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: `${name} error: ${failure}`
          });
        }
      }
      input = [...input, ...continuation];
    }

    throw new Error(
      "unreachable: summary loop exited without a terminal response"
    );
  }
}
