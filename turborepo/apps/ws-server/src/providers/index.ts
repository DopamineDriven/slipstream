import type {
  ProviderEntry,
  ProviderNarrowing,
  ProviderOpts,
  ServiceFromProvider
} from "@/mixins/index.ts";
import {
  AnthropicMixin,
  GeminiMixin,
  GrokMixin,
  MetaMixin,
  MistralMixin,
  OpenAIMixin,
  ProviderBaseMixin,
  VercelMixin
} from "@/mixins/index.ts";
import type { Provider } from "@slipstream/types";

export type ProviderProps<P extends Provider> = {
  [K in P]: ServiceFromProvider<K> | undefined;
}[P];

export class ProviderStore<M extends Provider = Provider> {
  #store = {} as { [K in M]?: ProviderEntry<K> };

  set(provider: M, entry: ProviderEntry<M>) {
    if (typeof this.#store?.[provider] !== "undefined")
      this.#store[provider] = entry;
    return this;
  }

  get(provider: M) {
    return this.#store[provider];
  }

  getInstance(provider: M) {
    return this.#store[provider]?.instance;
  }

  initializeProvider<const P extends M>(
    provider: P,
    instance: ServiceFromProvider<typeof provider>,
    hasProviderApiKeySet = false
  ) {
    const now = performance.now();

    const existing = this.get(provider);
    if (existing) {
      Object.assign(existing, {
        instance,
        initialized: true,
        initTime: now,
        hasProviderApiKeySet
      });
      return this;
    } else {
      this.set(provider, {
        provider,
        instance,
        hasProviderApiKeySet,
        available: true,
        initialized: true,
        lastAccessed: now,
        initTime: now
      } satisfies ProviderEntry<typeof provider>);
      return this;
    }
  }
}

class ProviderServiceBase {
  public readonly providers = [
    "anthropic",
    "mistral",
    "gemini",
    "grok",
    "meta",
    "openai",
    "vercel"
  ] as const satisfies Provider[];

  constructor(protected opts?: ProviderOpts) {}
}

export class ProviderService extends MistralMixin(
  VercelMixin(
    MetaMixin(
      OpenAIMixin(
        GeminiMixin(
          GrokMixin(AnthropicMixin(ProviderBaseMixin(ProviderServiceBase)))
        )
      )
    )
  )
) {
  #store = new ProviderStore();

  constructor(opts?: ProviderOpts) {
    super(opts);
    this.#initializeStore(opts);
  }
  #initializeStore(opts?: ProviderOpts) {
    for (const p of this.providers) {
      const entry = {
        provider: p,
        instance: opts?.[p],
        hasProviderApiKeySet: !!opts?.apiKeys?.[p],
        available: true,
        initialized: !!opts?.[p]
      } satisfies ProviderEntry<typeof p>;
      this.#store.set(p, entry);
    }
  }

  set<P extends Provider>(provider: P, entry: ProviderEntry<P>) {
    this.#store.set(provider, entry);
    return this;
  }

  get<P extends Provider>(provider: P) {
    return this.#store.get(provider) as ProviderEntry<P>;
  }

