import { AnthropicService } from "@/anthropic/index.ts";
import { ExtractService } from "@/extract/index.ts";
import { GeminiService } from "@/gemini/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { LlamaService } from "@/meta/index.ts";
import { OpenAIService } from "@/openai/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { v0Service } from "@/vercel/index.ts";
import { xAIService } from "@/xai/index.ts";
import type { Provider, Rm } from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";

export interface ProviderEntry<V extends Provider> {
  provider: V;
  instance?: Rm<ProviderOpts, "apiKeys" | "dependencies">[V];
  hasProviderApiKeySet: boolean;
  available: boolean;
  initialized: boolean;
  lastAccessed?: number;
  initTime?: number;
}

export type ServiceFromProvider<P extends Provider> = Rm<
  ProviderOpts,
  "apiKeys" | "dependencies"
>[P];

export type Constructor<T = object> = new (...args: any[]) => T;

/**
 * Shared dependencies for all provider services
 */
export interface ProviderDependencies {
  logger: LoggerService;
  prisma: PrismaService;
  redis: EnhancedRedisPubSub;
  extract: ExtractService;
}
export type ProviderFactory<T> = (
  deps: ProviderDependencies,
  apiKey?: string
) => T;

export interface ProviderOpts {
  anthropic?: AnthropicService;
  gemini?: GeminiService;
  openai?: OpenAIService;
  meta?: LlamaService;
  vercel?: v0Service;
  grok?: xAIService;
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
export function ProviderBaseMixin<TBase extends Constructor>(Base: TBase) {
  return class ProviderBase extends Base {
    static sharedDependencies?: ProviderDependencies;
    dependencies?: ProviderDependencies;

    constructor(...args: any[]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      super(...args);
      const maybeOpts = args[0] as ProviderOpts | undefined;
      this.dependencies =
        maybeOpts?.dependencies ??
        (this.constructor as typeof ProviderBase).sharedDependencies;
    }

    /**
     * Set shared dependencies for all provider instances
     * Call this once during application bootstrap
     */
    static setSharedDependencies(deps: ProviderDependencies) {
      this.sharedDependencies = deps;
    }

    /**
     * Get dependencies for creating providers
     */
    public getDependencies() {
      return (
        this.dependencies ??
        (this.constructor as typeof ProviderBase).sharedDependencies
      );
    }
  };
}

export function AnthropicMixin<TBase extends Constructor>(Base: TBase) {
  return class AnthropicServiceMixin extends Base {
    #anthropic?: AnthropicService;
    #anthropicApiKey?: string;
    static sharedAnthropic?: AnthropicService;
    static anthropicFactory?: ProviderFactory<AnthropicService>;
    constructor(...args: any[]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      super(...args);

      const maybeOpts = args?.[0] as ProviderOpts | undefined;
      if (maybeOpts?.anthropic) {
        this.#anthropic = maybeOpts.anthropic;
      }
      this.#anthropicApiKey = maybeOpts?.apiKeys?.anthropic;
    }
    public get anthropic(): AnthropicService {
      if (!this.#anthropic) {
        const shared = (this.constructor as typeof AnthropicServiceMixin)
          .sharedAnthropic;
        if (shared) {
          this.#anthropic = shared;
        } else if (
          "getDependencies" in this &&
          typeof this.getDependencies === "function"
        ) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          const deps = this.getDependencies() as unknown as
            | ProviderDependencies
            | undefined;
          if (deps) {
            const factory = (this.constructor as typeof AnthropicServiceMixin)
              .anthropicFactory;
            if (factory) {
              this.#anthropic = factory(deps, this.#anthropicApiKey);
            } else {
              // Default factory
              this.#anthropic = new AnthropicService(
                deps.logger,
                deps.prisma,
                deps.redis,
                this.#anthropicApiKey ?? ""
              );
              return this.#anthropic;
            }
          }
        }
        if (!this.#anthropic) {
          throw new Error(
            "Anthropic service not initialized. Set Deps or shared instance."
          );
        }
      }
      return this.#anthropic;
    }
    /**
     * Set shared Anthropic instance for all mixins
     */
    static setSharedAnthropic(instance: AnthropicService) {
      this.sharedAnthropic = instance;
    }

