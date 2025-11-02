import type { $Enums, Message as MessagePrisma } from "@slipstream/db/edge-client";
import type { Providers, RTC } from "@slipstream/types";

export type ClientWorkupProps = {
  isSet: Record<Providers, boolean>;
  isDefault: Record<Providers, boolean>;
};
 export type ImageSingleton = {
  createdAt: Date;
  updatedAt: Date;
  attachmentId: string;
  format:
    | "apng"
    | "png"
    | "gif"
    | "bmp"
    | "webp"
    | "avif"
    | "svg"
    | "ico"
    | "tiff"
    | "jpeg"
    | "heic"
    | "unknown"
    | "jxl"
    | "jp2"
    | "jpx"
    | "jxr"
    | "jls"
    | "raw"
    | "dng"
    | "cr2"
    | "nef"
    | "arw"
    | "hdr"
    | "pic"
    | "rgbe"
    | "xyze";
  width: number;
  height: number;
  aspectRatio: number | null;
  frames: number;
  hasAlpha: boolean | null;
  animated: boolean;
  orientation: number | null;
  colorSpace:
    | "unknown"
    | "srgb"
    | "display_p3"
    | "adobe_rgb"
    | "prophoto_rgb"
    | "rec2020"
    | "rec709"
    | "cmyk"
    | "lab"
    | "xyz"
    | "gray"
    | null;
  exifDateTimeOriginal: Date | null;
  cameraMake: string | null;
  cameraModel: string | null;
  lensModel: string | null;
  gpsLat: number | null;
  gpsLon: number | null;
  dominantColorHex: string | null;
  iccProfile: string | null;
};
export type DocumentSingleton = {
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  attachmentId: string;
  format: string;
  pageCount: number | null;
  wordCount: number | null;
  language: string | null;
  author: string | null;
  subject: string | null;
  keywords: string[];
  pdfVersion: string | null;
  isEncrypted: boolean;
  isSearchable: boolean;
  encoding: string | null;
  lineCount: number | null;
  textPreview: string | null;
};

export type AttachmentSingleton = {
  size: number | null;
  conversationId: string | null;
  id: string;
  createdAt: Date;
  draftId: string | null;
  messageId: string | null;
  assetType: $Enums.AssetType;
  cdnUrl: string | null;
  publicUrl: string | null;
  versionId: string | null;
  filename: string | null;
  ext: string | null;
  mime: string | null;
  image?: ImageSingleton;
  document?: DocumentSingleton

};

export type UIMessage = RTC<MessagePrisma, "conversationId"> & {
  attachments?: AttachmentSingleton[];
};

export type RxnUnion =
  | "liked"
  | "disliked"
  | "unliked"
  | "undisliked"
  | "switch-to-liked"
  | "switch-to-disliked";

export type DynamicChatRouteProps =
  | {
      id: string;
      conversationId: string;
      userId: string | null;
      senderType: $Enums.SenderType;
      provider: $Enums.Provider;
      model: string | null;
      userKeyId: string | null;
      content: string;
      thinkingText: string | null;
      thinkingDuration: number | null;
      liked: boolean | null;
      disliked: boolean | null;
      tryAgain: boolean | null;
      createdAt: Date;
      updatedAt: Date;
      attachments?: AttachmentSingleton[];
    }[]
  | null;
