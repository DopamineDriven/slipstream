import type { LoggerService } from "@/logger/index.ts";
import type { ConversationMemoryVectorService } from "@/memory/vector-store.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import { AlibabaService } from "@/alibaba/index.ts";
import { AnthropicService } from "@/anthropic/index.ts";
import { CohereService } from "@/cohere/index.ts";
import { DeepSeekService } from "@/deepseek/index.ts";
import { GeminiService } from "@/gemini/index.ts";
import { KimiService } from "@/kimi/index.ts";
import { LlamaService } from "@/meta/index.ts";
import { MiniMaxService } from "@/minimax/index.ts";
import { MistralService } from "@/mistral/index.ts";
import { OpenAIService } from "@/openai/index.ts";
import { PrismaService } from "@/prisma/index.ts";
import { SakanaService } from "@/sakana/index.ts";
import { v0Service } from "@/vercel/index.ts";
import { xAIService } from "@/xai/index.ts";
import { ZaiService } from "@/zai/index.ts";
import type { EnhancedRedisPubSub } from "@slipstream/redis-service";
import type { S3Storage } from "@slipstream/storage-s3";
import type { Provider } from "@slipstream/types";

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
            : P extends "mistral"
              ? MistralService
              : P extends "cohere"
                ? CohereService
                : P extends "moonshotai"
                  ? KimiService
                  : P extends "deepseek"
                    ? DeepSeekService
                    : P extends "zai"
                      ? ZaiService
                      : P extends "alibaba"
                        ? AlibabaService
                        : P extends "minimax"
                          ? MiniMaxService
                          : P extends "sakana"
                            ? SakanaService
                            : never;

export interface ProviderMap {
  anthropic: AnthropicService;
  gemini: GeminiService;
  openai: OpenAIService;
  meta: LlamaService;
  vercel: v0Service;
  grok: xAIService;
  mistral: MistralService;
  cohere: CohereService;
  moonshotai: KimiService;
  deepseek: DeepSeekService;
  zai: ZaiService;
  alibaba: AlibabaService;
  minimax: MiniMaxService;
  sakana: SakanaService;
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
  memory: ConversationMemoryVectorService;
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
    mistral?: string;
    cohere?: string;
    moonshotai?: string;
    deepseek?: string;
    zai?: string;
    alibaba?: string;
    minimax?: string;
    sakana?: string;
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
              deps.memory,
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
              deps.userStore,
              deps.redis,
              deps.s3,
              deps.memory,
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

export function MistralMixin<
  TBase extends Constructor<any[], HasDependencies & HasOpts>
>(Base: TBase) {
  type S = MistralService;
  return class MistralServiceMixin extends Base {
    mist?: S;
    mistralApiKey?: string;
    static sharedMistral?: S;
    static mistralFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.mistral) this.mist = opts.mistral;

      this.mistralApiKey = opts?.apiKeys?.mistral;
    }
    public get mistral() {
      if (!this.mist) {
        const shared = (this.constructor as typeof MistralServiceMixin)
          .sharedMistral;
        if (shared) {
          this.mist = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "Mistral deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }

          const factory = (this.constructor as typeof MistralServiceMixin)
            .mistralFactory;

          this.mist =
            factory?.(deps, this.mistralApiKey) ??
            new MistralService(
              deps.logger,
              deps.prisma,
              deps.redis,
              deps.userStore,
              deps.memory,
              this.mistralApiKey ?? ""
            );
        }
      }
      return this.mist;
    }

    static setSharedMistral(instance: S) {
      this.sharedMistral = instance;
    }

    static setMistralFactory(factory: ProviderFactory<S>) {
      this.mistralFactory = factory;
    }

    public hasMistral() {
      return !!(
        this.mist ??
        (this.constructor as typeof MistralServiceMixin)?.sharedMistral ??
        this.getDependencies()
      );
    }
  };
}

export function CohereMixin<
  TBase extends Constructor<any[], HasDependencies & HasOpts>
>(Base: TBase) {
  type S = CohereService;
  return class CohereServiceMixin extends Base {
    co?: S;
    coApiKey?: string;
    static sharedCo?: S;
    static coFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.cohere) this.co = opts.cohere;

      this.coApiKey = opts?.apiKeys?.cohere;
    }
    public get cohere() {
      if (!this.co) {
        const shared = (this.constructor as typeof CohereServiceMixin).sharedCo;
        if (shared) {
          this.co = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "Cohere deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }

          const factory = (this.constructor as typeof CohereServiceMixin)
            .coFactory;

          this.co =
            factory?.(deps, this.coApiKey) ??
            new CohereService(
              deps.logger,
              deps.prisma,
              deps.redis,
              deps.userStore,
              this.coApiKey ?? "",
              deps.memory
            );
        }
      }
      return this.co;
    }

    static setSharedCohere(instance: S) {
      this.sharedCo = instance;
    }

    static setCohereFactory(factory: ProviderFactory<S>) {
      this.coFactory = factory;
    }

    public hasCohere() {
      return !!(
        this.co ??
        (this.constructor as typeof CohereServiceMixin)?.sharedCo ??
        this.getDependencies()
      );
    }
  };
}

