import type { AttachmentSingleton } from "@/types.ts";
import type { UTR } from "@/utils.ts";

export type HydrateAttachments = {
  type: "hydrate_attachments";
};

export type HydrateAttachmentsAck = {
  type: "hydrate_attachments_ack";
  conversationId: string;
  attachments: AttachmentSingleton<true>[];
};

// export type HydrateAttachmentByBatchIdAck={
//   type:"hydrate_attachment_by_draft_id_ack";
//   conversationId: string | null;
//   attachment?: AttachmentSingleton<true>;
//   reason?: "INVALID_ID" | (string & {});
// }

// export type HydrateAttachmentsByBatchId={
//   type:"hydrate_attachment_by_draft_id";
//   userId: string;
//   batchId: string;

// }

export type HydrateAttachmentsByConversationId = {
  type: "hydrate_attachments_by_conversation_id";
  conversationId: string;
};

export type HydrateAttachmentsByConversationIdAck = {
  type: "hydrate_attachments_by_conversation_id_ack";
  conversationId: string;
  attachments: AttachmentSingleton<true>[];
};

export type HydrateAttachmentById = {
  type: "hydrate_attachment_by_id";
  conversationId: string;
  attachmentId: string;
};

export type HydrateAttachmentByIdAck = {
  type: "hydrate_attachment_by_id_ack";
  conversationId: string;
  attachment?: AttachmentSingleton<true>;
  reason?: "INVALID_ID" | (string & {});
};

export type HydrateAttachmentEventUnion =
  | HydrateAttachmentById
  | HydrateAttachmentByIdAck
  | HydrateAttachments
  | HydrateAttachmentsAck
  | HydrateAttachmentsByConversationId
  | HydrateAttachmentsByConversationIdAck;

export type HydrateAttachmentEventRecord<T extends boolean = false> = UTR<
  HydrateAttachmentEventUnion,
  "type",
  T
>;
