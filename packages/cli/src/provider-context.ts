import { SlipstreamClientService } from "@/client.ts";
import type { ClientContextWorkupProps, Provider } from "@slipstream/types";

/**
 * The ApiKeysProvider react context, translated class-based and React-free —
 * the CLI's slot in the chain (config → client → providerContext → renderer →
 * repl). connection_established delivers providerContext immediately post-
 * handshake (the wire provides — no db package needed); pong/ack keep it
 * fresh. The repl threads isSet/isDefault into every ai_chat_request exactly
 * as the web client does — the fields that drive BYOK-vs-server key
 * resolution.
 */
export class CliProviderContextService extends SlipstreamClientService {
  protected providerContext: ClientContextWorkupProps | null = null;

  /** register BEFORE connect() — the frame lands milliseconds post-handshake */
  protected wireProviderContext() {
    this.on("connection_established", data => {
      this.providerContext = data.providerContext;
    });
    this.on("provider_context_pong", data => {
      this.providerContext = data.providerContext;
    });
    this.on("provider_context_update_ack", data => {
      this.providerContext = data.providerContext;
    });
  }

  /** the two request fields the web sends (undefined until the frame lands) */
  protected providerFlags(provider: Provider) {
    return {
      hasProviderConfigured: this.providerContext?.isSet[provider],
      isDefaultProvider: this.providerContext?.isDefault[provider]
    };
  }

  /** isAwaitingInitial analog — soft gate; times out to undefined flags */
  protected async awaitProviderContext(timeoutMs = 5_000) {
    const startedAt = Date.now();
    while (this.providerContext === null) {
      if (Date.now() - startedAt > timeoutMs) return false;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return true;
  }
}
