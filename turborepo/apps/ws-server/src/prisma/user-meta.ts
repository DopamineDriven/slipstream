import type { UserData } from "@/types/index.ts";
import { ExtractService } from "@/extract/index.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";
import { DbService } from "@slipstream/db/node";
import { EncryptionService } from "@slipstream/encryption";
import { PrismaAttachmentService } from "./attachment.ts";
import * as dotenv from "dotenv";

dotenv.config({quiet: true});

export class PrismaUserMetaService extends PrismaAttachmentService {
  protected encryption: EncryptionService;
  protected userProviderKeyMap = new Map<
    Lowercase<$Enums.Provider>,
    string | undefined
  >();
  constructor(
    prisma: DbService,
    extractor: ExtractService
  ) {
    super(prisma, extractor);
    this.encryption = new EncryptionService(process.env.ENCRYPTION_KEY);
  }

  /**
   * Count user messages sent in the past window that used fallback (no user api key for targeted provider).
   * Default window is last 24 hours and only counts USER-sent messages.
   */
  public async countFallbackUserMessages(
    userId: string,
    windowMs = 24 * 60 * 60 * 1000
  ): Promise<number> {
    const since = new Date(Date.now() - windowMs);
    return this.prismaClient.message.count({
      where: {
        userId,
        senderType: "USER",
        userKeyId: null,
        createdAt: { gte: since }
      }
    });
  }

  public async injectClientApiKeyProps(userId: string) {
    const data = await this.prismaClient.userKey.findMany({
      where: { userId }
    });
    return this.handleExistingKeysForClient(data);
  }

  public async getAndValidateUserSessionById(id: string) {
    const res = await this.prismaClient.user.findUniqueOrThrow({
      where: { id },
      include: { sessions: true }
    });

    const sesh = res?.sessions.sort(
      (a, b) => b?.expires?.getTime() - a.expires.getTime()
    );
    let isValid = false;
    if (sesh?.[0]) {
      isValid = sesh[0].expires.getTime() > new Date(Date.now()).getTime();
    }
    return {
      userId: id,
      email: res.email,
      isValid
    };
  }

  public async updateProfile({
    city,
    country,
    latlng,
    region,
    tz,
    postalCode,
    userId
  }: { [P in keyof UserData]-?: UserData[P] } & { userId: string }) {
    const [lat, lng] = this.handleLatLng(decodeURIComponent(latlng)); // formatted `${lat},${lng}` in the cookie value for the key latlng
    await this.prismaClient.profile.upsert({
      where: { userId },
      create: {
        city,
        country,
        userId: userId,
        timezone: tz,
        region,
        postalCode,
        lat,
        lng
      },
      update: {
        city,
        country,
        region,
        userId,
        postalCode,
        timezone: tz,
        lat,
        lng
      }
    });
  }

  /**
   * ```ts
   * (property) userProviderKeyMap: Map<`${string}_openai` | `${string}_grok` | `${string}_gemini` | `${string}_anthropic`, string | undefined>
   * ```
   */

  public async handleApiKeyLookup(
    provider: Lowercase<$Enums.Provider>,
    userId?: string
  ) {
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
}
