import type { ExtractService } from "@/extract/index.ts";
import { PrismaConvoListService } from "@/prisma/convo-list.ts";
import type { PrismaDbService } from "@slipstream/db/factory";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type {
  CliConfigDTO,
  CliConfigSingleton,
  Provider
} from "@slipstream/types";
import { modelIdsByProvider } from "@slipstream/types";

/**
 * identity-plane knobs a client may patch — everything else is
 * server-owned. Provider arrives in the wire's lowercase format (the CLI
 * gates it exactly like the web client does); providerToPrismaFormat
 * converts at the DB boundary.
 */
export interface CliConfigPatch {
  defaultProvider?: Provider;
  defaultModel?: string;
  showThinking?: boolean;
}

/**
 * CliConfig CRUD (Sovereign CLI identity plane — config-planning doc §4).
 * Dedicated table, dedicated chain link: web config models are never
 * touched here. The registry is a userId-keyed write-through cache; the
 * DB stays the truth and a miss always falls through to a read.
 */
export class PrismaCliConfigService extends PrismaConvoListService {
  constructor(
    prisma: PrismaDbService,
    extractor: ExtractService,
    isProd: boolean
  ) {
    super(prisma, extractor, isProd);
  }

  protected cliConfigRegistry = new Map<string, CliConfigSingleton>();

  /**
   * the service-layer gate on the provider↔model pairing — the DB
   * deliberately doesn't encode the relation (config-planning doc §4);
   * the codegen roster is the authority
   */
  public cliModelBelongsToProvider(provider: Provider, modelId: string) {
    return modelIdsByProvider[provider].some(id => id === modelId);
  }

  /**
   * read lane — registry first, DB on miss, row minted with schema
   * defaults (ANTHROPIC / claude-fable-5 / showThinking) when the user
   * has none. Check-first, never exceptions-as-control-flow.
   */
  public async getOrCreateCliConfig(userId: string) {
    const cached = this.cliConfigRegistry.get(userId);
    if (cached) return cached;

    const existing = await this.prismaClient.cliConfig.findUnique({
      where: { userId }
    });
    if (existing) {
      this.cliConfigRegistry.set(userId, existing);
      return existing;
    }

    const created = await this.prismaClient.cliConfig.create({
      data: { userId }
    });
    this.cliConfigRegistry.set(userId, created);
    return created;
  }

  /**
   * write lane — validates the EFFECTIVE pairing (patched value or the
   * row's current one) before touching the DB, upserts so a fresh user's
   * first write also mints the row, write-through on success. Expected
   * failure is a discriminated return, not a throw.
   */
  public async updateCliConfig(userId: string, patch: CliConfigPatch) {
    const current = await this.getOrCreateCliConfig(userId);
    const provider =
      patch.defaultProvider ??
      (current.defaultProvider.toLowerCase() as Lowercase<$Enums.Provider>);
    const model = patch.defaultModel ?? current.defaultModel;

    if (!this.cliModelBelongsToProvider(provider, model)) {
      return {
        ok: false,
        reason: `${model} does not belong to ${provider}`
      } as const;
    }

    const data = {
      defaultProvider:
        typeof patch.defaultProvider !== "undefined"
          ? this.providerToPrismaFormat(patch.defaultProvider)
          : undefined,
      defaultModel: patch.defaultModel,
      showThinking: patch.showThinking
    };
    const updated = await this.prismaClient.cliConfig.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data
    });
    this.cliConfigRegistry.set(userId, updated);
    return { ok: true, config: updated } as const;
  }

  /**
   * row → wire DTO (events.ts CliConfigDTO) — the provider drops to the
   * lowercase wire format (the user-meta reverse precedent); everything
   * server-internal (id, userId, timestamps) stays off the wire
   */
  public cliConfigToDTO(config: CliConfigSingleton) {
    return {
      defaultProvider:
        config.defaultProvider.toLowerCase() as Lowercase<$Enums.Provider>,
      defaultModel: config.defaultModel,
      showThinking: config.showThinking,
      schemaVersion: config.schemaVersion
    } satisfies CliConfigDTO;
  }

  /**
   * the resume lens's write lane (config-planning doc §5.5) — one upsert
   * per completed CLI turn, via-gated at the call site. lastActiveAt is
   * @updatedAt-managed but set EXPLICITLY here anyway: the touch IS the
   * point of this method, so it never rides on prisma's invisible
   * injection. Row existence itself is the CLI provenance.
   */
  public async touchCliConversationActivity(
    userId: string,
    conversationId: string
  ) {
    return this.prismaClient.cliConversationActivity.upsert({
      where: { userId_conversationId: { userId, conversationId } },
      create: { userId, conversationId },
      update: { lastActiveAt: new Date() }
    });
  }

  /**
   * the resume lens's read lane — recency emerges from the ordering over
   * the [userId, lastActiveAt desc] index (never stored as a list); ids
   * only, the convo index already carries the metadata
   */
  public async recentCliConversationIds(userId: string, take = 10) {
    const rows = await this.prismaClient.cliConversationActivity.findMany({
      where: { userId },
      orderBy: { lastActiveAt: "desc" },
      take,
      select: { conversationId: true }
    });
    return rows.map(r => r.conversationId);
  }
}
