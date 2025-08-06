import type { Message } from "@/generated/client/client.ts";
import type {
  MessageParam,
  TextBlockParam
} from "@anthropic-ai/sdk/resources/messages";
import { Anthropic } from "@anthropic-ai/sdk";
import type {
  AllModelsUnion,
  AnthropicModelIdUnion
} from "@t3-chat-clone/types";

export class AnthropicService {
  private defaultClient: Anthropic;

  constructor(private apiKey: string) {
    this.defaultClient = new Anthropic({ apiKey: this.apiKey });
  }

  public getClient(overrideKey?: string) {
    const client = this.defaultClient;
    if (overrideKey) {
      return client.withOptions({ apiKey: overrideKey });
    }
    return client;
  }

  private get outputTokensByModel() {
    return {
      "claude-3-haiku-20240307": 4096,
      "claude-3-5-haiku-20241022": 8192,
      "claude-3-5-sonnet-20240620": 8192,
      "claude-3-5-sonnet-20241022": 8192,
      "claude-opus-4-20250514": 32000,
      "claude-opus-4-1-20250805": 32000,
      "claude-sonnet-4-20250514": 64000,
      "claude-3-7-sonnet-20250219": 64000
    } as const satisfies Record<
      AnthropicModelIdUnion,
      4096 | 8192 | 32000 | 64000
    >;
  }

  private getMaxTokens = <const T extends AnthropicModelIdUnion>(model: T) => {
    return this.outputTokensByModel[model];
  };

  public formatAnthropicHistory(
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
          return {
            role: "assistant",
            content: `<model provider="${provider}" name="${model}">\n${msg.content}\n</model>`
          } as const;
        }
      }) satisfies MessageParam[];

      messages.push({ role: "user", content: userPrompt });

      const enhancedSystemPrompt = systemPrompt
        ? `${systemPrompt}\n\nNote: Previous responses may be tagged with their source model for context.`
        : "Previous responses in this conversation may be tagged with their source model for context.";

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
    const model = mod as AnthropicModelIdUnion;
    if (max_tokens && max_tokens <= this.getMaxTokens(model)) {
      return max_tokens;
    } else {
      return this.getMaxTokens(model);
    }
  }

  private handleThinking(mod: AllModelsUnion, max_tokens?: number) {
    const model = mod as AnthropicModelIdUnion;
    if (this.handleMaxTokens(mod, max_tokens) >= 1024) {
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
