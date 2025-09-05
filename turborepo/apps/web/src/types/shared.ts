import type { $Enums, Message as MessagePrisma } from "@prisma/client";
import type { Providers, RTC } from "@t3-chat-clone/types";

export type ClientWorkupProps = {
  isSet: Record<Providers, boolean>;
  isDefault: Record<Providers, boolean>;
};

export type AttachmentSingleton = {
  size: number | null;
  conversationId: string | null;
  id: string;
  createdAt: Date;
  draftId: string | null;
  messageId: string | null;
  assetType: $Enums.AssetType;
  cdnUrl: string | null;
  publicUrl: string | null;
  versionId: string | null;
  filename: string | null;
  ext: string | null;
  mime: string | null;
};

export type UIMessage = RTC<MessagePrisma, "conversationId"> & {
  attachments?: AttachmentSingleton[];
};

export type RxnUnion =
  | "liked"
  | "disliked"
  | "unliked"
  | "undisliked"
  | "switch-to-liked"
  | "switch-to-disliked";

export type DynamicChatRouteProps =
  | {
      id: string;
      conversationId: string;
      userId: string | null;
      senderType: $Enums.SenderType;
      provider: $Enums.Provider;
      model: string | null;
      userKeyId: string | null;
      content: string;
      thinkingText: string | null;
      thinkingDuration: number | null;
      liked: boolean | null;
      disliked: boolean | null;
      tryAgain: boolean | null;
      createdAt: Date;
      updatedAt: Date;
      attachments?: AttachmentSingleton[];
    }[]
  | null;
