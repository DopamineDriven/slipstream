import type { ExtractService } from "@/extract/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import { PrismaCliConfigService } from "@/prisma/cli-config.ts";
import type { PrismaDbService } from "@slipstream/db/factory";

/**
 * **Inheritance chain**
 *
 * [*parent*]
 *
 * `@/prisma/index.ts`
 *
 *  ⬆
 *
 * `@/prisma/cli-config.ts`
 *
 *  ⬆
 *
 * `@/prisma/convo-list.ts`
 *
 *  ⬆
 *
 * `@/prisma/convo-memory-service.ts`
 *
 *  ⬆
 *
 * `@/prisma/convo-hydration.ts`
 *
 *  ⬆
 *
 * `@/prisma/chat-response.ts`
 *
 *  ⬆
 *
 * `@/prisma/chat-request.ts`
 *
 *  ⬆
 *
 * `@/prisma/attachment.ts`
 *
 *  ⬆
 *
 * `@/prisma/user-store.ts`
 *
 *  ⬆
 *
 * `@/prisma/stt.ts`
 *
 *  ⬆
 *
 * `@/prisma/tts.ts`
 *
 *  ⬆
 *
 * `@/prisma/provider-store.ts`
 *
 *  ⬆
 *
 * `@/prisma/attachment-provider.ts`
 *
 *  ⬆
 *
 * `@/prisma/user-meta.ts`
 *
 *  ⬆
 *
 * `@/prisma/utils.ts`
 *
 * [*child*]
 */

export class PrismaService extends PrismaCliConfigService {
  constructor(
    prisma: PrismaDbService,
    extractor: ExtractService,
    logger: LoggerService,
    isProd: boolean
  ) {
    super(prisma, extractor, logger, isProd);
  }
}
