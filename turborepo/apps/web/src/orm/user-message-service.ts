import type { PrismaClientWithAccelerate } from "@/lib/prisma";
import type { $Enums, Conversation, Message } from "@prisma/client";
import { ErrorHelperService } from "@/orm/err-helper";

export class PrismaUserMessageService extends ErrorHelperService {
  constructor(public prismaClient: PrismaClientWithAccelerate) {
    super();
  }

  public async getRecentConversationsByUserId(userId: string): Promise<
    {
      id: string;
      userId: string;
      userKeyId: string | null;
      title: string | null;
      createdAt: Date;
      updatedAt: Date;
      branchId: string | null;
      parentId: string | null;
      isShared: boolean;
      shareToken: string | null;
    }[]
  > {
    return await this.prismaClient.conversation.findMany({
      where: { userId },
      take: 15,
      orderBy: [{ updatedAt: "desc" }]
    });
  }
  public async getMessagesByConversationId(
    conversationId: string
  ): Promise<null | (Conversation & { messages: Message[] })> {
    return await this.prismaClient.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: true }
    });
  }
}
export type M = {
  model: string | null;
  id: string;
  userId: string | null;
  userKeyId: string | null;
  createdAt: Date;
  updatedAt: Date;
  conversationId: string;
  senderType: SenderType;
  provider: Provider;
  content: string;
};
const sesh = {
  session: {
    user: {
      name: "Andrew Ross",
      email: "andrew@windycitydevs.io",
      image:
        "https://lh3.googleusercontent.com/a/ACg8ocISDUQaOSEJd8bLu0EqqA5Iov-S790vcXtUqWuxjxgJ_Aobeg=s96-c",
      id: "x1sa9esbc7nb1bbhnn5uy9ct"
    },
    expires: "2025-07-03T08:37:40.000Z",
    accessToken: "yeah.right.like.id.put.that.here",
    userId: "x1sa9esbc7nb1bbhnn5uy9ct"
  }
};

export type AuthReturnType = {
  session: {
    user: {
      name: string;
      email: string;
      image: string;
      id: string;
    };
    expires: string;
    accessToken: string;
    userId: string;
  };
};

export type SenderType = "USER" | "AI" | "SYSTEM";

type Provider = "OPENAI" | "GROK" | "GEMINI" | "ANTHROPIC";
export const k = {
  isSet: {
    openai: true,
    grok: false,
    gemini: true,
    anthropic: true
  },
  isDefault: {
    openai: true,
    grok: false,
    gemini: false,
    anthropic: false
  }
};
