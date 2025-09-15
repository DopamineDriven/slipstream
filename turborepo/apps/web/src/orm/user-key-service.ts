import type { PrismaClientWithAccelerate } from "@/lib/prisma";
import type { $Enums, UserKey } from "@prisma/client";
import type {
  ClientContextWorkupProps,
  Provider,
  RecordCountsProps
} from "@slipstream/types";
import { ErrorHelperService } from "@/orm/err-helper";

export class PrismaUserKeyService extends ErrorHelperService {
  constructor(public prismaClient: PrismaClientWithAccelerate) {
    super();
  }
  public formatProps(props: RecordCountsProps) {
    const isDefault = Object.fromEntries(
      Object.entries(props.isDefault).map(([t, o]) => {
        return [t as Provider, o === 0 ? false : true] as const;
      })
    );
    const isSet = Object.fromEntries(
      Object.entries(props.isSet).map(([t, o]) => {
        return [t as Provider, o === 0 ? false : true] as const;
      })
    );
    return { isSet, isDefault } as ClientContextWorkupProps;
  }
  public handleExistingKeysForClient(props: UserKey[]) {
    const initialProps = {
      isSet: {
        openai: 0,
        grok: 0,
        gemini: 0,
        anthropic: 0,
        vercel: 0,
        meta: 0
      },
      isDefault: {
        vercel: 0,
        meta: 0,
        openai: 0,
        grok: 0,
        gemini: 0,
        anthropic: 0
      }
    };
    props.forEach(function (res) {
      const provider = res.provider.toLowerCase() as Lowercase<$Enums.Provider>;
      const isDefault = res.isDefault;
      initialProps.isSet[provider] += 1;
      initialProps.isDefault[provider] += isDefault ? 1 : 0;
    });
    return this.formatProps(initialProps) satisfies ClientContextWorkupProps;
  }

  public apiKeysCacheTag(userId: string) {
    return [`user_api_keys_${userId}`] as const;
  }

  public async getClientApiKeys(userId: string) {
    const data = await this.prismaClient.userKey.findMany({
      where: { userId },
      cacheStrategy: {
        ttl: 60,
        swr: 300,
        tags: this.apiKeysCacheTag(userId)
      }
    });
    return this.handleExistingKeysForClient(data);
  }
}
