import { AnthropicService } from "@/anthropic/index.ts";
import { GeminiService } from "@/gemini/index.ts";
import { LoggerService } from "@/logger/index.ts";
import { LlamaService } from "@/meta/index.ts";
import { OpenAIService } from "@/openai/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { UserStoreVectorService } from "@/store/vector-store.ts";
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
  userStore: UserStoreVectorService;
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
    claude?: S;
    claudeApiKey?: string;
    static sharedAnthropic?: S;
    static anthropicFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.anthropic) this.claude = opts.anthropic;

      this.claudeApiKey = opts?.apiKeys?.anthropic;
    }
    public get anthropic() {
      if (!this.claude) {
        const shared = (this.constructor as typeof AnthropicServiceMixin)
          .sharedAnthropic;
        if (shared) {
          this.claude = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "Anthropic deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }
          const factory = (this.constructor as typeof AnthropicServiceMixin)
            .anthropicFactory;
          this.claude =
            factory?.(deps, this.claudeApiKey) ??
            new AnthropicService(
              deps.logger,
              deps.prisma,
              deps.userStore,
              deps.redis,
              this.claudeApiKey ?? ""
            );
        }
      }
      return this.claude;
    }

    static setSharedAnthropic(instance: S) {
      this.sharedAnthropic = instance;
    }

    static setAnthropicFactory(factory: ProviderFactory<S>) {
      this.anthropicFactory = factory;
    }

    public hasAnthropic() {
      return !!(
        this.claude ??
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
    gem?: S;
    gemApiKey?: string;
    static sharedGemini?: S;
    static geminiFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.gemini) this.gem = opts.gemini;

      this.gemApiKey = opts?.apiKeys?.gemini;
    }
    public get gemini() {
      if (!this.gem) {
        const shared = (this.constructor as typeof GeminiServiceMixin)
          .sharedGemini;
        if (shared) {
          this.gem = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "Gemini deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }

          const factory = (this.constructor as typeof GeminiServiceMixin)
            .geminiFactory;

          this.gem =
            factory?.(deps, this.gemApiKey) ??
            new GeminiService(
              deps.logger,
              deps.prisma,
              deps.redis,
              deps.s3,
              this.gemApiKey ?? ""
            );
        }
      }
      return this.gem;
    }

    static setSharedGemini(instance: S) {
      this.sharedGemini = instance;
    }

    static setGeminiFactory(factory: ProviderFactory<S>) {
      this.geminiFactory = factory;
    }

    public hasGemini() {
      return !!(
        this.gem ??
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
    oai?: S;
    oaiApiKey?: string;
    static sharedOpenai?: S;
    static openaiFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.openai) this.oai = opts.openai;

      this.oaiApiKey = opts?.apiKeys?.openai;
    }
    public get openai() {
      if (!this.oai) {
        const shared = (this.constructor as typeof OpenAIServiceMixin)
          .sharedOpenai;
        if (shared) {
          this.oai = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "OpenAI deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }

          const factory = (this.constructor as typeof OpenAIServiceMixin)
            .openaiFactory;

          this.oai =
            factory?.(deps, this.oaiApiKey) ??
            new OpenAIService(
              deps.logger,
              deps.prisma,
              deps.userStore,
              deps.s3,
              deps.redis,
              this.oaiApiKey ?? ""
            );
        }
      }
      return this.oai;
    }

    static setSharedOpenai(instance: S) {
      this.sharedOpenai = instance;
    }

    static setOpenAIFactory(factory: ProviderFactory<S>) {
      this.openaiFactory = factory;
    }

    public hasOpenAI() {
      return !!(
        this.oai ??
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
    xai?: S;
    xaiApiKey?: string;
    xaiManagementKey?: string;
    static sharedGrok?: S;
    static grokFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.grok) this.xai = opts.grok;

      this.xaiApiKey = opts?.apiKeys?.grok;
      this.xaiManagementKey = opts?.apiKeys?.grokMgmtKey;
    }
    public get grok() {
      if (!this.xai) {
        const shared = (this.constructor as typeof GrokServiceMixin).sharedGrok;
        if (shared) {
          this.xai = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "xAI deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }

          const factory = (this.constructor as typeof GrokServiceMixin)
            .grokFactory;

          this.xai =
            factory?.(deps, this.xaiApiKey) ??
            new xAIService(
              deps.logger,
              deps.prisma,
              deps.redis,
              deps.s3,
              this.xaiApiKey ?? "",
              this.xaiManagementKey ?? ""
            );
        }
      }
      return this.xai;
    }

    static setSharedGrok(instance: S) {
      this.sharedGrok = instance;
    }

    static setGrokFactory(factory: ProviderFactory<S>) {
      this.grokFactory = factory;
    }

    public hasGrok() {
      return !!(
        this.xai ??
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
    v0?: S;
    v0ApiKey?: string;
    static sharedVercel?: S;
    static vercelFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.vercel) this.v0 = opts.vercel;

      this.v0ApiKey = opts?.apiKeys?.vercel;
    }
    public get vercel() {
      if (!this.v0) {
        const shared = (this.constructor as typeof VercelServiceMixin)
          .sharedVercel;
        if (shared) {
          this.v0 = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "v0 (Vercel) deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }
          const factory = (this.constructor as typeof VercelServiceMixin)
            .vercelFactory;

          this.v0 =
            factory?.(deps, this.v0ApiKey) ??
            new v0Service(
              deps.logger,
              deps.prisma,
              deps.redis,
              deps.userStore,
              this.v0ApiKey ?? ""
            );
        }
      }
      return this.v0;
    }

    static setSharedVercel(instance: S) {
      this.sharedVercel = instance;
    }

    static setVercelFactory(factory: ProviderFactory<S>) {
      this.vercelFactory = factory;
    }

    public hasVercel() {
      return !!(
        this.v0 ??
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
    llama?: S;
    llamaApiKey?: string;
    static sharedMeta?: S;
    static metaFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.meta) this.llama = opts.meta;

      this.llamaApiKey = opts?.apiKeys?.meta;
    }
    public get meta() {
      if (!this.llama) {
        const shared = (this.constructor as typeof MetaServiceMixin).sharedMeta;
        if (shared) {
          this.llama = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "Llama (Meta) deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }
          const factory = (this.constructor as typeof MetaServiceMixin)
            .metaFactory;

          this.llama =
            factory?.(deps, this.llamaApiKey) ??
            new LlamaService(
              deps.logger,
              deps.prisma,
              deps.redis,
              deps.userStore,
              this.llamaApiKey ?? ""
            );
        }
      }
      return this.llama;
    }

    static setSharedMeta(instance: S) {
      this.sharedMeta = instance;
    }

    static setMetaFactory(factory: ProviderFactory<S>) {
      this.metaFactory = factory;
    }

    public hasMeta() {
      return !!(
        this.llama ??
        (this.constructor as typeof MetaServiceMixin)?.sharedMeta ??
        this.getDependencies()
      );
    }
  };
}
