import type {
  OpenAIImgGenFacilitatingModels,
  OpenAIImgGenModels,
  OpenAIModelIdUnion
} from "@/models.ts";
import type { DX, UTR } from "@/utils.ts";

export type BaseOpenAISize = "1536x1024" | "1024x1536" | "1024x1024" | "auto";

export type GPT1x2 = {
  ar: "1:2";
  sizes: "1024x2048" | "1280x2560" | "1536x3072" | "1792x3584" | "1920x3840";
};

export type GPT2x1 = {
  ar: "2:1";
  sizes: "2048x1024" | "2560x1280" | "3072x1536" | "3584x1792" | "3840x1920";
};

export type GPT1x3 = {
  ar: "1:3";
  sizes: "512x1536" | "768x2304" | "1024x3072" | "1280x3840";
};

export type GPT3x1 = {
  ar: "3:1";
  sizes: "1536x512" | "2304x768" | "3072x1024" | "3840x1280";
};

export type GPT2x3 = {
  ar: "2:3";
  sizes: "1024x1536" | "1536x2304" | "2048x3072" | "2304x3456";
};

export type GPT3x2 = {
  ar: "3:2";
  sizes: "1536x1024" | "2304x1536" | "3072x2048" | "3456x2304";
};

export type GPT3x4 = {
  ar: "3:4";
  sizes: "1152x1536" | "1536x2048" | "1920x2560" | "2304x3072";
};

export type GPT4x3 = {
  ar: "4:3";
  sizes: "1536x1152" | "2048x1536" | "2560x1920" | "3072x2304";
};

export type GPT4x5 = {
  ar: "4:5";
  sizes: "1024x1280" | "1536x1920" | "2048x2560" | "2304x2880" | "2560x3200";
};

export type GPT5x4 = {
  ar: "5:4";
  sizes: "1280x1024" | "1920x1536" | "2560x2048" | "2880x2304" | "3200x2560";
};

export type GPT9x16 = {
  ar: "9:16";
  sizes: "1152x2048" | "1440x2560" | "1728x3072" | "2016x3584" | "2160x3840";
};

export type GPT16x9 = {
  ar: "16:9";
  sizes: "2048x1152" | "2560x1440" | "3072x1728" | "3584x2016" | "3840x2160";
};

export type GPT10x16 = {
  ar: "10:16";
  sizes: "960x1536" | "1280x2048" | "1600x2560" | "1920x3072" | "2240x3584";
};

export type GPT16x10 = {
  ar: "16:10";
  sizes: "1536x960" | "2048x1280" | "2560x1600" | "3072x1920" | "3584x2240";
};

export type GPT9x21 = {
  ar: "9:21";
  sizes: "864x2016" | "1152x2688" | "1440x3360" | "1632x3808";
};

export type GPT21x9 = {
  ar: "21:9";
  sizes: "2016x864" | "2688x1152" | "3360x1440" | "3808x1632";
};
type GPT1x1 = {
  ar: "1:1";
  sizes: "1024x1024" | "1536x1536" | "2048x2048" | "2560x2560" | "2880x2880";
};

export type GPTSizesUnion =
  | GPT1x1
  | GPT1x2
  | GPT1x3
  | GPT2x1
  | GPT2x3
  | GPT3x1
  | GPT3x2
  | GPT3x4
  | GPT4x3
  | GPT4x5
  | GPT5x4
  | GPT9x16
  | GPT9x21
  | GPT10x16
  | GPT16x9
  | GPT16x10
  | GPT21x9;

export type GPTSizesRecord = UTR<GPTSizesUnion, "ar", true>;

export type GPTSizesMap<T extends keyof GPTSizesRecord> = {
  [P in T]: GPTSizesRecord[P];
}[T];

export type GPTImage2Size = GPTSizesUnion["sizes"] | "auto";

export type OpenAIModelAspectRatioWorkup = DX<
  Record<OpenAIImgCapableModels, GPTSizesUnion["sizes"]>
>;

