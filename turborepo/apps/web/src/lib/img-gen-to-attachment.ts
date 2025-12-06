import type {
  AIChatResponseImgGenFieldsFinal,
  AIChatResponseImgGenSubFields,
  AttachmentSingleton
} from "@slipstream/types";

function imgGenToAttachmentWorkup(
  tt:
    | AIChatResponseImgGenSubFields[]
    | AIChatResponseImgGenSubFields
    | undefined
):
  | (AttachmentSingleton<true> | undefined)[]
  | AttachmentSingleton<true>
  | undefined {
  if (Array.isArray(tt)) {
    return tt?.map(t => {
      if (!t.cdnUrl) return;
      return {
        ...t,
        assetType: "IMAGE",
        batchId: null,
        bucket: t.bucket,
        cacheControl: t.cacheControl,
        cdnUrl: t.cdnUrl,
        checksumAlgo: t.checksumAlgo,
        checksumSha256: t.checksumSha256,
        compatCdnUrl: t.compatCdnUrl,
        compatExt: t.compatExt,
        id: `attachment-${t.itemId ?? t.seriesId}-${t.index}`,
        compatKey: t.compatKey,
        key: t.key,
        versionId: t.versionId,
        compatMime: t.compatMime,
        compatReadyAt: t.compatReadyAt,
        compatS3ObjectId: t.s3ObjectId,
        s3LastModified: t.s3LastModified,
        compatStatus: "ALIASED",
        compatVersionId: t.versionId,
        contentDisposition: t.contentDisposition,
        contentEncoding: t.contentEncoding,
        conversationId: t.compatVersionId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        document: null,
        image: t?.image
          ? {
              ...t.image,
              format: t.image?.format ?? ("png" as const),
              createdAt: new Date(),
              updatedAt: new Date(),
              attachmentId: `attachment-${t.itemId ?? t.seriesId}-${t.index}`
            }
          : null,
        draftId: null,
        etag: t.etag,
        expiresAt: t.expiresAt,
        ext: t.ext,
        filename: t.filename,
        imageGenOutput: t.imageGenOutput
          ? {
              ...t.imageGenOutput,
              attachmentId: `attachment-${t.itemId ?? t.seriesId}-${t.index}`,
              createdAt: new Date(),
              id: `image-gen-output-${t.itemId ?? t.seriesId}-${t.index}`,
              jobId: t.jobId,
              isPartial: true,
              jobIndex: 0,
              kind: t.kind,
              seriesId: t.imageGenOutput.seriesId,
              seriesIndex: t.imageGenOutput.seriesIndex,
              updatedAt: new Date()
            }
          : null,
        messageId: t.requestMessageId ?? "",
        uploadMethod: "GENERATED",
        generationGroupId: t.generationGroupId
      } as AttachmentSingleton<true>;
    });
  } else {
    const t = tt;
    if (!t?.cdnUrl) return;
    return {
      ...t,
      assetType: "IMAGE",
      batchId: null,
      bucket: t.bucket,
      cacheControl: t.cacheControl,
      cdnUrl: t.cdnUrl,
      checksumAlgo: t.checksumAlgo,
      checksumSha256: t.checksumSha256,
      compatCdnUrl: t.compatCdnUrl,
      compatExt: t.compatExt,
      id: `attachment-${t.itemId ?? t.seriesId}-${t.index}`,
      compatKey: t.compatKey,
      key: t.key,
      versionId: t.versionId,
      compatMime: t.compatMime,
      compatReadyAt: t.compatReadyAt,
      compatS3ObjectId: t.s3ObjectId,
      s3LastModified: t.s3LastModified,
      compatStatus: "ALIASED",
      compatVersionId: t.versionId,
      contentDisposition: t.contentDisposition,
      contentEncoding: t.contentEncoding,
      conversationId: t.compatVersionId,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      document: null,
      image: t?.image
        ? {
            ...t.image,
            format: t.image?.format ?? ("png" as const),
            createdAt: new Date(),
            updatedAt: new Date(),
            attachmentId: `attachment-${t.itemId ?? t.seriesId}-${t.index}`
          }
        : null,
      draftId: null,
      etag: t.etag,
      expiresAt: t.expiresAt,
      ext: t.ext,
      filename: t.filename,
      imageGenOutput: t.imageGenOutput
        ? {
            ...t.imageGenOutput,
            attachmentId: `attachment-${t.itemId ?? t.seriesId}-${t.index}`,
            createdAt: new Date(),
            id: `image-gen-output-${t.itemId ?? t.seriesId}-${t.index}`,
            jobId: t.jobId,
            isPartial: true,
            jobIndex: 0,
            kind: t.kind,
            seriesId: t.imageGenOutput.seriesId,
            seriesIndex: t.imageGenOutput.seriesIndex,
            updatedAt: new Date()
          }
        : null,
      messageId: t.requestMessageId ?? "",
      uploadMethod: "GENERATED",
      generationGroupId: t.generationGroupId
    } as AttachmentSingleton<true>;
  }
}

export function normalizeImgGenFields(
  r: AIChatResponseImgGenFieldsFinal | null
) {
  if (!r) return undefined;
  const { partialImages, activeImage, images, ...rest } = r;
  const partialImgsNormalized = imgGenToAttachmentWorkup(partialImages) as (
    | AttachmentSingleton<true>
    | undefined
  )[];
  const imgsNormalized = imgGenToAttachmentWorkup(images) as (
    | AttachmentSingleton<true>
    | undefined
  )[];
  const activeImgNormalized = imgGenToAttachmentWorkup(activeImage) as
    | undefined
    | AttachmentSingleton<true>;
  return {
    activeImage: activeImgNormalized,
    partialImages: partialImgsNormalized,
    images: imgsNormalized,
    ...rest
  };
}
