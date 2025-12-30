import type { BigIntToCompatProps } from "@/types/index.ts";
import { ModelService } from "@/models/index.ts";
import type { $Enums } from "@slipstream/db/node/generated/client";

import { DbService, PrismaClient } from "@slipstream/db/node";

export class PrismaUtilsService extends ModelService {
  protected readonly prismaClient: PrismaClient;

  constructor(prisma: DbService,     public isProd: boolean) {
    super();
    this.prismaClient = prisma.prismaClient;
  }


  public getEnv() {
    return this.isProd === true ? ("prod" as const) : ("dev" as const);
  }

  public vectorStoreDisplayName(userId: string){
    const env = this.getEnv();
    return `${env}-${userId}`;
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
