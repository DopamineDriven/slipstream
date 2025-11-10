"use server";

import { refresh } from "next/cache";
import { handleBigintToNumber } from "@/lib/bigint-to-number";
import { prismaClient } from "@/lib/prisma";
import { rxnObject } from "@/lib/rxn-object";

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
      imageGenJob: true,
      attachments: {
        orderBy: { createdAt: "asc" },
        include: { image: true, document: true, imageGenOutput: true }
      }
    }
  });
  refresh();
  return handleBigintToNumber(res);
}
