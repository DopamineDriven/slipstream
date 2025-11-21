import type { BigIntToCompatProps } from "@/types/index.ts";
import { ModelService } from "@/models/index.ts";
import type { $Enums, UserKey } from "@slipstream/db/node/generated/client";
import type {
  ClientContextWorkupProps,
  RecordCountsProps
} from "@slipstream/types";
import { DbService, PrismaClient } from "@slipstream/db/node";

export class PrismaUtilsService extends ModelService {
  protected readonly prismaClient: PrismaClient;

  constructor(prisma: DbService) {
    super();
    this.prismaClient = prisma.prismaClient;
  }

  protected formatClientContextProps(props: RecordCountsProps) {
    const isDefault = Object.fromEntries(
      Object.entries(props.isDefault).map(([t, o]) => {
        return [
          t as Lowercase<$Enums.Provider>,
          o === 0 ? false : true
        ] as const;
      })
    );
    const isSet = Object.fromEntries(
      Object.entries(props.isSet).map(([t, o]) => {
        return [
          t as Lowercase<$Enums.Provider>,
          o === 0 ? false : true
        ] as const;
      })
    );
    return { isSet, isDefault } as ClientContextWorkupProps;
  }

  protected handleExistingKeysForClient(props: UserKey[]) {
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
    return this.formatClientContextProps(
      initialProps
    ) satisfies ClientContextWorkupProps;
  }

  protected parseDraftId(draftId: string) {
    if (/^(?:[A-Za-z0-9_-]+~){3}(?:0|[1-9][0-9]*)$/.test(draftId) === false) {
      throw new Error(`invalid draftId ${draftId}`);
    }
    const toArr = draftId.split("~");

    return toArr.map((v, o) =>
      o !== toArr.length - 1 ? v : Number.parseInt(v, 10)
    ) as [string, string, string, number];
  }

  protected bigintToNumber<
    const T extends "image_gen_request" | "ai_chat_request" =
      | "image_gen_request"
      | "ai_chat_request"
  >(
    _target: T,
    props: BigIntToCompatProps<T>["props"]
  ): BigIntToCompatProps<T>["rt"] {
    const { messages, ...rest } = props;
    const msgArr = messages.map(t => {
      const { attachments, ...rest } = t;

      const cleanAttachments = attachments.map(att => {
        const cleanLinks = att?.providerLinks?.map(v => {
          return {
            ...v,
            size: v.size ? Number(v.size) : null
          };
        });
        const size =
          typeof att.size === "bigint"
            ? att.size === 0n
              ? 0
              : Number(att.size)
            : null;
        const cleaned = {
          ...att,
          size,
          providerLinks: cleanLinks ?? undefined
        };

        return cleaned;
      });
      return { attachments: cleanAttachments, ...rest };
    });
    return { messages: msgArr, ...rest } as BigIntToCompatProps<T>["rt"];
  }

  protected toCompatPropsExtened<
    const T extends "image_gen_request" | "ai_chat_request" =
      | "image_gen_request"
      | "ai_chat_request"
  >(
    _target: T,
    rt: BigIntToCompatProps<T>["rt"],
    assetInfo: {
      /**
       * count of assets bound to the current user messsage
       */
      jobId?: string;
      requestMessageId?: string;
      assetCounts: number;
      assets?: {
        type: $Enums.AssetType;
        compatStatus: $Enums.CompatStatus;
        url: string;
        mime: string;
        ext: string;
      }[];
    }
  ): BigIntToCompatProps<T>["rtExtended"] {
    return {
      ...rt,
      ...assetInfo
    } satisfies BigIntToCompatProps<T>["rtExtended"];
  }

  protected convoId(conversationId?: string | null) {
    return conversationId && conversationId !== "new-chat"
      ? conversationId
      : null;
  }
}
