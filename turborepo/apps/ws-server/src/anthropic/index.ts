import { Anthropic } from "@anthropic-ai/sdk";
import type { AnthropicModelIdUnion } from "@t3-chat-clone/types";

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

  public get outputTokensByModel() {
    return {
      "claude-3-haiku-20240307": 4096,
      "claude-3-5-haiku-20241022": 8192,
      "claude-3-5-sonnet-20240620": 8192,
      "claude-3-5-sonnet-20241022": 8192,
      "claude-opus-4-20250514": 32000,
      "claude-sonnet-4-20250514": 64000,
      "claude-3-7-sonnet-20250219": 64000
    } as const satisfies Record<
      AnthropicModelIdUnion,
      4096 | 8192 | 32000 | 64000
    >;
  }

  public getMaxTokens = <const T extends AnthropicModelIdUnion>(model: T) => {
    return this.outputTokensByModel[model];
  };
}
