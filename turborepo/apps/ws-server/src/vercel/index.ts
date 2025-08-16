import type { Message } from "@/generated/client/client.ts";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import {
  createVercel,
  VercelProvider,
  VercelProviderSettings
} from "@ai-sdk/vercel";

import { createSSEParser } from "./sse.ts";

// it is compatible with the openai ChatCompletion Shape for

interface V0Chunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      content?: string;
      role?: "assistant";
    };
    finish_reason: "stop" | "length" | null;
  }[];
}
export class v0Service {
  private readonly baseUrl = "https://api.v0.dev/v1/chat/completions";
  private v: (options?: VercelProviderSettings) => VercelProvider;
  constructor(private apiKey?: string) {
    this.v = createVercel;
  }
  public getClient(userApiKey?: string) {
    if (userApiKey) {
      return this.v({ apiKey: userApiKey });
    } else return this.v({ apiKey: this.apiKey });
  }
  public async *stream(
    model: string,
    messages: readonly ChatCompletionMessageParam[],
    apiKey?: string,
    options?: {
      temperature?: number;
      top_p?: number;
      max_tokens?: number;
    }
  ) {
    const _x = options;
    const key = apiKey ?? this.apiKey;
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vercel API error (${response.status}): ${errorText}`);
    }

    const parser = createSSEParser(response);

    for await (const event of parser) {
      if (event.data === "[DONE]") {
        return; // Stream finished
      }

      try {
        const chunk = JSON.parse(event.data) as V0Chunk;
        // Return the full chunk structure that the resolver expects
        yield {
          choices: chunk.choices.map(choice => ({
            delta: { content: choice.delta.content },
            finish_reason: choice.finish_reason
          })),
          // Add usage if available (v0 might not provide this during streaming)
          usage: undefined
        };
      } catch (error) {
        console.log(error);
        console.error("Failed to parse Vercel stream chunk:", event.data);
      }
    }
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

  public v0Format(
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
