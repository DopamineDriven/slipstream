export type ConversationListEntry = {
  id: string;
  title: string | null;
  updatedAt: number;
  messageCount: number;
};

export type ConversationList = {
  type: "conversation_list";
  take?: number; // server clamps (default 50, max ~100)
};

export type ConversationListAck = {
  type: "conversation_list_ack";
  userId: string;
  conversations: ConversationListEntry[];
};