    /**
     * Set factory function for creating Anthropic instances
     */
    static setAnthropicFactory(factory: ProviderFactory<AnthropicService>) {
      this.anthropicFactory = factory;
    }

    public hasAnthropic(): boolean {
      return !!(
        this.#anthropic ??
        (this.constructor as typeof AnthropicServiceMixin)?.sharedAnthropic ??
        ("getDependencies" in this && this.getDependencies)
      );
    }
  };
}

export function GeminiMixin<TBase extends Constructor>(Base: TBase) {
  return class GeminiServiceMixin extends Base {
    #gemini?: GeminiService;
    #geminiApiKey?: string;
    static sharedGemini?: GeminiService;
    static geminiFactory?: ProviderFactory<GeminiService>;
    constructor(...args: any[]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      super(...args);

      const maybeOpts = args?.[0] as ProviderOpts | undefined;
      if (maybeOpts?.gemini) {
        this.#gemini = maybeOpts.gemini;
      }
      this.#geminiApiKey = maybeOpts?.apiKeys?.gemini;
    }
    public get gemini(): GeminiService {
      if (!this.#gemini) {
        const shared = (this.constructor as typeof GeminiServiceMixin)
          .sharedGemini;
        if (shared) {
          this.#gemini = shared;
        } else if (
          "getDependencies" in this &&
          typeof this.getDependencies === "function"
        ) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          const deps = this.getDependencies() as unknown as
            | ProviderDependencies
            | undefined;
          if (deps) {
            const factory = (this.constructor as typeof GeminiServiceMixin)
              .geminiFactory;
            if (factory) {
              this.#gemini = factory(deps, this.#geminiApiKey);
            } else {
              // Default factory
              this.#gemini = new GeminiService(
                deps.logger,
                deps.prisma,
                deps.redis,
                this.#geminiApiKey ?? ""
              );
              return this.#gemini;
            }
          }
        }
        if (!this.#gemini) {
          throw new Error(
            "Gemini service not initialized. Set Deps or shared instance."
          );
        }
      }
      return this.#gemini;
    }
    /**
     * Set shared Gemini instance for all mixins
     */
    static setSharedGemini(instance: GeminiService) {
      this.sharedGemini = instance;
    }

    /**
     * Set factory function for creating Gemini instances
     */
    static setGeminiFactory(factory: ProviderFactory<GeminiService>) {
      this.geminiFactory = factory;
    }

    public hasGemini(): boolean {
      return !!(
        this.#gemini ??
        (this.constructor as typeof GeminiServiceMixin)?.setSharedGemini ??
        ("getDependencies" in this && this.getDependencies)
      );
    }
  };
}

export function OpenAIMixin<TBase extends Constructor>(Base: TBase) {
  return class OpenAIServiceMixin extends Base {
    #openai?: OpenAIService;
    #openaiApiKey?: string;
    static sharedOpenai?: OpenAIService;
    static openaiFactory?: ProviderFactory<OpenAIService>;
    constructor(...args: any[]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      super(...args);

      const maybeOpts = args?.[0] as ProviderOpts | undefined;
      if (maybeOpts?.openai) {
        this.#openai = maybeOpts.openai;
      }
      this.#openaiApiKey = maybeOpts?.apiKeys?.openai;
    }
    public get openai(): OpenAIService {
      if (!this.#openai) {
        const shared = (this.constructor as typeof OpenAIServiceMixin)
          .sharedOpenai;
        if (shared) {
          this.#openai = shared;
        } else if (
          "getDependencies" in this &&
          typeof this.getDependencies === "function"
        ) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          const deps = this.getDependencies() as unknown as
            | ProviderDependencies
            | undefined;
          if (deps) {
            const factory = (this.constructor as typeof OpenAIServiceMixin)
              .openaiFactory;
            if (factory) {
              this.#openai = factory(deps, this.#openaiApiKey);
            } else {
              // Default factory
              this.#openai = new OpenAIService(
                deps.logger,
                deps.prisma,
                deps.redis,
                this.#openaiApiKey ?? ""
              );
              return this.#openai;
            }
          }
        }
        if (!this.#openai) {
          throw new Error(
            "OpenAI service not initialized. Set Deps or shared instance."
          );
        }
      }
      return this.#openai;
    }
    /**
     * Set shared OpenAI instance for all mixins
     */
    static setSharedOpenai(instance: OpenAIService) {
      this.sharedOpenai = instance;
    }

    /**
     * Set factory function for creating OpenAI instances
     */
    static setOpenAIFactory(factory: ProviderFactory<OpenAIService>) {
      this.openaiFactory = factory;
    }

    public hasOpenAI(): boolean {
      return !!(
        this.#openai ??
        (this.constructor as typeof OpenAIServiceMixin)?.setSharedOpenai ??
        ("getDependencies" in this && this.getDependencies)
      );
    }
  };
}

