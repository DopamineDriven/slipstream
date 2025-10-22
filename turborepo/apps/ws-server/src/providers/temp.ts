import type {
  ProviderDependencies,
  ServiceFromProvider
} from "@/mixins/index.ts";
import {
  AnthropicMixin,
  GeminiMixin,
  GrokMixin,
  MetaMixin,
  OpenAIMixin,
  ProviderBaseMixin,
  VercelMixin
} from "@/mixins/index.ts";
import type { Provider } from "@slipstream/types";

export interface ProviderMap {
  anthropic: import("@/anthropic/index.ts").AnthropicService;
  gemini: import("@/gemini/index.ts").GeminiService;
  openai: import("@/openai/index.ts").OpenAIService;
  meta: import("@/meta/index.ts").LlamaService;
  vercel: import("@/vercel/index.ts").v0Service;
  grok: import("@/xai/index.ts").xAIService;
}

export type ProviderNarrowing<
  T extends "anthropic" | "gemini" | "openai" | "meta" | "vercel" | "grok" =
    | "anthropic"
    | "gemini"
    | "openai"
    | "meta"
    | "vercel"
    | "grok"
> = {
  [V in T]: ProviderMap[V];
}[T];

export interface ProviderEntryStrict<V extends Provider> {
  provider: V;
  instance?:
    | ProviderNarrowing<"anthropic">
    | ProviderNarrowing<"gemini">
    | ProviderNarrowing<"grok">
    | ProviderNarrowing<"meta">
    | ProviderNarrowing<"openai">
    | ProviderNarrowing<"vercel">;
  hasProviderApiKeySet: boolean;
  available: boolean;
  initialized: boolean;
  lastAccessed?: number;
  initTime?: number;
}

export interface ProviderOptsStrict extends ProviderMap {
  dependencies?: ProviderDependencies;
  apiKeys?: {
    anthropic?: string;
    gemini?: string;
    openai?: string;
    meta?: string;
    vercel?: string;
    grok?: string;
  };
}

export type UnionToExactlyOne<U> = U extends U ? readonly [U] : never;

export type SingleProviders = UnionToExactlyOne<Provider>;
type SingleProvider<P extends Provider> = readonly [P];
export type ProviderProps<P extends Provider> = {
  [K in P]: ServiceFromProvider<K> | undefined;
}[P];

class _TupleProviderStore<P extends Provider = Provider> {
  #store = new Map<P, ProviderEntryStrict<P>>();

  set(provider: SingleProvider<P>, entry: ProviderEntryStrict<P>): this {
    const [p] = provider;
    this.#store.set(p, entry satisfies ProviderEntryStrict<Provider>);
    return this;
  }

  get(provider: SingleProvider<P>): ProviderEntryStrict<P> | undefined {
    const [p] = provider;
    return this.#store.get(p) satisfies ProviderEntryStrict<P> | undefined;
  }

  getInstance(provider: SingleProvider<P>) {
    const entry = this.get(provider);
    return entry?.instance;
  }
}
export class ProviderStoreTemp<P extends Provider = Provider> {
  #store = new Map<Provider, ProviderEntryStrict<Provider>>();

  set(provider: Provider, entry: ProviderEntryStrict<Provider>) {
    this.#store.set(provider, entry);
    return this;
  }

  get(provider: Provider) {
    return this.#store.get(provider) satisfies
      | ProviderEntryStrict<Provider>
      | undefined;
  }

  getInstance(provider: P) {
    return this.get(provider)?.instance;
  }

  initializeProvider(
    provider: Provider,
    instance: ProviderEntryStrict<Provider>["instance"],
    hasProviderApiKeySet = false
  ) {
    const now = performance.now();
    const entry = {
      provider,
      instance,
      hasProviderApiKeySet,
      available: true,
      initialized: true,
      lastAccessed: now,
      initTime: now
    };
    return this.set(provider, entry);
  }
}

class ProviderServiceBase {
  public readonly providers = [
    "anthropic",
    "gemini",
    "grok",
    "meta",
    "openai",
    "vercel"
  ] as const;

  constructor(protected opts?: ProviderOptsStrict) {}
}

export class ProviderServiceTemp extends VercelMixin(
  MetaMixin(
    OpenAIMixin(
      GrokMixin(
        GeminiMixin(AnthropicMixin(ProviderBaseMixin(ProviderServiceBase)))
      )
    )
  )
) {
  #store = new ProviderStoreTemp<Provider>();
  readonly #getters = {
    anthropic: () => this.anthropic,
    gemini: () => this.gemini,
    grok: () => this.grok,
    meta: () => this.meta,
    openai: () => this.openai,
    vercel: () => this.vercel
  } as const;
  constructor(opts?: ProviderOptsStrict) {
    super(opts);
    this.#initializeStore(opts);
  }
  #initializeStore(opts?: ProviderOptsStrict) {
    for (const provider of this.providers) {
      this.#store.set(provider, {
        provider,
        instance: this[provider],
        hasProviderApiKeySet: !!opts?.apiKeys?.[provider],
        available: true,
        initialized: !!opts?.[provider]
      });
    }
  }

  set(provider: Provider, entry: ProviderEntryStrict<Provider>) {
    this.#store.set(provider, entry);
    return this;
  }

  get(provider: Provider) {
    return this.#store.get(provider);
  }

  getInstance<const T extends Provider>(provider: T) {
    // Try to get from store first
    const cached = this.#store.getInstance(provider);
    if (cached) {
      return cached;
    }

    // Lazy initialization using the getter registry

    const getter = this.#getters[provider];
    if (!getter) {
      throw new Error(`Provider "${provider}" is not supported`);
    }

    const instance = getter();

    // Update store with the newly initialized instance
    this.#store.initializeProvider(provider, instance, false);

    return instance;
  }

  /**
   * Get a required instance (throws if not available)
   */
  getRequiredInstance(provider: Provider) {
    const instance = this.getInstance(provider);
    if (!instance) {
      throw new Error(
        `Provider "${provider}" is not initialized and no factory/shared instance is set.`
      );
    }
    return instance;
  }

  /**
   * Initialize a provider with a specific instance
   */
  initializeProvider(
    provider: Provider,
    instance: ProviderEntryStrict<Provider>["instance"],
    hasProviderApiKeySet = false
  ) {
    if (typeof instance !== "undefined")
      this.#store.initializeProvider(provider, instance, hasProviderApiKeySet);
  }

  /**
   * Check if a provider is available
   */
  isAvailable(provider: Provider) {
    const entry = this.get(provider);

    return !!(
      entry?.available &&
      (entry.initialized || provider in this.#getters)
    );
  }

  /**
   * Get all initialized providers
   */

  /**
   * Update last accessed time for a provider
   */
  touchProvider(provider: Provider) {
    const entry = this.get(provider);
    if (entry) {
      entry.lastAccessed = performance.now();
    }
  }
}