export function DeepSeekMixin<
  TBase extends Constructor<any[], HasDependencies & HasOpts>
>(Base: TBase) {
  type S = DeepSeekService;
  return class DeepSeekServiceMixin extends Base {
    ds?: S;
    dsApiKey?: string;
    static sharedDs?: S;
    static dsFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.deepseek) this.ds = opts.deepseek;

      this.dsApiKey = opts?.apiKeys?.deepseek;
    }
    public get deepseek() {
      if (!this.ds) {
        const shared = (this.constructor as typeof DeepSeekServiceMixin)
          .sharedDs;
        if (shared) {
          this.ds = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "DeepSeek deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }

          const factory = (this.constructor as typeof DeepSeekServiceMixin)
            .dsFactory;

          this.ds =
            factory?.(deps, this.dsApiKey) ??
            new DeepSeekService(
              deps.logger,
              deps.prisma,
              deps.redis,
              deps.userStore,
              deps.memory,
              this.dsApiKey ?? ""
            );
        }
      }
      return this.ds;
    }

    static setSharedDeepSeek(instance: S) {
      this.sharedDs = instance;
    }

    static setDeepSeekFactory(factory: ProviderFactory<S>) {
      this.dsFactory = factory;
    }

    public hasDeepSeek() {
      return !!(
        this.ds ??
        (this.constructor as typeof DeepSeekServiceMixin)?.sharedDs ??
        this.getDependencies()
      );
    }
  };
}

export function ZaiMixin<
  TBase extends Constructor<any[], HasDependencies & HasOpts>
>(Base: TBase) {
  type S = ZaiService;
  return class ZaiServiceMixin extends Base {
    z?: S;
    zApiKey?: string;
    static sharedZ?: S;
    static zFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.zai) this.z = opts.zai;

      this.zApiKey = opts?.apiKeys?.zai;
    }
    public get zai() {
      if (!this.z) {
        const shared = (this.constructor as typeof ZaiServiceMixin).sharedZ;
        if (shared) {
          this.z = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "Zai deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }

          const factory = (this.constructor as typeof ZaiServiceMixin).zFactory;

          this.z =
            factory?.(deps, this.zApiKey) ??
            new ZaiService(
              deps.logger,
              deps.prisma,
              deps.redis,
              deps.userStore,
              deps.memory,
              this.zApiKey ?? ""
            );
        }
      }
      return this.z;
    }

    static setSharedZai(instance: S) {
      this.sharedZ = instance;
    }

    static setZaiFactory(factory: ProviderFactory<S>) {
      this.zFactory = factory;
    }

    public hasZai() {
      return !!(
        this.z ??
        (this.constructor as typeof ZaiServiceMixin)?.sharedZ ??
        this.getDependencies()
      );
    }
  };
}

export function SakanaMixin<
  TBase extends Constructor<any[], HasDependencies & HasOpts>
>(Base: TBase) {
  type S = SakanaService;
  return class SakanaServiceMixin extends Base {
    fugu?: S;
    fuguApiKey?: string;
    static sharedFugu?: S;
    static fuguFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.sakana) this.fugu = opts.sakana;

      this.fuguApiKey = opts?.apiKeys?.sakana;
    }
    public get sakana() {
      if (!this.fugu) {
        const shared = (this.constructor as typeof SakanaServiceMixin)
          .sharedFugu;
        if (shared) {
          this.fugu = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "Sakana deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }

          const factory = (this.constructor as typeof SakanaServiceMixin)
            .fuguFactory;

          this.fugu =
            factory?.(deps, this.fuguApiKey) ??
            new SakanaService(
              deps.logger,
              deps.prisma,
              deps.userStore,
              deps.s3,
              deps.memory,
              deps.redis,
              this.fuguApiKey ?? ""
            );
        }
      }
      return this.fugu;
    }

    static setSharedSakana(instance: S) {
      this.sharedFugu = instance;
    }

    static setSakanaFactory(factory: ProviderFactory<S>) {
      this.fuguFactory = factory;
    }

    public hasSakana() {
      return !!(
        this.sakana ??
        (this.constructor as typeof SakanaServiceMixin)?.sharedFugu ??
        this.getDependencies()
      );
    }
  };
}

export function KimiMixin<
  TBase extends Constructor<any[], HasDependencies & HasOpts>
