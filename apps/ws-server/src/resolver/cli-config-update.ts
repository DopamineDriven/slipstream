import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type { UserData } from "@/types/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import type { WebSocket } from "ws";
import { ResolverLocalToolResultService } from "@/resolver/local-tool-result.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { EventTypeMap } from "@slipstream/types";

export class ResolverCliConfigUpdate extends ResolverLocalToolResultService {
  constructor(
    wsServer: WSServer,
    providers: ProviderService,
    s3Service: S3Storage,
    region: string,
    imgCompatService: ImageCompatService,
    userVectorStore: UserStoreVectorService,
    xaiManagementApikey: string,
    logger: LoggerService,
    ttsService: TTSService
  ) {
    super(
      wsServer,
      providers,
      s3Service,
      region,
      imgCompatService,
      userVectorStore,
      xaiManagementApikey,
      logger,
      ttsService
    );
  }
  /**
   * write lane — the chain's discriminated return flattens to the wire's
   * UNIFORM ack shape (reason undefined exactly when success; canonical
   * DTO ALWAYS attached so a rejected patch snaps the client back to
   * truth). Pairing coherence is client-gated; the chain's roster
   * validation is the backstop for hand-crafted frames.
   */
  protected async cliConfigUpdate(
    event: EventTypeMap["cli_config_update"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    const result = await this.wsServer.prisma.updateCliConfig(
      userId,
      event.patch
    );
    const canonical = result.ok
      ? result.config
      : await this.wsServer.prisma.getOrCreateCliConfig(userId);
    ws.send(
      JSON.stringify({
        type: "cli_config_update_ack",
        success: result.ok,
        reason: result.ok ? undefined : result.reason,
        cliConfig: this.wsServer.prisma.cliConfigToDTO(canonical)
      } satisfies EventTypeMap["cli_config_update_ack"])
    );
  }
}