export function GrokMixin<TBase extends Constructor>(Base: TBase) {
  return class GrokServiceMixin extends Base {
    #grok?: xAIService;
    #grokApiKey?: string;
    static sharedGrok?: xAIService;
    static grokFactory?: ProviderFactory<xAIService>;
    constructor(...args: any[]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      super(...args);

      const maybeOpts = args?.[0] as ProviderOpts | undefined;
      if (maybeOpts?.grok) {
        this.#grok = maybeOpts.grok;
      }
      this.#grokApiKey = maybeOpts?.apiKeys?.grok;
    }
    public get grok(): xAIService {
      if (!this.#grok) {
        const shared = (this.constructor as typeof GrokServiceMixin).sharedGrok;
        if (shared) {
          this.#grok = shared;
        } else if (
          "getDependencies" in this &&
          typeof this.getDependencies === "function"
        ) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          const deps = this.getDependencies() as unknown as
            | ProviderDependencies
            | undefined;
          if (deps) {
            const factory = (this.constructor as typeof GrokServiceMixin)
              .grokFactory;
            if (factory) {
              this.#grok = factory(deps, this.#grokApiKey);
            } else {
              // Default factory
              this.#grok = new xAIService(
                deps.prisma,
                deps.redis,
                deps.extract,
                this.#grokApiKey ?? ""
              );
              return this.#grok;
            }
          }
        }
        if (!this.#grok) {
          throw new Error(
            "xAI service not initialized. Set Deps or shared instance."
          );
        }
      }
      return this.#grok;
    }
    /**
     * Set shared Grok instance for all mixins
     */
    static setSharedGrok(instance: xAIService) {
      this.sharedGrok = instance;
    }

    /**
     * Set factory function for creating Grok instances
     */
    static setGrokFactory(factory: ProviderFactory<xAIService>) {
      this.grokFactory = factory;
    }

    public hasGrok(): boolean {
      return !!(
        this.#grok ??
        (this.constructor as typeof GrokServiceMixin)?.setSharedGrok ??
        ("getDependencies" in this && this.getDependencies)
      );
    }
  };
}

export function VercelMixin<TBase extends Constructor>(Base: TBase) {
  return class VercelServiceMixin extends Base {
    #vercel?: v0Service;
    #vercelApiKey?: string;
    static sharedVercel?: v0Service;
    static vercelFactory?: ProviderFactory<v0Service>;
    constructor(...args: any[]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      super(...args);

      const maybeOpts = args?.[0] as ProviderOpts | undefined;
      if (maybeOpts?.vercel) {
        this.#vercel = maybeOpts.vercel;
      }
      this.#vercelApiKey = maybeOpts?.apiKeys?.vercel;
    }
    public get vercel(): v0Service {
      if (!this.#vercel) {
        const shared = (this.constructor as typeof VercelServiceMixin)
          .sharedVercel;
        if (shared) {
          this.#vercel = shared;
        } else if (
          "getDependencies" in this &&
          typeof this.getDependencies === "function"
        ) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          const deps = this.getDependencies() as unknown as
            | ProviderDependencies
            | undefined;
          if (deps) {
            const factory = (this.constructor as typeof VercelServiceMixin)
              .vercelFactory;
            if (factory) {
              this.#vercel = factory(deps, this.#vercelApiKey);
            } else {
              // Default factory
              this.#vercel = new v0Service(
                deps.prisma,
                deps.redis,
                this.#vercelApiKey ?? ""
              );
              return this.#vercel;
            }
          }
        }
        if (!this.#vercel) {
          throw new Error(
            "v0 (Vercel) service not initialized. Set Deps or shared instance."
          );
        }
      }
      return this.#vercel;
    }
    /**
     * Set shared Vercel instance for all mixins
     */
    static setSharedVercel(instance: v0Service) {
      this.sharedVercel = instance;
    }

    /**
     * Set factory function for creating Vercel instances
     */
    static setVercelFactory(factory: ProviderFactory<v0Service>) {
      this.vercelFactory = factory;
    }

    public hasVercel(): boolean {
      return !!(
        this.#vercel ??
        (this.constructor as typeof VercelServiceMixin)?.setSharedVercel ??
        ("getDependencies" in this && this.getDependencies)
      );
    }
  };
}