export type OpenAIImgNativeGPTImgAR = {
  "gpt-image-1.5": BaseOpenAISize;
  "gpt-image-1": BaseOpenAISize;
  "gpt-image-1-mini": BaseOpenAISize;
  "gpt-image-2": GPTSizesUnion["sizes"] | "auto";
  "gpt-image-2.5-sunburst": GPTSizesUnion["sizes"] | "auto";
  "gpt-image-2.5-flare": GPTSizesUnion["sizes"] | "auto";
};

export type OpenAIAspectRatioRecord = DX<
  Record<
    Exclude<
      OpenAIImgCapableModels,
      "gpt-image-1" | "gpt-image-1-mini" | "gpt-image-1.5"
    >,
    GPTSizesUnion["sizes"] | "auto"
  > &
    Record<
      "gpt-image-1" | "gpt-image-1-mini" | "gpt-image-1.5",
      "1024x1024" | "1024x1536" | "1536x1024" | "auto"
    > &
    Record<Exclude<OpenAIModelIdUnion, OpenAIImgCapableModels>, undefined>
>;

export type OpenAINativeImgModelAspectRatioWorkup = OpenAIAspectRatioRecord;

export type OpenAIModelAspectRatio = {
  [P in keyof OpenAIModelAspectRatioWorkup]?: OpenAIModelAspectRatioWorkup[P];
};

export type GptImageOutputSize = BaseOpenAISize | undefined;

export type OpenAIImgCapableModels =
  OpenAIImgGenFacilitatingModels | OpenAIImgGenModels;

export type OpenAIBaseQuality = "low" | "medium" | "high" | "auto";

export type OpenAIGptImage2Point5Quality =
  "low" | "medium" | "high" | "xhigh" | "max" | "auto";

export type OpenAINativeImgModelQualityWorkup = {
  "gpt-image-1.5": OpenAIBaseQuality;
  "gpt-image-1": OpenAIBaseQuality;
  "gpt-image-1-mini": OpenAIBaseQuality;
  "gpt-image-2": OpenAIBaseQuality;
  "gpt-image-2.5-sunburst": OpenAIGptImage2Point5Quality;
  "gpt-image-2.5-flare": OpenAIGptImage2Point5Quality;
};
export type OpenAIImgGenQualityRecord = DX<
  Record<
    Exclude<
      OpenAIImgCapableModels,
      "gpt-image-1" | "gpt-image-1-mini" | "gpt-image-1.5" | "gpt-image-2"
    >,
    OpenAIGptImage2Point5Quality
  > &
    Record<
      "gpt-image-1" | "gpt-image-1-mini" | "gpt-image-1.5" | "gpt-image-2",
      OpenAIBaseQuality
    > &
    Record<Exclude<OpenAIModelIdUnion, OpenAIImgCapableModels>, undefined>
>;
/**
 * OpenAI Image Size & Quality Options
 *
 * Note: gpt-image-1-mini has the same available options as gpt-image-1
 */
export type OpenAISizeQualityOpts = {
  quality: OpenAIImgGenQualityRecord;
  size: OpenAINativeImgModelAspectRatioWorkup;
};

/**
 * Shared OpenAI Image Options
 *
 * Note: gpt-image-1-mini has the same available options as gpt-image-1
 */
export interface SharedOpenAIImageOpts<T extends OpenAIImgCapableModels> {
  model: T;
  /**
   * **gpt-image-1**
   *
   * max: 32000 chars
   */
  text: string;
  /**
   *
   * **gpt-image-1.5, gpt-image-1 & gpt-image-1-mini**
   *
   *  default: 1,
   *  max: 10
   */
  n?: number;
  /**
   * default: "auto"
   */
  quality?: OpenAISizeQualityOpts["quality"][T];
  /**
   * default: "auto"
   */
  size?: OpenAISizeQualityOpts["size"][T];
  /**
   * A unique identifier representing the end-user; can help OpenAI to monitor and detect abuse
   */
  user?: string;
}

export type GPTImgOpts<
  T extends OpenAIModelIdUnion = "gpt-image-2.5-sunburst"
