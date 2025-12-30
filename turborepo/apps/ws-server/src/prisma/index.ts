import { ExtractService } from "@/extract/index.ts";
import { PrismaChatService } from "@/prisma/chat.ts";
import { DbService } from "@slipstream/db/node";

/**
 * **Inheritance chain**
 *
 * [*parent*]
 *
 * `@/prisma/index.ts`
 *
 *  ⬆
 *
 * `@/prisma/chat.ts`
 *
 *  ⬆
 *
 * `@/prisma/user-meta.ts`
 *
 *  ⬆
 *
 * `@/prisma/attachment.ts`
 *
 *  ⬆
 *
 * `@/prisma/attachment-provider.ts`
 *
 *  ⬆
 *
 * `@/prisma/utils.ts`
 *
 * [*child*]
 */

export class PrismaService extends PrismaChatService {
  constructor(
    prisma: DbService,
    extractor: ExtractService,
     isProd: boolean
  ) {
    super(prisma, extractor, isProd);
  }
}

/**
 * If needed (future)
 *
   // Base mixin with Prisma client
  export function PrismaBaseMixin<TBase extends Constructor>(Base: TBase) {
    return class extends Base {
      protected prismaClient: PrismaClient;
      // ... base utilities
    };
  }

  // Feature-specific mixins
  export function AttachmentMixin<TBase extends Constructor<any[], HasPrisma>>(Base: TBase) {
    return class extends Base {
      async createAttachment(...) {  }
      async updateAttachment(...) {  }
    };
  }

  export function UserMetaMixin<TBase extends Constructor<any[], HasPrisma>>(Base: TBase) {
    return class extends Base {
      async handleApiKeyLookup(...) {  }
      // ... user meta methods
    };
  }

  // Compose as needed
  export class PrismaService extends ChatMixin(
    UserMetaMixin(
      AttachmentMixin(
        AttachmentProviderMixin(
          UtilsMixin(PrismaBaseMixin(ServiceBase))
        )
      )
    )
  ) {}

 */
