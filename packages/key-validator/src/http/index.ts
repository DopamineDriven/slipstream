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
  private llama_url = "https://api.meta.ai/v1/models";
  private v0_url = "https://ai-gateway.vercel.sh/v1/models";
  private kimi_url = "https://ai-gateway.vercel.sh/v1/models";
  private deepseek_url = "https://ai-gateway.vercel.sh/v1/models";
  private zai_url = "https://ai-gateway.vercel.sh/v1/models";
  private alibaba_url = "https://ai-gateway.vercel.sh/v1/models";
  private minimax_url = "https://ai-gateway.vercel.sh/v1/models";
  private mistral_url = "https://api.mistral.ai/v1/models";
  private cohere_url = "https://api.cohere.com/v1/models";
  private sakana_url = "https://api.sakana.ai/v1/models";
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
      case "COHERE":
      case "cohere":
      case "GROK":
      case "grok":
      case "META":
      case "MISTRAL":
      case "mistral":
      case "meta":
      case "moonshotai":
      case "MOONSHOTAI":
      case "DEEPSEEK":
      case "deepseek":
      case "ZAI":
      case "zai":
      case "SAKANA":
      case "sakana":
      case "OPENAI":
      case "openai":
      case "VERCEL":
      case "vercel":
      case "ALIBABA":
      case "alibaba":
      case "MINIMAX":
      case "minimax":
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

  private async zai() {
    const res = await this.callRest(this.apiKey, this.zai_url);
    const provider = "zai";
    if (res.ok) {
      return {
        isValid: true,
        message: `valid_api_key__${provider}__${res.status}`
      };
    } else if (res.status === 429) {
      return {
        isValid: true,
        message: `valid_api_key__${provider}__${res.status}`
      };
    } else {
      return {
        isValid: false,
        message: `invalid_api_key__${provider}__${res.status}`
      };
    }
  }

  private async sakana() {
    const res = await this.callRest(this.apiKey, this.sakana_url);
    const provider = "sakana";
    if (res.ok) {
      return {
        isValid: true,
        message: `valid_api_key__${provider}__${res.status}`
      };
    } else if (res.status === 429) {
      return {
        isValid: true,
        message: `valid_api_key__${provider}__${res.status}`
      };
    } else {
      return {
        isValid: false,
        message: `invalid_api_key__${provider}__${res.status}`
      };
    }
  }

  private async alibaba() {
    const res = await this.callRest(this.apiKey, this.alibaba_url);
    const provider = "alibaba";
    if (res.ok) {
      return {
        isValid: true,
        message: `valid_api_key__${provider}__${res.status}`
      };
    } else if (res.status === 429) {
      return {
        isValid: true,
        message: `valid_api_key__${provider}__${res.status}`
      };
    } else {
      return {
        isValid: false,
        message: `invalid_api_key__${provider}__${res.status}`
      };
    }
  }

  private async minimax() {
    const res = await this.callRest(this.apiKey, this.minimax_url);
    const provider = "minimax";
    if (res.ok) {
      return {
        isValid: true,
        message: `valid_api_key__${provider}__${res.status}`
      };
    } else if (res.status === 429) {
      return {
        isValid: true,
        message: `valid_api_key__${provider}__${res.status}`
      };
    } else {
      return {
        isValid: false,
        message: `invalid_api_key__${provider}__${res.status}`
      };
    }
  }
  private async deepseek() {
    const res = await this.callRest(this.apiKey, this.deepseek_url);
    const provider = "deepseek";
    if (res.ok) {
      return {
        isValid: true,
        message: `valid_api_key__${provider}__${res.status}`
      };
    } else if (res.status === 429) {
      return {
        isValid: true,
        message: `valid_api_key__${provider}__${res.status}`
      };
    } else {
      return {
        isValid: false,
        message: `invalid_api_key__${provider}__${res.status}`
      };
    }
  }

  private async moonshotai() {
    const res = await this.callRest(this.apiKey, this.kimi_url);
    const provider = "moonshotai";
    if (res.ok) {
      return {
        isValid: true,
        message: `valid_api_key__${provider}__${res.status}`
      };
    } else if (res.status === 429) {
      return {
        isValid: true,
        message: `valid_api_key__${provider}__${res.status}`
      };
    } else {
      return {
        isValid: false,
        message: `invalid_api_key__${provider}__${res.status}`
      };
    }
  }

  private async mistral() {
    const res = await this.callRest(this.apiKey, this.mistral_url);
    if (res.ok) {
      return {
        isValid: true,
        message: `valid_api_key__mistral__${res.status}`
      };
    } else if (res.status === 429) {
      return {
        isValid: true,
        message: `valid_api_key__mistral__${res.status}`
      };
    } else {
      return {
        isValid: false,
        message: `invalid_api_key__mistral__${res.status}`
      };
    }
  }

  private async cohere() {
    const res = await this.callRest(this.apiKey, this.cohere_url);
    if (res.ok) {
      return {
        isValid: true,
        message: `valid_api_key__cohere__${res.status}`
      };
    } else if (res.status === 429) {
      return {
        isValid: true,
        message: `valid_api_key__cohere__${res.status}`
      };
    } else {
      return {
        isValid: false,
        message: `invalid_api_key__cohere__${res.status}`
      };
    }
  }
  private async meta() {
    // the old public-preview API 500'd on GET /models, so this used to
    // regex-match the legacy "LLM|<digits>|" key format offline. The
    // post-sunset api.meta.ai serves /models properly (and the new account
    // keys are "LLM_..." — the pipe regex rejected every one of them), so
    // meta validates over the network like every other provider.
    const res = await this.callRest(this.apiKey, this.llama_url);
    if (res.ok) {
      return {
        isValid: true,
        message: `valid_api_key__meta__${res.status}`
      };
    } else if (res.status === 429) {
      return {
        isValid: true,
        message: `valid_api_key__meta__${res.status}`
      };
    } else {
      return {
        isValid: false,
        message: `invalid_api_key__meta__${res.status}`
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
        return await this.meta();
      }
      case "VERCEL":
      case "vercel": {
        return await this.v0();
      }
      case "MISTRAL":
      case "mistral": {
        return await this.mistral();
      }
      case "COHERE":
      case "cohere": {
        return await this.cohere();
      }
      case "DEEPSEEK":
      case "deepseek": {
        return await this.deepseek();
      }
      case "MOONSHOTAI":
      case "moonshotai": {
        return await this.moonshotai();
      }
      case "ZAI":
      case "zai": {
        return await this.zai();
      }
      case "alibaba":
      case "ALIBABA": {
        return await this.alibaba();
      }
      case "MINIMAX":
      case "minimax": {
        return await this.minimax();
      }
      case "SAKANA":
      case "sakana": {
        return await this.sakana();
      }
      case "GROK":
      case "grok":
      default: {
        return await this.grok();
      }
    }
  }
}
