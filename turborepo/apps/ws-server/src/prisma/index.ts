import { ConditionalToRequired, RemoveFields } from "@d0paminedriven/fs";
import { withAccelerate } from "@prisma/extension-accelerate";
import * as dotenv from "dotenv";
import type {
  AIChatError,
  AIChatRequest,
  AIChatResponse,
  UserData
} from "@/types/index.ts";
import { PrismaClient } from "@/generated/client/client.ts";
import { Provider, SenderType } from "@/generated/client/enums.ts";
import { ModelService } from "@/models/index.ts";

dotenv.config();

export const prismaClient = new PrismaClient().$extends(withAccelerate());

export type PrismaClientWithAccelerate = typeof prismaClient;

export interface HandleAiChatRequestProps
  extends RemoveFields<ConditionalToRequired<AIChatRequest, "provider">, "type"> {
  userId: string;
}

export interface HandleAiChatResponseProps
  extends RemoveFields<ConditionalToRequired<AIChatResponse, "provider">, "type"> {}

export interface HandleAiChatErrorResponseProps
  extends ConditionalToRequired<AIChatError, "provider"> {}

export class PrismaService extends ModelService {
  constructor(public prismaClient: PrismaClientWithAccelerate) {
    super();
  }

  public async getAndValidateUserSessionByEmail(email: string) {
    const res = await this.prismaClient.user.findUnique({
      where: { email },
      include: { sessions: true }
    });
    const id = res?.id ?? "";
    const sesh = res?.sessions.sort(
      (a, b) => b.expires.getTime() - a.expires.getTime()
    );
    let isValid = false;
    if (sesh?.[0]) {
      isValid = sesh?.[0].expires.getTime() > new Date(Date.now()).getTime();
    }
    return {
      userId: id,
      isValid
    };
  }

  private async handleApiKey(
    data: RemoveFields<AIChatRequest, "type">,
    userId: string,
    provider: keyof typeof Provider
  ) {
    let keyRecordId: string | null = null;
    if (data.apiKey) {
      const keyRecord = await this.prismaClient.userKey.upsert({
        where: { userId_provider: { provider, userId } },
        create: { userId, provider, apiKey: data.apiKey },
        update: {}
      });
      keyRecordId = keyRecord.id;
    }
    return keyRecordId;
  }

  public async updateProfile({
    city,
    country,
    latlng,
    tz,
    userId
  }: { [P in keyof UserData]-?: UserData[P] } & { userId: string }) {
    const [latStr, lngStr] = latlng.split(",") as [string, string]; // formatted `${lat},${lng}` in the cookie value for the key latlng
     await this.prismaClient.profile.upsert({
      where: { userId },
      create: {
        city,
        country,
        userId: userId,
        timezone: tz,
        lat: Number.parseFloat(latStr),
        lng: Number.parseFloat(lngStr)
      },
      update: {
        city,
        country,
        userId,
        timezone: tz,
        lat: Number.parseFloat(latStr),
        lng: Number.parseFloat(lngStr)
      }
    });
  }

  public async handleAiChatRequest({
    userId,
    provider,
    ...data
  }: HandleAiChatRequestProps) {
    const userKeyId = await this.handleApiKey(
      data,
      userId,
      this.providerToPrismaFormat(provider)
    );

    if (data.conversationId === "new-chat") {
      return this.prismaClient.conversation.create({
        include: { messages: true, conversationSettings: true },
        data: {
          messages: {
            create: {
              content: data.prompt,
              provider: this.providerToPrismaFormat(provider),
              senderType: SenderType.USER,
              model: data.model,
              userId,
              userKeyId
            }
          },
          conversationSettings: {
            create: {
              topP: data.topP,
              systemPrompt: data.systemPrompt,
              temperature: data.temperature
            }
          },
          userKeyId,
          userId
        }
      });
    } else {
      return this.prismaClient.conversation.update({
        include: { messages: true, conversationSettings: true },
        where: { id: data.conversationId },
        data: {
          messages: {
            create: {
              content: data.prompt,
              senderType: SenderType.USER,
              provider: this.providerToPrismaFormat(provider),
              model: data.model,
              userId,
              userKeyId
            }
          },
          conversationSettings: {
            update: {
              topP: data.topP,
              systemPrompt: data.systemPrompt,
              temperature: data.temperature
            }
          },
          userId,
          userKeyId
        }
      });
    }
  }

  public async handleAiChatResponse({
    userId,
    provider,
    ...data
  }: HandleAiChatResponseProps) {
    return this.prismaClient.conversation.update({
      include: { messages: true, conversationSettings: true },
      where: { id: data.conversationId },
      data: {
        messages: {
          create: {
            content: data.chunk,
            senderType: SenderType.AI,
            provider: this.providerToPrismaFormat(provider),
            model: data.model,
            userId
          }
        },
        userId
      }
    });
  }
}

// const p = new PrismaService(prismaClient);

// p.handleAiChatRequest({
//   conversationId: "new-chat",
//   prompt: "why is the sky blue?",
//   type: "ai_chat_request",
//   provider: "openai",
//   model: "gpt-4.1-nano",
//   userId: "x1sa9esbc7nb1bbhnn5uy9ct"
// }).then(data => {
//   // conversationId that we can inject into the chunk event immediately for client context
//   data.id;
// });

// p.getAndValidateUserSessionByEmail("andrew@windycitydevs.io").then(res => {
//   console.log(res);
//   return res;
// });
