import type {
  AnthropicResponse,
  FlexiProvider,
  GeminiResponse,
  GrokSuccess,
  OpenAiError,
  OpenAiResponse
} from "@/types/index.ts";

export class KeyValidator {
  private openai_url = "https://api.openai.com/v1/models";
  private grok_url = "https://api.x.ai/v1/api-key";
  private anthropic_url = "https://api.anthropic.com/v1/models";
  private gemini_url =
    "https://generativelanguage.googleapis.com/v1beta/models";
  private llama_url = "https://api.llama.com/v1/models";
  private v0_url = "https://api.v0.dev/v1/user";
  constructor(
    private apiKey: string,
    private provider: FlexiProvider
  ) {}

  private async callRest(apiKey: string, url: string) {
    switch (this.provider) {
      case "ANTHROPIC":
      case "anthropic": {
        return (await fetch(`${url}?limit=1`, {
          headers: {
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01"
          }
        })) satisfies Response;
      }
      case "GEMINI":
      case "gemini": {
        return (await fetch(`${url}?key=${apiKey}`)) satisfies Response;
      }
      default: {
        return (await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}` }
        })) satisfies Response;
      }
    }
  }

  private async openai() {
    const res = await this.callRest(this.apiKey, this.openai_url);
    const parseIt = JSON.parse(await res.text()) as OpenAiResponse;
    if (res.ok) {
      return {
        isValid: true,
        message: `valid_api_key__openai__${res.status}`
      };
    } else if (res.status === 429) {
      return { isValid: true, message: `valid_api_key__openai__${res.status}` };
    } else {
      const { error } = parseIt as OpenAiError;
      return {
        isValid: false,
        message: `invalid_api_key__openai__${res.status}__${error.code}__${error.message}__${error.type}`
      };
    }
  }
  private async v0() {
    const res = await this.callRest(this.apiKey, this.v0_url);
    if (res.ok) {
      return {
        isValid: true,
        message: `valid_api_key__vercel__${res.status}`
      };
    } else if (res.status === 429) {
      return { isValid: true, message: `valid_api_key__vercel__${res.status}` };
    } else {
      return {
        isValid: false,
        message: `invalid_api_key__vercel__${res.status}`
      };
    }
  }
  private async llama() {
    const _brokenGet = this.llama_url;
    const workaround = /^LLM\|(\d{13,19})\|/;
    const key = this.apiKey;
    if (workaround.test(key)) {
      return { isValid: true, message: `valid_api_key__meta__${200}` };
    } else {
      return {
        isValid: false,
        message: `invalid_api_key__meta__${401}`
      };
    }
  }

  private async grok() {
    const res = await this.callRest(this.apiKey, this.grok_url);
    if (res.status === 429) {
      return {
        isValid: true,
        message: `valid_api_key__grok__${res.status}__rate_limited`
      };
    }
    if (!res.ok) {
      return {
        isValid: false,
        message: `invalid_api_key__grok__${res.status}`
      };
    }
    const parseIt = JSON.parse(await res.text()) as GrokSuccess;
    if (parseIt.api_key_blocked) {
      return {
        isValid: false,
        message: `invalid_api_key__grok__${res.status}__blocked`
      };
    } else if (parseIt.api_key_disabled) {
      return {
        isValid: false,
        message: `invalid_api_key__grok__${res.status}__disabled`
      };
    } else if (parseIt.team_blocked) {
      return {
        isValid: false,
        message: `invalid_api_key__grok__${res.status}__team_blocked`
      };
    } else {
      return {
        isValid: true,
        message: `valid_api_key__grok__${res.status}`
      };
    }
  }

  private async anthropic() {
    const res = await this.callRest(this.apiKey, this.anthropic_url);
    const parseIt = JSON.parse(await res.text()) as AnthropicResponse;
    if (parseIt.type === "error") {
      if (res.status !== 429) {
        return {
          isValid: false,
          message: `invalid_api_key__anthropic__${res.status}__${parseIt.error.message}`
        };
      } else {
        return {
          isValid: true,
          message: `valid_api_key__anthropic__${res.status}__${parseIt.error.message}`
        };
      }
    } else {
      return {
        isValid: true,
        message: `valid_api_key__anthropic__${res.status}`
      };
    }
  }

  private async gemini() {
    const res = await this.callRest(this.apiKey, this.gemini_url);
    if (res.ok) {
      return {
        isValid: true,
        message: `valid_api_key__gemini__${res.status}`
      };
    } else {
      if (res.status === 429) {
        return {
          isValid: true,
          message: `valid_api_key__gemini__${res.status}__rate_limited`
        };
      }
      const parseIt = (await res.json()) as GeminiResponse;
      if (parseIt.error) {
        const { code, message, status } = parseIt.error;
        return {
          isValid: false,
          message: `invalid_api_key__gemini__${status}__${message}__${code}`
        };
      }

      return {
        isValid: false,
        message: `invalid_api_key__gemini__${res.status}__${res.statusText}`
      };
    }
  }

  public async validateProvider() {
    switch (this.provider) {
      case "OPENAI":
      case "openai": {
        return await this.openai();
      }
      case "GEMINI":
      case "gemini": {
        return await this.gemini();
      }
      case "ANTHROPIC":
      case "anthropic": {
        return await this.anthropic();
      }
      case "META":
      case "meta": {
        return await this.llama();
      }
      case "VERCEL":
      case "vercel": {
        return await this.v0();
      }
      case "GROK":
      case "grok":
      default: {
        return await this.grok();
      }
    }
  }
}
