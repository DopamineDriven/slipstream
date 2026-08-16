import type { ImageCompatService } from "@/image/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import type { ProviderService } from "@/providers/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type { TTSService } from "@/tts/index.ts";
import type { UserData } from "@/types/index.ts";
import type { WSServer } from "@/ws-server/index.ts";
import type { WebSocket } from "ws";
import { ResolverCliConfigUpdate } from "@/resolver/cli-config-update.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type { EventTypeMap } from "@slipstream/types";

export class ResolverCliConfigHydrate extends ResolverCliConfigUpdate {
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
   * pull-based identity-plane hydration (config-planning doc §3) — the
   * CLI asks once connection_established lands; asking IS the provenance,
   * so no via gate is needed. Mints the row with schema defaults on a
   * user's first hydrate.
   */
  protected async cliConfigHydrate(
    _event: EventTypeMap["cli_config_hydrate"],
    ws: WebSocket,
    userId: string,
    _userData?: UserData
  ) {
    const config = await this.wsServer.prisma.getOrCreateCliConfig(userId);
    ws.send(
      JSON.stringify({
        type: "cli_config_hydrate_ack",
        cliConfig: this.wsServer.prisma.cliConfigToDTO(config)
      } satisfies EventTypeMap["cli_config_hydrate_ack"])
    );
  }
}
