import type { Providers } from "@/types/chat-ws";
import type { ClientWorkupProps, RecordCountsProps } from "@/types/shared";
import type { UserKey } from "@prisma/client";
import { prismaClient } from "@/lib/prisma";

function formatProps(props: RecordCountsProps) {
  const isDefault = Object.fromEntries(
    Object.entries(props.isDefault).map(([t, o]) => {
      return [t as Providers, o === 0 ? false : true] as const;
    })
  );
  const isSet = Object.fromEntries(
    Object.entries(props.isSet).map(([t, o]) => {
      return [t as Providers, o === 0 ? false : true] as const;
    })
  );
  return { isSet, isDefault } as ClientWorkupProps;
}

function handleExistingKeysForClient(props: UserKey[]) {
  const initialProps = {
    isSet: {
      openai: 0,
      grok: 0,
      gemini: 0,
      anthropic: 0
    },
    isDefault: { openai: 0, grok: 0, gemini: 0, anthropic: 0 }
  };
  props.forEach(function (res) {
    const provider = res.provider.toLowerCase() as Providers;
    const isDefault = res.isDefault;
    initialProps.isSet[provider] += 1;
    initialProps.isDefault[provider] += isDefault ? 1 : 0;
  });
  return formatProps(initialProps);
}

export async function getClientApiKeys(userId: string) {
  const data = await prismaClient.userKey.findMany({ where: { userId } });
  return handleExistingKeysForClient(data);
}
