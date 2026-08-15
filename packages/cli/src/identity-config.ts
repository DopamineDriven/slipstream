import { CliProviderContextService } from "@/provider-context.ts";
import type { CliConfigDTO, EventTypeMap } from "@slipstream/types";

/**
 * Identity-plane config + resume lens (config-planning doc §§3–5.5) — the
 * CLI's slot for the roaming CliConfig row. Pull-based by contract: the
 * client requests once the socket is up (asking IS the provenance — the
 * server needs no via gate), and re-requesting the recency list IS the
 * refresh trigger. Update acks are the uniform wire shape: the canonical
 * DTO always rides along, so reconciliation is unconditional assignment —
 * a rejected patch snaps local state back to truth by the same code path
 * that confirms a success.
 */
export class CliIdentityConfigService extends CliProviderContextService {
  constructor(wsUrl?: string) {
    super(wsUrl);
  }

  protected cliConfig?: CliConfigDTO = undefined;
  /** lastActiveAt desc, ids only — the convo index carries the metadata */
  protected recentConversationIds = Array.of<string>();

  /** repl-assigned hooks — fire AFTER local state reconciles */
  protected onCliConfigHydrated?: (config: CliConfigDTO) => void;
  protected onCliConfigUpdateAck?: (
    ack: EventTypeMap["cli_config_update_ack"]
  ) => void;
  protected onRecentConvosAck?: (conversationIds: string[]) => void;

  /** register BEFORE connect() — same discipline as wireProviderContext */
  protected wireIdentityConfig() {
    this.on("cli_config_hydrate_ack", d => {
      this.cliConfig = d.cliConfig;
      this.onCliConfigHydrated?.(d.cliConfig);
    });
    this.on("cli_config_update_ack", d => {
      this.cliConfig = d.cliConfig;
      this.onCliConfigUpdateAck?.(d);
    });
    this.on("cli_recent_convos_ack", d => {
      this.recentConversationIds = d.conversationIds;
      this.onRecentConvosAck?.(d.conversationIds);
    });
  }

  /** pull the identity plane — fire once, after connect() */
  protected hydrateIdentity() {
    this.send({ type: "cli_config_hydrate" });
    this.send({ type: "cli_recent_convos" });
  }

  /** re-request IS the refresh trigger (/resume, machine B sees machine A) */
  protected refreshRecentConvos() {
    this.send({ type: "cli_recent_convos" });
  }

  /**
   * partial patch of typed knobs — pairing coherence is the CALLER's job
   * (the picker/command lane always emits provider+model together; the
   * server's roster validation is the backstop)
   */
  protected sendCliConfigUpdate(
    patch: EventTypeMap["cli_config_update"]["patch"]
  ) {
    this.send({ type: "cli_config_update", patch });
  }
}