> =
  T extends Exclude<OpenAIModelIdUnion, OpenAIImgCapableModels>
    ? never
    : {
        model: T extends Exclude<
          OpenAIImgGenFacilitatingModels,
          OpenAIImgGenModels
        >
          ? "gpt-image-2.5-sunburst"
          : T;
        /**
         *
         * max: 32000 chars
         */
        text: string;
        /**
         *  default: 1,
         *  max: 10
         */
        n?: number;
        /**
         * default: "auto"
         */
        quality?: OpenAIImgGenQualityRecord[T];
        /**
         * default: "auto"
         */
        size?: OpenAIAspectRatioRecord[T];
        /**
         * A unique identifier representing the end-user; can help OpenAI to monitor and detect abuse
         */
        user?: string;

        /**
         * Optional mask for inpainting. Contains `image_url` (string, optional) and
         * `file_id` (string, optional).
         */
        input_image_mask?: {
          /**
           * File ID for the mask image.
           */
          file_id?: string;
          /**
           * Base64-encoded mask image.
           */
          image_url?: string;
        };
        /**
         *
         * default: 100
         *
         * output must be of type jpeg or webp
         *
         */
        output_compression?: number;
        /**
         *
         * default: "png"
         */
        output_format?: "png" | "webp" | "jpeg";
        /**
         *
         * default: "auto"
         */
        moderation?: "auto" | "low";
        /**
         *
         * default: "auto"
         *
         * output format must be "png" | "webp"
         */
        background?: "transparent" | "opaque" | "auto";
        /**
         * default: false
         */
        streaming?: boolean;
        /**
         * Requires **streaming** to be **true**
         *
         * default: 0,
         * max: 3
         */
        partial_images?: number;
      };

type GPTImage1and1Point5Opts<T extends "gpt-image-1" | "gpt-image-1.5"> =
  GPTImgOpts<T> & InputFidelity;

export type InputFidelity = {
  /**
   *
   * **Only supported for `gpt-image-1` and `gpt-image-1.5`. Unsupported for `gpt-image-1-mini`, `gpt-image-2`, `gpt-image-2.5-sunburst`, and `gpt-image-2.5-flare`**
   *
   * Control how much effort the model will exert to match the style and features,
   * especially facial features, of input images. Supports `high` and
   * `low`. Defaults to `low`.
   */
  input_fidelity?: "high" | "low";
};

export type OpenAIImgOpts<
  T extends OpenAIModelIdUnion = "gpt-image-2.5-sunburst"
> = DX<
  T extends "gpt-image-1" | "gpt-image-1.5"
    ? GPTImage1and1Point5Opts<T>
    : GPTImgOpts<T>
>;

export type OpenAIImageGenOpts<
  T extends OpenAIModelIdUnion = "gpt-image-2.5-sunburst"
> = OpenAIImgOpts<T>;

export type GptImageAndFacilitatorsImgGenWorkupRT<
  T extends OpenAIImgCapableModels = "gpt-image-2.5-sunburst"
> = {
  input_image_mask:
    | {
        file_id?: string | undefined;
        image_url?: string | undefined;
      }
    | undefined;
  isPureImgGenModel: boolean;
  msgBoundImgAssets: boolean;
  n: number;
  moderation: "low" | "auto";
  output_format: "jpeg" | "webp" | "png";
  output_compression: number | undefined;
  model: T extends OpenAIImgGenFacilitatingModels
    ? "gpt-image-2.5-sunburst"
    : T;
  output_quality: SharedOpenAIImageOpts<T>["quality"];
  output_size: SharedOpenAIImageOpts<T>["size"];
  output_background: "auto" | "transparent" | "opaque" | undefined;
  targetApi: "responses" | "images";
  partialImagesRequested: number | undefined;
  input_fidelity: "low" | "high" | undefined;
};

export type ImgGenWorkupRT<T extends OpenAIModelIdUnion> =
  T extends OpenAIImgCapableModels
    ? GptImageAndFacilitatorsImgGenWorkupRT<T>
    : undefined;

