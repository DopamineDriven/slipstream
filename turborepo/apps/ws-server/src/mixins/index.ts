import { AnthropicService } from "@/anthropic/index.ts";
import { GeminiService } from "@/gemini/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { LlamaService } from "@/meta/index.ts";
import { OpenAIService } from "@/openai/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { v0Service } from "@/vercel/index.ts";
import { xAIService } from "@/xai/index.ts";
import type { Provider } from "@slipstream/types";
import { EnhancedRedisPubSub } from "@slipstream/redis-service";
import { S3Storage } from "@slipstream/storage-s3";

export type ProviderNarrowing<P extends Provider> = P extends "openai"
  ? OpenAIService
  : P extends "grok"
    ? xAIService
    : P extends "anthropic"
      ? AnthropicService
      : P extends "gemini"
        ? GeminiService
        : P extends "vercel"
          ? v0Service
          : P extends "meta"
            ? LlamaService
            : never;

export interface ProviderMap {
  anthropic: AnthropicService;
  gemini: GeminiService;
  openai: OpenAIService;
  meta: LlamaService;
  vercel: v0Service;
  grok: xAIService;
}

export type ProviderNarrowed<T extends keyof ProviderMap> = {
  [V in T]: ProviderMap[V];
}[T];

export interface ProviderEntry<V extends Provider> {
  provider: V;
  instance?: ProviderMap[V];
  hasProviderApiKeySet: boolean;
  available: boolean;
  initialized: boolean;
  lastAccessed?: number;
  initTime?: number;
}

export type ServiceFromProvider<P extends Provider> = ProviderMap[P];

export type Constructor<A extends any[] = any[], I = object> = new (
  ...args: A
) => I;

export interface HasDependencies {
  getDependencies(): ProviderDependencies | undefined;
}

export interface HasOpts {
  readonly opts?: ProviderOpts;
}

/**
 * Shared dependencies for all provider services
 */
export interface ProviderDependencies {
  logger: LoggerService;
  prisma: PrismaService;
  redis: EnhancedRedisPubSub;
  isProd: boolean;
  s3: S3Storage;
}
export type ProviderFactory<T> = (
  deps: ProviderDependencies,
  apiKey?: string
) => T;

export interface ProviderOpts extends Partial<ProviderMap> {
  dependencies?: ProviderDependencies;
  apiKeys?: {
    anthropic?: string;
    gemini?: string;
    openai?: string;
    meta?: string;
    vercel?: string;
    grok?: string;
    grokMgmtKey?: string;
  };
}
export function ProviderBaseMixin<TBase extends Constructor>(Base: TBase) {
  return class ProviderBase extends Base implements HasDependencies, HasOpts {
    readonly opts?: ProviderOpts | undefined;
    static sharedDependencies?: ProviderDependencies;
    readonly dependencies?: ProviderDependencies;

    constructor(...args: any[]) {
      super(...(args as ConstructorParameters<TBase>));
      const maybeOpts = args[0] as ProviderOpts | undefined;
      this.opts = maybeOpts;
      this.dependencies =
        maybeOpts?.dependencies ??
        (this.constructor as typeof ProviderBase).sharedDependencies;
    }

    static setSharedDependencies(deps: ProviderDependencies) {
      this.sharedDependencies = deps;
    }

    public getDependencies() {
      return (
        this.dependencies ??
        (this.constructor as typeof ProviderBase).sharedDependencies
      );
    }
  };
}

export function AnthropicMixin<
  TBase extends Constructor<any[], HasDependencies & HasOpts>
