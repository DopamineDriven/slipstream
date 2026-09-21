import { ProviderValidation } from "@slipstream/img-gen";

export const imgCtx = new ProviderValidation();

export function imgGenCapableModel(s: string) {
  return (
    imgCtx.grokImgGenCapable(s) ||
    imgCtx.geminiImgGenCapable(s) ||
    imgCtx.openAIImgGenCapable(s) ||
    imgCtx.metaImgGenCapable(s)
  );
}