  getInstance<P extends Provider>(
    provider: P
  ): ProviderNarrowing<typeof provider> {
    switch (provider) {
      case "anthropic": {
        const storeCheck = this.#store.get("anthropic") as
          | ProviderEntry<"anthropic">
          | undefined;
        if (
          typeof storeCheck?.instance !== "undefined" &&
          storeCheck.available
        ) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          return storeCheck.instance satisfies ProviderProps<"anthropic">;
        }
        const direct = this.anthropic;
        this.#store.set("anthropic", {
          instance: direct,
          available: true,
          hasProviderApiKeySet: false,
          initialized: true,
          provider: "anthropic",
          initTime: performance.now(),
          lastAccessed: performance.now()
        });
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return direct;
      }
      case "gemini": {
        const storeCheck = this.#store.get("gemini") as
          | ProviderEntry<"gemini">
          | undefined;
        if (
          typeof storeCheck?.instance !== "undefined" &&
          storeCheck.available
        ) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          return storeCheck.instance;
        }
        const direct = this.gemini;
        this.#store.set("gemini", {
          instance: direct,
          available: true,
          hasProviderApiKeySet: false,
          initialized: true,
          provider: "gemini",
          initTime: performance.now(),
          lastAccessed: performance.now()
        }); // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return direct;
      }
      case "mistral": {
        const storeCheck = this.#store.get("mistral") as
          | ProviderEntry<"mistral">
          | undefined;
        if (
          typeof storeCheck?.instance !== "undefined" &&
          storeCheck.available
        ) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          return storeCheck.instance;
        }
        const direct = this.mistral;
        this.#store.set("mistral", {
          instance: direct,
          available: true,
          hasProviderApiKeySet: false,
          initialized: true,
          provider: "mistral",
          initTime: performance.now(),
          lastAccessed: performance.now()
        }); // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return direct;
      }
      case "grok": {
        const storeCheck = this.#store.get("grok") as
          | ProviderEntry<"grok">
          | undefined;
        if (
          typeof storeCheck?.instance !== "undefined" &&
          storeCheck.available
        ) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          return storeCheck.instance;
        }
        const direct = this.grok;
        this.#store.set("grok", {
          instance: direct,
          available: true,
          hasProviderApiKeySet: false,
          initialized: true,
          provider: "grok",
          initTime: performance.now(),
          lastAccessed: performance.now()
        }); // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return direct;
      }
      case "meta": {
        const storeCheck = this.#store.get("meta") as
          | ProviderEntry<"meta">
          | undefined;
        if (
          typeof storeCheck?.instance !== "undefined" &&
          storeCheck.available
        ) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          return storeCheck.instance;
        }
        const direct = this.meta;
        this.#store.set("meta", {
          instance: direct,
          available: true,
          hasProviderApiKeySet: false,
          initialized: true,
          provider: "meta",
          initTime: performance.now(),
          lastAccessed: performance.now()
        }); // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return direct;
      }
      case "openai": {
        const storeCheck = this.#store.get("openai") as
          | ProviderEntry<"openai">
          | undefined;
        if (
          typeof storeCheck?.instance !== "undefined" &&
          storeCheck.available
        ) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          return storeCheck.instance;
        }
        const direct = this.openai;
        this.#store.set("openai", {
          instance: direct,
          available: true,
          hasProviderApiKeySet: false,
          initialized: true,
          provider: "openai",
          initTime: performance.now(),
          lastAccessed: performance.now()
        }); // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return direct;
      }
      case "vercel": {
        const storeCheck = this.#store.get("vercel") as
          | ProviderEntry<"vercel">
          | undefined;
        if (
          typeof storeCheck?.instance !== "undefined" &&
          storeCheck.available
        ) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          return storeCheck.instance;
        }
        const direct = this.vercel;
        this.#store.set("vercel", {
          instance: direct,
          available: true,
          hasProviderApiKeySet: false,
          initialized: true,
          provider: "vercel",
          initTime: performance.now(),
          lastAccessed: performance.now()
        }); // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return direct;
      }
      default: {
        throw new Error(
          `Provider "${provider}" is not initialized and no factory/shared instance is set.`
        );
      }
    }
  }

  getRequiredInstance<P extends Provider>(p: P) {
    const inst = this.getInstance(p);
    if (!inst) {
      throw new Error(
        `Provider "${p}" is not initialized and no factory/shared instance is set.`
      );
    }
    return inst;
  }

  initializeProvider<P extends Provider>(
    provider: P,
    instance: ServiceFromProvider<P>,
    hasProviderApiKeySet = false
  ) {
    this.#store.initializeProvider(provider, instance, hasProviderApiKeySet);
  }
}
