import { createReadStream } from "node:fs";
import type { LoggerService } from "@/logger/index.ts";
import type { OpenAIFileSearchToolInput } from "@/openai/types.ts";
import type { PrismaService } from "@/prisma/index.ts";
import type { UserStoreVectorService } from "@/store/vector-store.ts";
import type {
  InferPromiseRT,
  ProviderOpenaiRequestEntity
} from "@/types/index.ts";
import type { OpenAI } from "openai";
import type { ResponseInput } from "openai/resources/responses/responses.mjs";
import { SakanaStoreService } from "@/sakana/store.ts";
import type { S3Storage } from "@slipstream/storage-s3";
import type {
  AttachmentSingleton,
  MessageSingleton,
  SakanaModelIdUnion
} from "@slipstream/types";

export class SakanaWorkupService extends SakanaStoreService {
  constructor(
    logger: LoggerService,
    prisma: PrismaService,
    userStoreVector: UserStoreVectorService,
    apiKey: string,
    s3: S3Storage
  ) {
    super(logger, prisma, userStoreVector, apiKey, s3);
  }

  protected formatSystemInstruction(isNewChat: boolean, systemPrompt?: string) {
    if (isNewChat) {
      return systemPrompt;
    }

    const note =
      "Note: Previous responses may be tagged with their source model for context in the form of [PROVIDER/MODEL] notation.";

    return systemPrompt ? `${systemPrompt}\n\n${note}` : note;
  }
}
