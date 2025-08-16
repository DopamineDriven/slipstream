import type { Message } from "@/generated/client/client.ts";
import type { ResponseInput } from "openai/resources/responses/responses.mjs";
import { OpenAI } from "openai";

export class OpenAIService {
  private defaultClient: OpenAI;

  constructor(private apiKey: string) {
    this.defaultClient = new OpenAI({ apiKey: this.apiKey });
  }

  public getClient(overrideKey?: string) {
    const client = this.defaultClient;
    if (overrideKey) {
      return client.withOptions({ apiKey: overrideKey });
    }

    return client;
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
          content: `${modelIdentifier} \n` + msg.content
        } as const;
      }
    }) satisfies ResponseInput;
  }

  public buildInstructions(systemPrompt?: string) {
    return systemPrompt
      ? `${systemPrompt}\n\nNote: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.`
      : "Previous responses in this conversation may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";
  }

  private formatMsgs(
    msgs: (
      | {
          readonly role: "user";
          readonly content: string;
        }
      | {
          readonly role: "assistant";
          readonly content: string;
        }
    )[]
  ) {
    return [...msgs] as const satisfies ResponseInput;
  }

  public formatOpenAi(isNewChat: boolean, msgs: Message[], userPrompt: string) {
    if (isNewChat) {
      return [
        { role: "user", content: userPrompt }
      ] as const satisfies ResponseInput;
    } else {
      return this.formatMsgs(
        this.prependProviderModelTag(msgs)
      ) satisfies ResponseInput;
    }
  }
}