>(Base: TBase) {
  type S = AnthropicService;
  return class AnthropicServiceMixin extends Base {
    #anthropic?: S;
    #anthropicApiKey?: string;
    static sharedAnthropic?: S;
    static anthropicFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.anthropic) this.#anthropic = opts.anthropic;

      this.#anthropicApiKey = opts?.apiKeys?.anthropic;
    }
    public get anthropic() {
      if (!this.#anthropic) {
        const shared = (this.constructor as typeof AnthropicServiceMixin)
          .sharedAnthropic;
        if (shared) {
          this.#anthropic = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "Anthropic deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }
          const factory = (this.constructor as typeof AnthropicServiceMixin)
            .anthropicFactory;
          this.#anthropic =
            factory?.(deps, this.#anthropicApiKey) ??
            new AnthropicService(
              deps.logger,
              deps.prisma,
              deps.redis,
              this.#anthropicApiKey ?? ""
            );
        }
      }
      return this.#anthropic;
    }

    static setSharedAnthropic(instance: S) {
      this.sharedAnthropic = instance;
    }

    static setAnthropicFactory(factory: ProviderFactory<S>) {
      this.anthropicFactory = factory;
    }

    public hasAnthropic() {
      return !!(
        this.#anthropic ??
        (this.constructor as typeof AnthropicServiceMixin)?.sharedAnthropic ??
        this.getDependencies()
      );
    }
  };
}

export function GeminiMixin<
  TBase extends Constructor<any[], HasDependencies & HasOpts>
>(Base: TBase) {
  type S = GeminiService;
  return class GeminiServiceMixin extends Base {
    #gemini?: S;
    #geminiApiKey?: string;
    static sharedGemini?: S;
    static geminiFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.gemini) this.#gemini = opts.gemini;

      this.#geminiApiKey = opts?.apiKeys?.gemini;
    }
    public get gemini() {
      if (!this.#gemini) {
        const shared = (this.constructor as typeof GeminiServiceMixin)
          .sharedGemini;
        if (shared) {
          this.#gemini = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "Gemini deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }

          const factory = (this.constructor as typeof GeminiServiceMixin)
            .geminiFactory;

          this.#gemini =
            factory?.(deps, this.#geminiApiKey) ??
            new GeminiService(
              deps.logger,
              deps.prisma,
              deps.redis,
              deps.s3,
              this.#geminiApiKey ?? ""
            );
        }
      }
      return this.#gemini;
    }

    static setSharedGemini(instance: S) {
      this.sharedGemini = instance;
    }

    static setGeminiFactory(factory: ProviderFactory<S>) {
      this.geminiFactory = factory;
    }

    public hasGemini() {
      return !!(
        this.#gemini ??
        (this.constructor as typeof GeminiServiceMixin)?.sharedGemini ??
        this.getDependencies()
      );
    }
  };
}

export function OpenAIMixin<
  TBase extends Constructor<any[], HasDependencies & HasOpts>
>(Base: TBase) {
  type S = OpenAIService;
  return class OpenAIServiceMixin extends Base {
    #openai?: S;
    #openaiApiKey?: string;
    static sharedOpenai?: S;
    static openaiFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.openai) this.#openai = opts.openai;

      this.#openaiApiKey = opts?.apiKeys?.openai;
    }
    public get openai() {
      if (!this.#openai) {
        const shared = (this.constructor as typeof OpenAIServiceMixin)
          .sharedOpenai;
        if (shared) {
          this.#openai = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "OpenAI deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }

          const factory = (this.constructor as typeof OpenAIServiceMixin)
            .openaiFactory;

          this.#openai =
            factory?.(deps, this.#openaiApiKey) ??
            new OpenAIService(
              deps.logger,
              deps.prisma,
              deps.s3,
              deps.redis,
              this.#openaiApiKey ?? ""
            );
        }
      }
      return this.#openai;
    }

    static setSharedOpenai(instance: S) {
      this.sharedOpenai = instance;
    }

    static setOpenAIFactory(factory: ProviderFactory<S>) {
      this.openaiFactory = factory;
    }

    public hasOpenAI() {
      return !!(
        this.#openai ??
        (this.constructor as typeof OpenAIServiceMixin)?.sharedOpenai ??
        this.getDependencies()
      );
    }
  };
}

export function GrokMixin<
  TBase extends Constructor<any[], HasDependencies & HasOpts>
