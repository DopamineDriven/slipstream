import type { Message } from "@/generated/client/client.ts";
import type {
  MessageParam,
  TextBlockParam
} from "@anthropic-ai/sdk/resources/messages";
import { Anthropic } from "@anthropic-ai/sdk";
import type { AllModelsUnion, GrokModelIdUnion } from "@t3-chat-clone/types";

export class xAIService {
  private defaultClient: Anthropic;

  constructor(private apiKey: string) {
    this.defaultClient = new Anthropic({
      apiKey: this.apiKey,
      baseURL: "https://api.x.ai",
      defaultHeaders: {
        Authorization: `Bearer ${this.apiKey}`
      }
    });
  }

  public xAIClient(overrideKey?: string) {
    const client = this.defaultClient;
    if (overrideKey) {
      return client.withOptions({
        apiKey: overrideKey,
        defaultHeaders: {
          Authorization: `Bearer ${overrideKey}`
        }
      });
    }
    return client;
  }

  private get outputTokensByModel() {
    return {
      "grok-4-0709": 256000,
      "grok-2-image-1212": 32768,
      "grok-2-vision-1212": 32768,
      "grok-3-mini": 131072,
      "grok-3": 131072,
      "grok-3-fast": 131072,
      "grok-3-mini-fast": 131072
    } as const satisfies Record<GrokModelIdUnion, 256000 | 131072 | 32768>;
  }

  private getMaxTokens = <const T extends GrokModelIdUnion>(model: T) => {
    return this.outputTokensByModel[model];
  };

  public xAiFormatHistory(
    isNewChat: boolean,
    msgs: Message[],
    userPrompt: string,
    systemPrompt?: string
  ) {
    if (!isNewChat) {
      const messages = msgs.map(msg => {
        if (msg.senderType === "USER") {
          return { role: "user", content: msg.content } as const;
        } else {
          const provider = msg.provider.toLowerCase();
          const model = msg.model ?? "";
          const tag = `[${provider}/${model}]`;
          return {
            role: "assistant",
            content: `${tag}\n\n${msg.content}`
          } as const;
        }
      }) satisfies MessageParam[];

      const enhancedSystemPrompt = systemPrompt
        ? `${systemPrompt}\n\nNote: Previous responses may be tagged with their source model in [PROVIDER/MODEL] notation for context.`
        : "Previous responses in this conversation may be tagged with their source model in [PROVIDER/MODEL] notation for context.";

      return {
        messages,
        system: [
          { type: "text", text: enhancedSystemPrompt }
        ] as const satisfies TextBlockParam[]
      };
    } else {
      const messages = [
        { role: "user", content: userPrompt }
      ] as const satisfies MessageParam[];
      if (systemPrompt) {
        return {
          messages,
          system: [
            { type: "text", text: systemPrompt }
          ] as const satisfies TextBlockParam[]
        };
      } else {
        return {
          messages,
          system: undefined
        };
      }
    }
  }

  private handleMaxTokens(mod: AllModelsUnion, max_tokens?: number) {
    const model = mod as GrokModelIdUnion;
    if (max_tokens && max_tokens <= this.getMaxTokens(model)) {
      return max_tokens;
    } else {
      return this.getMaxTokens(model);
    }
  }

  private handleThinking(mod: AllModelsUnion, max_tokens?: number) {
    const model = mod as GrokModelIdUnion;
    if (
      this.handleMaxTokens(mod, max_tokens) >= 1024 &&
      model !== "grok-2-image-1212" &&
      model !== "grok-3" &&
      model !== "grok-3-fast" &&
      model !== "grok-2-vision-1212"
    ) {
      return {
        type: "enabled",
        budget_tokens: this.getMaxTokens(model) - 1024
      } as const;
    } else {
      return { type: "disabled" } as const;
    }
  }

  public handleMaxTokensAndThinking(mod: AllModelsUnion, max_tokens?: number) {
    return {
      thinking: this.handleThinking(mod, max_tokens),
      max_tokens: this.handleMaxTokens(mod, max_tokens)
    };
  }
}
