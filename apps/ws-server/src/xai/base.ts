import type { PrismaService } from "@/prisma/index.ts";
import type { InputReasoningProps } from "@/xai/responses-types.ts";
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
    return !(
      this.prisma.isGrokMultiAgentModel(m) ||
      this.prisma.isGrokImgModel(m) ||
      this.prisma.isGrokVideoModel(m)
    );
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
   * keep grok-4.20-multi-agent-0309 to "low" to not spend a fortune on subagents
   *
   *  grok-4.3 defaults to "low" (only grok-4.3 supports "none")
   *
   *  grok-4.5, grok-4.6, and grok-4.7 default to "high"
   */
  protected reasoningByModel(m?: string) {
    if (!m) return;
    if (!this.prisma.isGrokModel(m)) return;
    else if (!this.prisma.isGrokReasoningEffortModel(m)) return;
    else if (m === "grok-4.20-multi-agent-0309") {
      return {
        effort: "low"
      } satisfies InputReasoningProps<"grok-4.20-multi-agent-0309">;
    } else if (m === "grok-4.3") {
      return {
        effort: "low"
      } satisfies InputReasoningProps<"grok-4.3">;
    } else if (m === "grok-4.5") {
      return {
        effort: "high"
      } satisfies InputReasoningProps<"grok-4.5">;
    } else {
      return {
        effort: "xhigh"
      } satisfies InputReasoningProps<"grok-4.6" | "grok-4.7">;
    }
  }

  protected canViewDocs(model: GrokModelIdUnion) {
    return this.isGrok4Model(model) || this.isGrokBuild(model);
  }
}