>(Base: TBase) {
  type S = xAIService;
  return class GrokServiceMixin extends Base {
    #grok?: S;
    #grokApiKey?: string;
    #grokManagementKey?: string;
    static sharedGrok?: S;
    static grokFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.grok) this.#grok = opts.grok;

      this.#grokApiKey = opts?.apiKeys?.grok;
      this.#grokManagementKey = opts?.apiKeys?.grokMgmtKey;
    }
    public get grok() {
      if (!this.#grok) {
        const shared = (this.constructor as typeof GrokServiceMixin).sharedGrok;
        if (shared) {
          this.#grok = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "xAI deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }

          const factory = (this.constructor as typeof GrokServiceMixin)
            .grokFactory;

          this.#grok =
            factory?.(deps, this.#grokApiKey) ??
            new xAIService(
              deps.logger,
              deps.prisma,
              deps.redis,
              deps.s3,
              this.#grokApiKey ?? "",
              this.#grokManagementKey ?? ""
            );
        }
      }
      return this.#grok;
    }

    static setSharedGrok(instance: S) {
      this.sharedGrok = instance;
    }

    static setGrokFactory(factory: ProviderFactory<S>) {
      this.grokFactory = factory;
    }

    public hasGrok() {
      return !!(
        this.#grok ??
        (this.constructor as typeof GrokServiceMixin)?.sharedGrok ??
        this.getDependencies()
      );
    }
  };
}

export function VercelMixin<
  TBase extends Constructor<any[], HasDependencies & HasOpts>
>(Base: TBase) {
  type S = v0Service;
  return class VercelServiceMixin extends Base {
    #vercel?: S;
    #vercelApiKey?: string;
    static sharedVercel?: S;
    static vercelFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.vercel) this.#vercel = opts.vercel;

      this.#vercelApiKey = opts?.apiKeys?.vercel;
    }
    public get vercel() {
      if (!this.#vercel) {
        const shared = (this.constructor as typeof VercelServiceMixin)
          .sharedVercel;
        if (shared) {
          this.#vercel = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "v0 (Vercel) deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }
          const factory = (this.constructor as typeof VercelServiceMixin)
            .vercelFactory;

          this.#vercel =
            factory?.(deps, this.#vercelApiKey) ??
            new v0Service(
              deps.logger,
              deps.prisma,
              deps.redis,
              this.#vercelApiKey ?? ""
            );
        }
      }
      return this.#vercel;
    }

    static setSharedVercel(instance: S) {
      this.sharedVercel = instance;
    }

    static setVercelFactory(factory: ProviderFactory<S>) {
      this.vercelFactory = factory;
    }

    public hasVercel() {
      return !!(
        this.#vercel ??
        (this.constructor as typeof VercelServiceMixin)?.sharedVercel ??
        this.getDependencies()
      );
    }
  };
}

export function MetaMixin<
  TBase extends Constructor<any[], HasDependencies & HasOpts>
>(Base: TBase) {
  type S = LlamaService;
  return class MetaServiceMixin extends Base {
    #meta?: S;
    #metaApiKey?: string;
    static sharedMeta?: S;
    static metaFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.meta) this.#meta = opts.meta;

      this.#metaApiKey = opts?.apiKeys?.meta;
    }
    public get meta() {
      if (!this.#meta) {
        const shared = (this.constructor as typeof MetaServiceMixin).sharedMeta;
        if (shared) {
          this.#meta = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "Llama (Meta) deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }
          const factory = (this.constructor as typeof MetaServiceMixin)
            .metaFactory;

          this.#meta =
            factory?.(deps, this.#metaApiKey) ??
            new LlamaService(
              deps.logger,
              deps.prisma,
              deps.redis,
              this.#metaApiKey ?? ""
            );
        }
      }
      return this.#meta;
    }

    static setSharedMeta(instance: S) {
      this.sharedMeta = instance;
    }

    static setMetaFactory(factory: ProviderFactory<S>) {
      this.metaFactory = factory;
    }

    public hasMeta() {
      return !!(
        this.#meta ??
        (this.constructor as typeof MetaServiceMixin)?.sharedMeta ??
        this.getDependencies()
      );
    }
  };
}
