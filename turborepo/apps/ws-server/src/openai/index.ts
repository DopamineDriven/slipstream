import { OpenAI } from "openai";


export class OpenAIService {
  private defaultClient: OpenAI;
  private defaultGrokClient: OpenAI;

  constructor(
    private apiKey: string,
    private grokApiKey: string
  ) {
    this.defaultClient = new OpenAI({ apiKey: this.apiKey });
    this.defaultGrokClient = this.defaultClient.withOptions({
      apiKey: this.grokApiKey,
      baseURL: "https://api.x.ai/v1"
    });
  }

  public getClient(overrideKey?: string) {
    const client = this.defaultClient;
    if (overrideKey) {
      return client.withOptions({ apiKey: overrideKey });
    }

    return client;
  }

  public getGrokClient(overrideKey?: string) {
    const client = this.defaultGrokClient;
    if (overrideKey) {
      return client.withOptions({
        apiKey: overrideKey
      });
    }
    return this.defaultGrokClient;
  }
}
