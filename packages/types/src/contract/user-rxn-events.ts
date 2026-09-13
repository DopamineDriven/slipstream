import type { UserRxnAction } from "@/events-workup.ts";

export type UserRxnUpdate = {
  type: "user_rxn_update";
  conversationId: string;
  messageId: string;
  action: UserRxnAction;
};

export type UserRxnUpdateAck = {
  type: "user_rxn_update_ack";
  conversationId: string;
  messageId: string;
  liked: boolean | null;
  disliked: boolean | null;
};