export function MetaMixin<TBase extends Constructor>(Base: TBase) {
  return class MetaServiceMixin extends Base {
    #meta?: LlamaService;
    #metaApiKey?: string;
    static sharedMeta?: LlamaService;
    static metaFactory?: ProviderFactory<LlamaService>;
    constructor(...args: any[]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      super(...args);

      const maybeOpts = args?.[0] as ProviderOpts | undefined;
      if (maybeOpts?.meta) {
        this.#meta = maybeOpts.meta;
      }
      this.#metaApiKey = maybeOpts?.apiKeys?.meta;
    }
    public get meta(): LlamaService {
      if (!this.#meta) {
        const shared = (this.constructor as typeof MetaServiceMixin).sharedMeta;
        if (shared) {
          this.#meta = shared;
        } else if (
          "getDependencies" in this &&
          typeof this.getDependencies === "function"
        ) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          const deps = this.getDependencies() as unknown as
            | ProviderDependencies
            | undefined;
          if (deps) {
            const factory = (this.constructor as typeof MetaServiceMixin)
              .metaFactory;
            if (factory) {
              this.#meta = factory(deps, this.#metaApiKey);
            } else {
              // Default factory
              this.#meta = new LlamaService(
                deps.logger,
                deps.prisma,
                deps.redis,
                this.#metaApiKey ?? ""
              );
              return this.#meta;
            }
          }
        }
        if (!this.#meta) {
          throw new Error(
            "Llama (meta) service not initialized. Set Deps or shared instance."
          );
        }
      }
      return this.#meta;
    }
    /**
     * Set shared Meta instance for all mixins
     */
    static setSharedMeta(instance: LlamaService) {
      this.sharedMeta = instance;
    }

    /**
     * Set factory function for creating Meta instances
     */
    static setMetaFactory(factory: ProviderFactory<LlamaService>) {
      this.metaFactory = factory;
    }

    public hasMeta(): boolean {
      return !!(
        this.#meta ??
        (this.constructor as typeof MetaServiceMixin)?.setSharedMeta ??
        ("getDependencies" in this && this.getDependencies)
      );
    }
  };
}

export class TypeSafeProviderMap {
  // The Map is typed to maintain the relationship between key and value
  #map = new Map<Provider, ProviderEntry<Provider>>();

  /**
   * Type-safe setter that enforces correct service type
   */
  set<const P extends Provider>(
    provider: P,
    entry: ProviderEntry<typeof provider>
  ) {
    this.#map.set(provider, entry);
    return this;
  }

  /**
   * Type-safe getter with narrowed return type
   */
  get(provider: Provider) {
    return this.#map.get(provider) satisfies
      | ProviderEntry<typeof provider>
      | undefined;
  }

  /**
   * Get just the service instance with correct type
   */
  getInstance(
    provider: Provider
  ): ServiceFromProvider<typeof provider> | undefined {
    const entry = this.get(provider) satisfies
      | ProviderEntry<typeof provider>
      | undefined;
    return entry?.instance satisfies
      | ServiceFromProvider<typeof provider>
      | undefined;
  }