export type ImgGenWorkupRTObj = DX<
  Record<
    Exclude<
      OpenAIImgCapableModels,
      "gpt-image-1" | "gpt-image-1-mini" | "gpt-image-1.5" | "gpt-image-2"
    >,
    GptImageAndFacilitatorsImgGenWorkupRT<"gpt-image-2.5-sunburst">
  > &
    Record<
      "gpt-image-1" | "gpt-image-1-mini" | "gpt-image-1.5" | "gpt-image-2",
      GptImageAndFacilitatorsImgGenWorkupRT<
        "gpt-image-1" | "gpt-image-1-mini" | "gpt-image-1.5" | "gpt-image-2"
      >
    > &
    Record<Exclude<OpenAIModelIdUnion, OpenAIImgCapableModels>, undefined>
>;

export type ImgGenWorkupResRT<T extends keyof ImgGenWorkupRTObj> =
  { [P in T]: ImgGenWorkupRTObj[P] }[T] | undefined;

export const GPT_IMAGE_2_EXTENDED_OPTIONS = [
  { value: "auto", label: "Auto" },

  // 1:1
  { value: "1024x1024", label: "1:1", pixelSize: "1024×1024" },
  { value: "1536x1536", label: "1:1 (1536)", pixelSize: "1536×1536" },
  { value: "2048x2048", label: "1:1 2K", pixelSize: "2048×2048" },
  { value: "2560x2560", label: "1:1 (2560)", pixelSize: "2560×2560" },
  { value: "2880x2880", label: "1:1 Max", pixelSize: "2880×2880" },

  // 2:3
  { value: "1024x1536", label: "2:3", pixelSize: "1024×1536" },
  { value: "1536x2304", label: "2:3 (1536)", pixelSize: "1536×2304" },
  { value: "2048x3072", label: "2:3 2K", pixelSize: "2048×3072" },
  { value: "2304x3456", label: "2:3 Max", pixelSize: "2304×3456" },

  // 3:2
  { value: "1536x1024", label: "3:2", pixelSize: "1536×1024" },
  { value: "2304x1536", label: "3:2 (1536)", pixelSize: "2304×1536" },
  { value: "3072x2048", label: "3:2 2K", pixelSize: "3072×2048" },
  { value: "3456x2304", label: "3:2 Max", pixelSize: "3456×2304" },

  // 3:4
  { value: "1152x1536", label: "3:4", pixelSize: "1152×1536" },
  { value: "1536x2048", label: "3:4 (1536)", pixelSize: "1536×2048" },
  { value: "1920x2560", label: "3:4 2K", pixelSize: "1920×2560" },
  { value: "2304x3072", label: "3:4 Max", pixelSize: "2304×3072" },

  // 4:3
  { value: "1536x1152", label: "4:3", pixelSize: "1536×1152" },
  { value: "2048x1536", label: "4:3 (2048)", pixelSize: "2048×1536" },
  { value: "2560x1920", label: "4:3 2K", pixelSize: "2560×1920" },
  { value: "3072x2304", label: "4:3 Max", pixelSize: "3072×2304" },

  // 4:5
  { value: "1024x1280", label: "4:5", pixelSize: "1024×1280" },
  { value: "1536x1920", label: "4:5 (1536)", pixelSize: "1536×1920" },
  { value: "2048x2560", label: "4:5 2K", pixelSize: "2048×2560" },
  { value: "2304x2880", label: "4:5 (2304)", pixelSize: "2304×2880" },
  { value: "2560x3200", label: "4:5 Max", pixelSize: "2560×3200" },

  // 5:4
  { value: "1280x1024", label: "5:4", pixelSize: "1280×1024" },
  { value: "1920x1536", label: "5:4 (1920)", pixelSize: "1920×1536" },
  { value: "2560x2048", label: "5:4 2K", pixelSize: "2560×2048" },
  { value: "2880x2304", label: "5:4 (2880)", pixelSize: "2880×2304" },
  { value: "3200x2560", label: "5:4 Max", pixelSize: "3200×2560" },

  // 9:16
  { value: "1152x2048", label: "9:16", pixelSize: "1152×2048" },
  { value: "1440x2560", label: "9:16 (1440)", pixelSize: "1440×2560" },
  { value: "1728x3072", label: "9:16 3K", pixelSize: "1728×3072" },
  { value: "2016x3584", label: "9:16 (2016)", pixelSize: "2016×3584" },
  { value: "2160x3840", label: "9:16 4K", pixelSize: "2160×3840" },

  // 16:9
  { value: "2048x1152", label: "16:9", pixelSize: "2048×1152" },
  { value: "2560x1440", label: "16:9 (2560)", pixelSize: "2560×1440" },
  { value: "3072x1728", label: "16:9 3K", pixelSize: "3072×1728" },
  { value: "3584x2016", label: "16:9 (3584)", pixelSize: "3584×2016" },
  { value: "3840x2160", label: "16:9 4K", pixelSize: "3840×2160" },

  // 10:16
  { value: "960x1536", label: "10:16", pixelSize: "960×1536" },
  { value: "1280x2048", label: "10:16 (1280)", pixelSize: "1280×2048" },
  { value: "1600x2560", label: "10:16 2.5K", pixelSize: "1600×2560" },
  { value: "1920x3072", label: "10:16 3K", pixelSize: "1920×3072" },
  { value: "2240x3584", label: "10:16 Max", pixelSize: "2240×3584" },

  // 16:10
  { value: "1536x960", label: "16:10", pixelSize: "1536×960" },
  { value: "2048x1280", label: "16:10 (2048)", pixelSize: "2048×1280" },
  { value: "2560x1600", label: "16:10 2.5K", pixelSize: "2560×1600" },
  { value: "3072x1920", label: "16:10 3K", pixelSize: "3072×1920" },
  { value: "3584x2240", label: "16:10 Max", pixelSize: "3584×2240" },

  // 1:2
  { value: "1024x2048", label: "1:2", pixelSize: "1024×2048" },
  { value: "1280x2560", label: "1:2 (1280)", pixelSize: "1280×2560" },
  { value: "1536x3072", label: "1:2 3K", pixelSize: "1536×3072" },
  { value: "1792x3584", label: "1:2 (1792)", pixelSize: "1792×3584" },
  { value: "1920x3840", label: "1:2 Max", pixelSize: "1920×3840" },

  // 2:1
  { value: "2048x1024", label: "2:1", pixelSize: "2048×1024" },
  { value: "2560x1280", label: "2:1 (2560)", pixelSize: "2560×1280" },
  { value: "3072x1536", label: "2:1 3K", pixelSize: "3072×1536" },
  { value: "3584x1792", label: "2:1 (3584)", pixelSize: "3584×1792" },
  { value: "3840x1920", label: "2:1 Max", pixelSize: "3840×1920" },

  // 9:21
  { value: "864x2016", label: "9:21", pixelSize: "864×2016" },
  { value: "1152x2688", label: "9:21 (1152)", pixelSize: "1152×2688" },
  { value: "1440x3360", label: "9:21 3K", pixelSize: "1440×3360" },
  { value: "1632x3808", label: "9:21 Max", pixelSize: "1632×3808" },

  // 21:9
  { value: "2016x864", label: "21:9", pixelSize: "2016×864" },
  { value: "2688x1152", label: "21:9 (2688)", pixelSize: "2688×1152" },
  { value: "3360x1440", label: "21:9 3K", pixelSize: "3360×1440" },
  { value: "3808x1632", label: "21:9 Max", pixelSize: "3808×1632" },

  // 1:3
  { value: "512x1536", label: "1:3", pixelSize: "512×1536" },
  { value: "768x2304", label: "1:3 (768)", pixelSize: "768×2304" },
  { value: "1024x3072", label: "1:3 3K", pixelSize: "1024×3072" },
  { value: "1280x3840", label: "1:3 Max", pixelSize: "1280×3840" },

  // 3:1
  { value: "1536x512", label: "3:1", pixelSize: "1536×512" },
  { value: "2304x768", label: "3:1 (2304)", pixelSize: "2304×768" },
  { value: "3072x1024", label: "3:1 3K", pixelSize: "3072×1024" },
  { value: "3840x1280", label: "3:1 Max", pixelSize: "3840×1280" }
] as const;