>(Base: TBase) {
  type S = KimiService;
  return class KimiServiceMixin extends Base {
    kimi?: S;
    kimiApiKey?: string;
    static sharedKimi?: S;
    static kimiFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.moonshotai) this.kimi = opts.moonshotai;

      this.kimiApiKey = opts?.apiKeys?.moonshotai;
    }
    public get moonshotai() {
      if (!this.kimi) {
        const shared = (this.constructor as typeof KimiServiceMixin).sharedKimi;
        if (shared) {
          this.kimi = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "Kimi deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }

          const factory = (this.constructor as typeof KimiServiceMixin)
            .kimiFactory;

          this.kimi =
            factory?.(deps, this.kimiApiKey) ??
            new KimiService(
              deps.logger,
              deps.prisma,
              deps.redis,
              deps.userStore,
              deps.memory,
              this.kimiApiKey ?? ""
            );
        }
      }
      return this.kimi;
    }

    static setSharedMoonshotai(instance: S) {
      this.sharedKimi = instance;
    }

    static setMoonshotaiFactory(factory: ProviderFactory<S>) {
      this.kimiFactory = factory;
    }

    public hasMoonshotai() {
      return !!(
        this.kimi ??
        (this.constructor as typeof KimiServiceMixin)?.sharedKimi ??
        this.getDependencies()
      );
    }
  };
}

export function AlibabaMixin<
  TBase extends Constructor<any[], HasDependencies & HasOpts>
>(Base: TBase) {
  type S = AlibabaService;
  return class AlibabaServiceMixin extends Base {
    qwen?: S;
    qwenApiKey?: string;
    static sharedQwen?: S;
    static qwenFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.alibaba) this.qwen = opts.alibaba;

      this.qwenApiKey = opts?.apiKeys?.moonshotai;
    }
    public get alibaba() {
      if (!this.qwen) {
        const shared = (this.constructor as typeof AlibabaServiceMixin)
          .sharedQwen;
        if (shared) {
          this.qwen = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "Alibaba deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }

          const factory = (this.constructor as typeof AlibabaServiceMixin)
            .qwenFactory;

          this.qwen =
            factory?.(deps, this.qwenApiKey) ??
            new AlibabaService(
              deps.logger,
              deps.prisma,
              deps.redis,
              deps.userStore,
              deps.memory,
              this.qwenApiKey ?? ""
            );
        }
      }
      return this.qwen;
    }

    static setSharedAlibaba(instance: S) {
      this.sharedQwen = instance;
    }

    static setAlibabaFactory(factory: ProviderFactory<S>) {
      this.qwenFactory = factory;
    }

    public hasAlibaba() {
      return !!(
        this.qwen ??
        (this.constructor as typeof AlibabaServiceMixin)?.sharedQwen ??
        this.getDependencies()
      );
    }
  };
}

export function MiniMaxMixin<
  TBase extends Constructor<any[], HasDependencies & HasOpts>
>(Base: TBase) {
  type S = MiniMaxService;
  return class MiniMaxServiceMixin extends Base {
    m?: S;
    mApiKey?: string;
    static sharedM?: S;
    static mFactory?: ProviderFactory<S>;
    constructor(...args: any[]) {
      super(...(args as (ProviderOpts | undefined)[]));

      const opts = this.opts;

      if (opts?.minimax) this.m = opts.minimax;

      this.mApiKey = opts?.apiKeys?.moonshotai;
    }
    public get minimax() {
      if (!this.m) {
        const shared = (this.constructor as typeof MiniMaxServiceMixin).sharedM;
        if (shared) {
          this.m = shared;
        } else {
          const deps = this.getDependencies();
          if (!deps) {
            throw new Error(
              "MiniMax deps missing. Set shared deps or pass dependencies in ProviderOpts."
            );
          }

          const factory = (this.constructor as typeof MiniMaxServiceMixin)
            .mFactory;

          this.m =
            factory?.(deps, this.mApiKey) ??
            new MiniMaxService(
              deps.logger,
              deps.prisma,
              deps.redis,
              deps.userStore,
              deps.memory,
              this.mApiKey ?? ""
            );
        }
      }
      return this.m;
    }

    static setSharedMiniMax(instance: S) {
      this.sharedM = instance;
    }

    static setMiniMaxFactory(factory: ProviderFactory<S>) {
      this.mFactory = factory;
    }

    public hasMiniMax() {
      return !!(
        this.m ??
        (this.constructor as typeof MiniMaxServiceMixin)?.sharedM ??
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
              this.oaiApiKey ?? "",
              deps.memory
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
              deps.userStore,
              deps.memory,
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
              deps.memory,
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
              deps.memory,
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
