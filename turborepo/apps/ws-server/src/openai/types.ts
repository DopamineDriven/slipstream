export type OpenAIImgApiStreamPartial = {
  output_format: "png" | "jpeg" | "webp";
  b64_json: string;
  background: "auto" | "transparent" | "opaque";
  created_at: number;
  partial_image_index: number;
  quality: "high" | "medium" | "low" | "auto";
  size: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
};

export type OpenAIImgApiStreamFinal = {
  output_format: "png" | "jpeg" | "webp";
  b64_json: string;
  background: "auto" | "transparent" | "opaque";
  created_at: number;
  quality: "high" | "medium" | "low" | "auto";
  size: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
  usage: {
    input_tokens: number;
    input_tokens_details: {
      image_tokens: number;
      text_tokens: number;
    };
    output_tokens: number;
    total_tokens: number;
  };
};
