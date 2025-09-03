import type { Attachment, Message as MessagePrisma } from "@prisma/client";
import type { Providers, RTC } from "@t3-chat-clone/types";

export type ClientWorkupProps = {
  isSet: Record<Providers, boolean>;
  isDefault: Record<Providers, boolean>;
};

export type UIMessage =
  RTC<MessagePrisma, "conversationId"> & {
    attachments?: Pick<
      RTC<Attachment, "filename">,
      "id" | "filename" | "mime" | "size" | "cdnUrl" | "assetType" | "ext"
    >[];
  }

export type RxnUnion =
  | "liked"
  | "disliked"
  | "unliked"
  | "undisliked"
  | "switch-to-liked"
  | "switch-to-disliked";
