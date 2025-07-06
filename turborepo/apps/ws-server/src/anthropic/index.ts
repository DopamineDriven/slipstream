import { Credentials } from "@t3-chat-clone/credentials";
import { Anthropic } from "@anthropic-ai/sdk";
import type { AnthropicChatModels } from "@/types/index.ts";

export class AnthropicService {
  private defaultClient: Anthropic | null = null;
  private defaultApiKey: string | null = null;

  constructor(private cred: Credentials) {}

  private async initDefault(): Promise<Anthropic> {
    if (this.defaultClient && this.defaultApiKey) {
      return this.defaultClient;
    }

    const apiKey = await this.cred.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      throw new Error("Missing ANTHROPIC_API_KEY in credentials");
    }
    this.defaultApiKey = apiKey;
    this.defaultClient = new Anthropic({ apiKey });
    return this.defaultClient;
  }

  public async getClient(overrideKey?: string) {
    if (overrideKey) {
      return new Anthropic({ apiKey: overrideKey });
    }
    return await this.initDefault();
  }
  /**
   * anthropic requires `max_tokens` to be defined and the ceiling for `max_tokens` varies by model
   * @url https://docs.anthropic.com/en/docs/about-claude/models/overview#model-comparison-table
   */
  public maxOutputTokens = (model: AnthropicChatModels) => {
    switch (model) {
      case "claude-3-haiku-20240307":
      case "claude-3-opus-20240229":
      case "claude-3-opus-latest":
        return 4096;
      case "claude-3-5-haiku-20241022":
      case "claude-3-5-haiku-latest":
      case "claude-3-5-sonnet-20240620":
      case "claude-3-5-sonnet-latest":
      case "claude-3-5-sonnet-20241022":
        return 8192;
      case "claude-opus-4-20250514":
      case "claude-opus-4-0":
        return 32000;
      case "claude-sonnet-4-20250514":
      case "claude-sonnet-4-0":
      case "claude-3-7-sonnet-latest":
      case "claude-3-7-sonnet-20250219":
        return 64000;
      default:
        return 4096;
    }
  };
}
