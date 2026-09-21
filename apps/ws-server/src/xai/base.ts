import type { PrismaService } from "@/prisma/index.ts";
import type { DocumentStatus } from "@/xai/types.ts";
import type { ProviderDocState } from "@slipstream/db/enums-node";
import type { GrokModelIdUnion } from "@slipstream/types";

export class GrokBaseService {
  constructor(protected prisma: PrismaService) {}
  protected readonly baseUrl = "https://api.x.ai/v1/responses";
  protected readonly baseImgGenUrl = "https://api.x.ai/v1/images/generations";
  protected readonly baseImgEditsUrl = "https://api.x.ai/v1/images/edits";
  protected readonly managementUrl =
    "https://management-api.x.ai/v1/collections";
  protected xaiURI(collection_id: string, file_id: string) {
    return `collections://${collection_id}/files/${file_id}` as const;
  }
  protected xaiToDbState = {
    DOCUMENT_STATUS_FAILED: "FAILED",
    DOCUMENT_STATUS_PROCESSED: "ACTIVE",
    DOCUMENT_STATUS_PROCESSING: "PROCESSING",
    DOCUMENT_STATUS_UNKNOWN: "PENDING"
  } as const satisfies Record<DocumentStatus, ProviderDocState>;

  protected canUseFunctionTools(m: GrokModelIdUnion) {
    return !this.prisma.isGrokMultiAgentModel(m);
  }

  protected isGrokBuild(m: string) {
    return this.prisma.isGrokBuild(m);
  }

  protected isGrok4Model(m: string) {
    return (
      this.prisma.isGrokModel(m) &&
      !this.prisma.isGrokBuild(m) &&
      !this.prisma.isGrokImgModel(m) &&
      !this.prisma.isGrokVideoModel(m)
    );
  }
  /**
   *  grok-4.3 defaults to "low" (only grok-4.3 supports "none")
   *
   *  grok-4.5 and grok-4.6 default to "high"
   */
  protected reasoningByModel(m: string) {
    if (!this.prisma.isGrokModel(m)) return;
    if (!(m === "grok-4.6" || m === "grok-4.5" || m === "grok-4.3")) return;
    const base = {
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "xhigh"
    } as const;

    if (m === "grok-4.3") {
      return {
        ...base,
        none: "none"
      } as const;
    } else return base;
  }

  protected canViewDocs(model: GrokModelIdUnion) {
    return this.isGrok4Model(model) || this.isGrokBuild(model);
  }
}