  /**
   * Type-safe initialization with perfect inference
   */
  initializeProvider<const P extends Provider>(
    provider: P,
    instance: ServiceFromProvider<typeof provider>,
    hasProviderApiKeySet = false
  ) {
    const existing = this.get(provider);
    if (existing) {
      existing.instance = instance;
      existing.initialized = true;
      existing.initTime = performance.now();
      existing.hasProviderApiKeySet = hasProviderApiKeySet;
    } else {
      this.set(provider, {
        provider,
        instance,
        hasProviderApiKeySet,
        available: true,
        initialized: true,
        lastAccessed: performance.now(),
        initTime: performance.now()
      } satisfies ProviderEntry<typeof provider>);
    }
  }
}

class ProviderServiceBase {
  public get providers() {
    return [
      "anthropic",
      "gemini",
      "grok",
      "meta",
      "openai",
      "vercel"
    ] as const satisfies Provider[];
  }
  constructor(protected opts?: ProviderOpts) {}
}

export class ProviderService extends GrokMixin(
  VercelMixin(
    MetaMixin(
      OpenAIMixin(
        GeminiMixin(AnthropicMixin(ProviderBaseMixin(ProviderServiceBase)))
      )
    )
  )
) {
  #providerMap = new Map<Provider, ProviderEntry<Provider>>();
  constructor(opts?: ProviderOpts) {
    super(opts);
    this.#initializeMap(opts);
  }

  /**
   * Type-safe setter that enforces correct service type
   */
  set<const P extends Provider>(
    provider: P,
    entry: ProviderEntry<typeof provider>
  ) {
    this.#providerMap.set(provider, entry);
    return this;
  }

  /**
   * Type-safe getter with narrowed return type
   */
  get(provider: Provider) {
    return this.#providerMap.get(provider) satisfies
      | ProviderEntry<typeof provider>
      | undefined;
  }

  /**
   * Get just the service instance with correct type
   */
  getInstance(
    provider: Provider
  ): ServiceFromProvider<typeof provider> | undefined {
    const entry = this.get(provider) satisfies
      | ProviderEntry<typeof provider>
      | undefined;
    return entry?.instance satisfies
      | ServiceFromProvider<typeof provider>
      | undefined;
  }

  /**
   * Type-safe initialization with perfect inference
   */
  initializeProvider<const P extends Provider>(
    provider: P,
    instance: ServiceFromProvider<typeof provider>,
    hasProviderApiKeySet = false
  ) {
    const existing = this.get(provider);
    if (existing) {
      existing.instance = instance;
      existing.initialized = true;
      existing.initTime = performance.now();
      existing.hasProviderApiKeySet = hasProviderApiKeySet;
    } else {
      this.set(provider, {
        provider,
        instance,
        hasProviderApiKeySet,
        available: true,
        initialized: true,
        lastAccessed: performance.now(),
        initTime: performance.now()
      } satisfies ProviderEntry<typeof provider>);
    }
  }
  #initializeMap(opts?: ProviderOpts) {
    // Beautiful type inference - each provider gets its exact service type!

    for (const provider of this.providers) {
      this.#providerMap.set(provider, {
        provider,
        instance: opts?.[provider], // Type-safe! TS knows this is the right service
        hasProviderApiKeySet: !!opts?.apiKeys?.[provider],
        available: true,
        initialized: !!opts?.[provider],
        lastAccessed: undefined,
        initTime: undefined
      });
    }
  }
  // #checkAvailability(provider: Provider): boolean {
  //   const Constructor = this.getDependencies();
  //   const hasSharedDeps = !!Constructor.sharedDependencies;
  //   const hasSharedInstance = !!(Constructor as any)[
  //     `shared${this.#capitalize(provider)}`
  //   ];


  //   return hasSharedDeps || hasSharedInstance || hasApiKey;
  // }

  // #capitalize(str: Provider): Capitalize<typeof str> {
  //   return str
  //     .substring(0, 1)
  //     .toUpperCase()
  //     .concat(str.substring(1)) as Capitalize<typeof str>;
  // }
}
