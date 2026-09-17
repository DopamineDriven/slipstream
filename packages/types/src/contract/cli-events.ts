import type { Provider } from "@/models.ts";
import type { UTR } from "@/utils.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";

export type CliConfigDTO = {
  defaultProvider: Provider;
  defaultModel: string;
  showThinking: boolean;
  schemaVersion: $Enums.CliConfigSchemaVersion;
};

export type CliConfigHydrate = {
  type: "cli_config_hydrate";
};

export type CliConfigHydrateAck = {
  type: "cli_config_hydrate_ack";
  cliConfig: CliConfigDTO;
};

export type CliRecentConvos = {
  type: "cli_recent_convos";
};

export type CliRecentConvosAck = {
  type: "cli_recent_convos_ack";
  conversationIds: string[];
};

export type CliConfigUpdate = {
  type: "cli_config_update";
  patch: {
    defaultProvider?: Provider;
    defaultModel?: string;
    showThinking?: boolean;
  };
};

export type CliConfigUpdateAck = {
  type: "cli_config_update_ack";
  success: boolean;
  reason?: string;
  cliConfig: CliConfigDTO;
};

export type CliEventUnion =
  | CliConfigHydrate
  | CliConfigHydrateAck
  | CliConfigUpdate
  | CliConfigUpdateAck
  | CliRecentConvos
  | CliRecentConvosAck;

export type CliEventRecord<T extends boolean = false> = UTR<
  CliEventUnion,
  "type",
  T
>;
