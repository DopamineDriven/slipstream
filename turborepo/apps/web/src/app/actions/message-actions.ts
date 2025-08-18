"use server";

import type { RxnUnion } from "@/types/shared";
import { prismaClient } from "@/lib/prisma";

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

function handleAction(action: RxnUnion) {
  if (action === "disliked") {
    return { disliked: true } as const as { disliked: true };
  } else if (action === "liked") {
    return { liked: true } as const as { liked: true };
  } else if (action === "undisliked") {
    return { disliked: false } as const as { disliked: false };
  } else if (action === "unliked") {
    return { liked: false } as const as { liked: false };
  } else if (action === "switch-to-disliked") {
    return { disliked: true, liked: false } as const as {
      disliked: true;
      liked: false;
    };
  } else {
    return { disliked: false, liked: true } as const as {
      disliked: false;
      liked: true;
    };
  }
}
export async function rxnAction(action: RxnUnion, dataMsgId: string) {
  const msgId = extractId(dataMsgId);

  return await prismaClient.message.update({
    where: { id: msgId },
    data: handleAction(action)
  });
}
