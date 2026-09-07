"use server";

import { prismaClient } from "@/lib/prisma";
import { safeErr } from "@/lib/safe-err";
import { getSession } from "@/utils/auth";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { Providers } from "@slipstream/types";
import { EncryptionService } from "@slipstream/encryption";
import { KeyValidator } from "@slipstream/key-validator";
import { isProvider, toPrismaFormat } from "@slipstream/types";

interface RtProps {
  id: string;
  userId: string;
  provider: $Enums.Provider;
  apiKey: string;
  iv: string;
  authTag: string;
  label: string | null;
  createdAt: Date;
  updatedAt: Date;
  isDefault: boolean;
}

function isAsDefault(s: string) {
  return s === "true" || s === "false";
}

function handleAsDefault(asDefault: FormDataEntryValue | null) {
  if (asDefault && typeof asDefault === "string" && isAsDefault(asDefault)) {
    if (asDefault === "false") return false;
    else return true;
  } else return false;
}

export async function upsertApiKey(formdata: FormData) {
  const authData = await getSession();
  const userId = authData?.user?.id;
  if (!userId) {
    return { success: false, payload: "unauthorized" } as const;
  }

  const getKey = formdata.get("apiKey");
  const getProvider = formdata.get("provider");
  const asDefault = formdata.get("asDefault");

  if (typeof getProvider !== "string") {
    return { success: false, payload: `no input provider provided` } as const;
  }
  if (!isProvider(getProvider)) {
    return {
      success: false,
      payload: `invalid provider input ${getProvider}`
    } as const;
  }

  if (typeof getKey !== "string") {
    return {
      success: false,
      payload: "input api key is not of type string"
    } as const;
  }

  const validator = new KeyValidator(getKey, getProvider);

  const { isValid, message } = await validator.validateProvider();

  if (isValid) {
    const cryptService = new EncryptionService(process.env.ENCRYPTION_KEY);

    const { authTag, data, iv } = await cryptService.encryptText(getKey);
    const isDefault = handleAsDefault(asDefault);

    let rt: RtProps;

    const upsertArgs = {
      create: {
        apiKey: data,
        authTag,
        iv,
        isDefault,
        provider: toPrismaFormat(getProvider),
        userId
      },
      update: {
        apiKey: data,
        iv,
        authTag,
        isDefault
      },
      where: {
        userId_provider: {
          provider: toPrismaFormat(getProvider),
          userId
        }
      }
    };

    if (isDefault) {
      rt = await prismaClient.$transaction(async t => {
        await t.userKey.updateMany({
          where: {
            userId,
            isDefault,
            NOT: { provider: toPrismaFormat(getProvider) }
          },
          data: { isDefault: false }
        });
        return await t.userKey.upsert(upsertArgs);
      });
    } else {
      rt = await prismaClient.userKey.upsert(upsertArgs);
    }
    return { success: true, payload: rt.id } as const;
  } else
    return {
      success: false,
      payload: `validator message: ${message}`
    } as const;
}

export async function deleteApiKey(f: FormData) {
  const authData = await getSession();
  const userId = authData?.user?.id;
  if (!userId) {
    return { success: false, payload: "unauthorized" } as const;
  }

  const getProvider = f.get("provider");

  if (typeof getProvider !== "string") {
    return { success: false, payload: `no input provider provided` } as const;
  }

  if (!isProvider(getProvider)) {
    return {
      success: false,
      payload: `invalid provider input ${getProvider}`
    } as const;
  }


  const deleteIt = await prismaClient.userKey.deleteMany({
    where: { userId, provider: toPrismaFormat(getProvider) }
  });
  return {
    success: true,
    payload: `deleted ${deleteIt.count} api key for ${getProvider}`
  } as const;
}

export async function getDecryptedApiKeyOnEdit(provider: Providers) {
  const authData = await getSession();
  const userId = authData?.user?.id;
  if (!userId) {
    return {
      success: false,
      payload: `unauthorized`
    } as const;
  }
  const cryptService = new EncryptionService(process.env.ENCRYPTION_KEY);
  const rec = await prismaClient.userKey.findUnique({
    where: { userId_provider: { userId, provider: toPrismaFormat(provider) } },
    select: { authTag: true, apiKey: true, iv: true }
  });
  if (!rec) {
    return {
      success: false,
      payload: `No API key configured for ${provider}!`
    } as const;
  }
  try {
    const decrypted = await cryptService.decryptText({
      authTag: rec.authTag,
      data: rec.apiKey,
      iv: rec.iv
    });

    return { success: true, payload: decrypted } as const;
  } catch (err) {
    console.error(`Decryption failed for: ${provider}, ` + safeErr(err));
    return {
      success: false,
      payload: `Failed to Decrypt API key for ${provider}`
    } as const;
  }
}
