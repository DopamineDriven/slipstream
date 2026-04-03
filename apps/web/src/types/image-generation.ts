import { AttachmentSingleton, ImageGenOutputSingleton, ImageSingleton, Rm } from "@slipstream/types";


export interface ImageGenOutput extends ImageGenOutputSingleton<true> {};

export interface ImageMetadata extends ImageSingleton {};
export interface ImageGenAttachment extends Rm<AttachmentSingleton<true>, "providerLinks"> {}


// Grouped series data for UI rendering
export interface ImageGenSeries {
  seriesId: string;
  items: ImageGenSeriesItem[];
  jobId?: string;
  jobIndex?: number;
  generationGroupId?: string;
  revisedPrompt?: string | null;
}

export interface ImageGenSeriesItem {
  cdnUrl: string;
  width: number;
  height: number;
  mime: string;
  isPartial: boolean;
  index: number;
  generationGroupId?: string;
  seriesId: string;
  revisedPrompt?: string | null;
}
