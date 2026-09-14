import type { ClientContextWorkupProps } from "@/events-workup.ts";
import type { UTR } from "@/utils.ts";

export type ConnectionEstablished = {
  type: "connection_established";
  providerContext: ClientContextWorkupProps;
};

export type ProviderContextUpdate = {
  type: "provider_context_update";
};

export type ProviderContextUpdateAck = {
  type: "provider_context_update_ack";
  providerContext: ClientContextWorkupProps;
};

export type ProviderContextPing = {
  type: "provider_context_ping";
};

export type ProviderContextPong = {
  type: "provider_context_pong";
  providerContext: ClientContextWorkupProps;
};

export type ProviderContextEventUnion =
  | ConnectionEstablished
  | ProviderContextPing
  | ProviderContextPong
  | ProviderContextUpdate
  | ProviderContextUpdateAck;

export type ProviderContextEventRecord<T extends boolean = false> = UTR<
  ProviderContextEventUnion,
  "type",
  T
>;
