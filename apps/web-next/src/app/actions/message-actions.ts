"use server";

import { refresh } from "next/cache";
import { prismaClient } from "@/lib/prisma";
import { rxnObject } from "@/lib/rxn-object";
import type {
  AttachmentProviderSingleton,
  MessageSingleton
} from "@slipstream/types";

function handleBigintToNumber(message: MessageSingleton<false | true>) {
  const { attachments, ...rest } = message;
  const mapIt = attachments.map(t => {
    const { size, ...p } = t;
    const mapProviderSingleton = p?.providerLinks?.map(v => {
      const { size, attachment: _att, ...s } = v;

      return {
        size: size ? Number(size) : null,
        ...s
      } satisfies AttachmentProviderSingleton<true>;
    });
    return {
      ...p,
      size: size ? Number(size) : null,
      providerLinks: mapProviderSingleton
    };
  });
  return {
    attachments: mapIt,
    ...rest
  } satisfies MessageSingleton<true> as MessageSingleton<true>;
}

function extractId(dataMsgId: string) {
  if (/^(?:msg-)+(?:\w+)$/gim.test(dataMsgId)) {
    return dataMsgId
      .split(/(?:(msg-)+){1,2}/gim)
      .map(t => t)
      .filter(tt => !tt.startsWith("msg-"))
      .filter(ttt => ttt.length > 1)?.[0];
  } else {
    return dataMsgId;
  }
}

export async function rxnAction(
  action: keyof typeof rxnObject,
  dataMsgId: string
) {
  const msgId = extractId(dataMsgId);
  const res = await prismaClient.message.update({
    where: { id: msgId },
    data: rxnObject[action],
    include: {
      messageBlocks: true,
      imageGenJob: true,
      attachments: {
        orderBy: { createdAt: "asc" },
        include: {
          image: true,
          document: true,
          imageGenOutput: true,
          audio: true
        }
      }
    }
  });
  refresh();
  return handleBigintToNumber(res);
}
