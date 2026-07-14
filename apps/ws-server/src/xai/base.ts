import type { DocumentStatus } from "@/xai/types.ts";
import type { ProviderDocState } from "@slipstream/db/enums-node";
import type { GrokModelIdUnion } from "@slipstream/types";

export class GrokBaseService {
  protected readonly baseUrl = "https://api.x.ai/v1/responses";
  protected readonly baseImgGenUrl = "https://api.x.ai/v1/images/generations";
  protected readonly baseImgEditsUrl = "https://api.x.ai/v1/images/edits";
  protected readonly managementUrl = "https://management-api.x.ai/v1/collections";
  protected xaiURI(collection_id: string, file_id: string) {
    return `collections://${collection_id}/files/${file_id}` as const;
  }
  protected xaiToDbState = {
    DOCUMENT_STATUS_FAILED: "FAILED",
    DOCUMENT_STATUS_PROCESSED: "ACTIVE",
    DOCUMENT_STATUS_PROCESSING: "PROCESSING",
    DOCUMENT_STATUS_UNKNOWN: "PENDING"
  } as const satisfies Record<DocumentStatus, ProviderDocState>;

  protected isMultiAgent(m: string) {
    return m === "grok-4.20-multi-agent-0309";
  }

  protected canUseFunctionTools(m: GrokModelIdUnion) {
    return !this.isMultiAgent(m);
  }

  protected isGrokBuild(m: string) {
    return m === "grok-build-0.1";
  }

  protected isGrok4Point5(m: string) {
    return m === "grok-4.5";
  }

  protected isGrok4Point3(m: string) {
    return m === "grok-4.3";
  }

  protected is420BetaModel(m: string) {
    return (
      m === "grok-4.20-0309-reasoning" ||
      m === "grok-4.20-0309-non-reasoning" ||
      this.isGrok4Point5(m) ||
      this.isGrok4Point3(m) ||
      this.isMultiAgent(m) ||
      this.isGrokBuild(m)
    );
  }

  protected isGrok4Model(m: string) {
    return this.is420BetaModel(m);
  }

  protected isNativeImgModel(m: string) {
    return m === "grok-imagine-image" || m === "grok-imagine-image-quality";
  }

  protected isNativeVideoModel(m: string) {
    return m === "grok-imagine-video" || m === "grok-imagine-video-1.5";
  }

  protected canViewImgs(model: string) {
    return (
      this.isNativeImgModel(model) ||
      this.isNativeVideoModel(model) ||
      this.isGrok4Model(model) ||
      this.isGrokBuild(model) ||
      this.is420BetaModel(model)
    );
  }

  protected canViewDocs(model: GrokModelIdUnion) {
    return (
      this.isGrok4Model(model) ||
      this.is420BetaModel(model) ||
      this.isGrokBuild(model)
    );
  }
}
