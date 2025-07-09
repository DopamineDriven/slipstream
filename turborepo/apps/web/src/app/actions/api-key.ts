"use server";

import type { Providers } from "@/types/chat-ws";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prismaClient } from "@/lib/prisma";
import { toPrismaFormat } from "@/types/chat-ws";
import { EncryptionService } from "@t3-chat-clone/encryption";
import { KeyValidator } from "@t3-chat-clone/key-validator";

function handleAsDefault(asDefault: FormDataEntryValue | null) {
  if (asDefault && typeof asDefault === "string") {
    const booleanish = asDefault as `${true}` | `${false}`;
    if (booleanish === "false") return false;
    else return true;
  } else return false;
}

export async function upsertApiKey(formdata: FormData) {
  const getKey = formdata.get("apiKey");
  const getProvider = formdata.get("provider");
  const authData = await auth();
  const userId = authData?.user?.id;
  const asDefault = formdata.get("asDefault");
  if (typeof getKey !== "string") {
    return {
      success: false,
      id: "input api key is not of type string"
    };
  }
  const validator = new KeyValidator(getKey, getProvider as Providers);
  const { isValid, message } = await validator.validateProvider();
  if (getProvider && typeof getProvider === "string" && userId && isValid) {
    const cryptService = new EncryptionService();
    const { authTag, data, iv } = await cryptService.encryptText(getKey);
    const createUserKey = await prismaClient.userKey.upsert({
      create: {
        apiKey: data,
        authTag,
        iv,
        isDefault: handleAsDefault(asDefault),
        provider: toPrismaFormat(getProvider as Providers),
        userId
      },
      update: {
        apiKey: data,
        iv,
        authTag,
        isDefault: handleAsDefault(asDefault)
      },
      where: {
        userId_provider: {
          provider: toPrismaFormat(getProvider as Providers),
          userId
        }
      }
    });

    revalidatePath("/settings");
    return { success: true, id: createUserKey.id } as const;
  } else return { success: false, id: message } as const;
}

/**
 * handles the scenario when a user wants to inspect and/or edit an existing (stored) api key --
 * they understandably expect to see it just as it was when they input the value -- decrypted
 * that said, this doesn't necessitate a database update event by default; sometimes people
 * click edit just to view the key they have stored and cross-reference it with a key value they have
 * open in another tab or program to verify it's the key they intended to be using. In these cases, once
 * they verify what they wanted to verify, they'll just click cancel or done (depending on available ui options).
 * THIS action handles those scenarios if an actual edit does happen, the `upsertApiKey` action will be triggered
 */
export async function getDecryptedApiKeyOnEdit(
  provider: Providers
): Promise<string> {
  const cryptService = new EncryptionService();
  const authData = await auth();
  const userId = authData?.user?.id;
  if (!userId) throw new Error("unauthorized");
  const rec = await prismaClient.userKey.findUnique({
    where: { userId_provider: { userId, provider: toPrismaFormat(provider) } }
  });
  if (!rec) {
    throw new Error(`No API key configured for ${provider}!`);
  }
  try {
    revalidatePath("/settings");
    return await cryptService.decryptText({
      authTag: rec.authTag,
      data: rec.apiKey,
      iv: rec.iv
    });
  } catch (err) {
    if (err instanceof Error) {
      console.error(`Decryption failed for: ${provider}, ` + err.message);
      throw new Error(`Failed to Decrypt API key for ${provider}`);
    } else throw new Error(`Failed to Decrypt api key for ${provider}`);
  }
}
