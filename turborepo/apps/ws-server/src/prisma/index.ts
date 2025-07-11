import type { UserData } from "@/types/index.ts";
import { PrismaClient } from "@/generated/client/client.ts";
import { SenderType } from "@/generated/client/enums.ts";
import { ModelService } from "@/models/index.ts";
import { withAccelerate } from "@prisma/extension-accelerate";
import * as dotenv from "dotenv";
import type {
  AIChatError,
  AIChatRequest,
  AIChatResponse,
  CTR,
  Providers,
  RemoveFields
} from "@t3-chat-clone/types";
import { EncryptionService } from "@t3-chat-clone/encryption";

dotenv.config();

export const prismaClient = new PrismaClient().$extends(withAccelerate());

export type PrismaClientWithAccelerate = typeof prismaClient;

export interface HandleAiChatRequestProps
  extends RemoveFields<CTR<AIChatRequest, "provider">, "type"> {
  userId: string;
}

export interface HandleAiChatResponseProps
  extends RemoveFields<CTR<AIChatResponse, "provider">, "type"> {}

export interface HandleAiChatErrorResponseProps
  extends CTR<AIChatError, "provider"> {}

export class PrismaService extends ModelService {
  private encryption: EncryptionService;
  constructor(public prismaClient: PrismaClientWithAccelerate) {
    super();
    this.encryption = new EncryptionService(process.env.ENCRYPTION_KEY);
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

  /**
   * ```ts
   * (property) userProviderKeyMap: Map<`${string}_openai` | `${string}_grok` | `${string}_gemini` | `${string}_anthropic`, string | undefined>
   * ```
   */
  private userProviderKeyMap = new Map<Providers, string | undefined>();

  public async handleApiKeyLookup(provider: Providers, userId?: string) {
    if (!userId) {
      this.userProviderKeyMap.clear();
      throw new Error("unauthorized");
    }
    const rec = await this.prismaClient.userKey.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: this.providerToPrismaFormat(provider)
        }
      }
    });
    if (!rec) {
      console.error(`No API key configured for ${provider}!`);
      return { apiKey: null, keyId: null };
    }
    try {
      const hasKey = this.userProviderKeyMap.get(provider);
      if (typeof hasKey !== "undefined") {
        return { apiKey: hasKey, keyId: rec.id };
      }

      const decrypted = await this.encryption.decryptText({
        authTag: rec.authTag,
        data: rec.apiKey,
        iv: rec.iv
      });

      this.userProviderKeyMap.set(provider, decrypted);

      return { apiKey: decrypted, keyId: rec.id };
    } catch (err) {
      if (err instanceof Error) {
        console.error(`Decryption failed for: ${provider}, ` + err.message);
        return { apiKey: null, keyId: null };
      } else return { apiKey: null, keyId: null };
    }
  }

  public async handleAiChatRequest({
    userId,
    provider,
    ...data
  }: HandleAiChatRequestProps) {
    const { keyId } = await this.handleApiKeyLookup(provider, userId);
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
              userKeyId: keyId
            }
          },
          conversationSettings: {
            create: {
              topP: data.topP,
              systemPrompt: data.systemPrompt,
              temperature: data.temperature
            }
          },
          userKeyId: keyId,
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
              userKeyId: keyId
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
          userKeyId: keyId
        }
      });
    }
  }

  public async handleAiChatResponse({
    userId,
    provider,
    ...data
  }: HandleAiChatResponseProps) {
    const { keyId } = await this.handleApiKeyLookup(provider, userId);
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
            userId,
            userKeyId: keyId
          }
        },
        userId,
        title: data.title,
        userKeyId: keyId
      }
    });
  }
}
