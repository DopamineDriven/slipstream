import type { Message } from "@/generated/client/client.ts";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { OpenAI } from "openai";

export class xAIService {
  private defaultClient: OpenAI;

  constructor(private apiKey: string) {
    this.defaultClient = new OpenAI({
      apiKey: this.apiKey,
      baseURL: "https://api.x.ai/v1"
    });
  }

  public xAIClient(overrideKey?: string) {
    const client = this.defaultClient;
    if (overrideKey) {
      return client.withOptions({ apiKey: overrideKey });
    }

    return client;
  }

  private sanitizeModel(model: string) {
    return model.replace(/\./g, "dot");
  }

  private prependProviderModelTag(msgs: Message[]) {
    return msgs.map(msg => {
      if (msg.senderType === "USER") {
        return { role: "user", content: msg.content } as const;
      } else {
        const provider = msg.provider.toLowerCase();
        const model = msg.model ?? "";
        const modelIdentifier = `[${provider}/${model}]`;
        return {
          role: "assistant",
          name: `${provider}_${this.sanitizeModel(model)}`,
          content: `${modelIdentifier} \n` + msg.content
        } as const;
      }
    }) satisfies ChatCompletionMessageParam[];
  }

  private formatMsgs(
    msgs: (
      | {
          readonly role: "user";
          readonly content: string;
        }
      | {
          readonly role: "assistant";
          readonly name: `${string}_${string}`;
          readonly content: string;
        }
    )[],
    systemPrompt?: string
  ) {
    const enhancedSystemPrompt = systemPrompt
      ? `${systemPrompt}\n\nNote: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.`
      : "Previous responses in this conversation may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";
    if (systemPrompt) {
      return [
        { role: "system", content: enhancedSystemPrompt } as const,
        ...msgs
      ] as const satisfies ChatCompletionMessageParam[];
    } else {
      return [
        {
          role: "system",
          content: enhancedSystemPrompt
        },
        ...msgs
      ] as const satisfies ChatCompletionMessageParam[];
    }
  }

  public xAiFormat(
    isNewChat: boolean,
    msgs: Message[],
    userPrompt: string,
    systemPrompt?: string
  ) {
    if (isNewChat) {
      if (systemPrompt) {
        return [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ] as const satisfies ChatCompletionMessageParam[];
      } else {
        return [
          { role: "user", content: userPrompt }
        ] as const satisfies ChatCompletionMessageParam[];
      }
    } else {
      return this.formatMsgs(
        this.prependProviderModelTag(msgs),
        systemPrompt
      ) satisfies ChatCompletionMessageParam[];
    }
  }
}
