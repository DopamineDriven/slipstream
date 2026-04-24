import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProviderValidation } from "@/provider-validation/index.ts";

const p = new ProviderValidation();
describe("handleOutputSize", () => {
  it("should return auto for gpt-5.4 with no args set", {}, () => {
    assert.equal(p.handleOutputSize("gpt-5.4"), "auto");
  });
  it(
    "should return 1:1 with model set to 🍌 gemini-3.1-flash-image-preview 🍌 (Nano Banana 2) and no args",
    {},
    () => {
      assert.equal(p.handleOutputSize("gemini-3.1-flash-image-preview"), "1:1");
    }
  );
  it(
    "should return auto for model grok-imagine-image with no output size set",
    {},
    () => {
      assert.equal(p.handleOutputSize("grok-imagine-image"), "auto");
    }
  );
  it(
    "should return 19.5:9 for model grok-imagine-image, with 19.5:9 size set",
    {},
    () => {
      assert.equal(
        p.handleOutputSize("grok-imagine-image", {
          output_size: "19.5:9"
        }),
        "19.5:9"
      );
    }
  );
  it(
    "should return 21:9 for model gemini-3-pro-image, output size set to 21:9",
    {},
    () => {
      assert.equal(
        p.handleOutputSize("gemini-3-pro-image-preview", {
          output_size: "21:9"
        }),
        "21:9"
      );
    }
  );
  it(
    "should return 1:8 for Nano Bananas 2 🍌 -- (1:8, 8:1, 1:4, and 4:1 are unique to 🍌 numero dos)",
    {},
    () => {
      assert.equal(
        p.handleOutputSize("gemini-3.1-flash-image-preview", {
          output_size: "1:8"
        }),
        "1:8"
      );
    }
  );
  it(
    "should return 1024x1536 for openai with gpt-image-1.5 selected and output_size set to 1024x1536",
    {},
    () => {
      assert.equal(
        p.handleOutputSize("gpt-image-1.5", {
          output_size: "1024x1536"
        }),
        "1024x1536"
      );
    }
  );
  it(
    "should return 2016x3584 for openai with gpt-image-2 selected and output_size set to 2016x3584",
    {},
    () => {
      assert.equal(
        p.handleOutputSize("gpt-image-2", {
          output_size: "2016x3584"
        }),
        "2016x3584"
      );
    }
  );
});

describe("handleImgGenOutputQuality", () => {
  it("should return 'auto' for gpt-5.4 provdier with no model set", {}, () => {
    assert.equal(p.handleImgGenOutputQuality("gpt-5.4"), "auto");
  });
  it(
    "should return 2K for gemini-3.1-flash-image-preview when no arg passed in",
    {},
    () => {
      assert.equal(
        p.handleImgGenOutputQuality("gemini-3.1-flash-image-preview"),
        "2K"
      );
    }
  );
  it(
    "should return 1K for gemini provdier with model set to imagen-4.0-ultra-generate-001",
    {},
    () => {
      assert.equal(
        p.handleImgGenOutputQuality("imagen-4.0-ultra-generate-001"),
        "1K"
      );
    }
  );
  it(
    "should return 4K for gemini provdier with model set to gemini-3.1-flash-image-preview",
    {},
    () => {
      assert.equal(
        p.handleImgGenOutputQuality("gemini-3.1-flash-image-preview", {
          output_quality: "4K"
        }),
        "4K"
      );
    }
  );
  it("should return 1k for grok-imagine-image with no arg set", {}, () => {
    assert.equal(p.handleImgGenOutputQuality("grok-imagine-image"), "1k");
  });
  it(
    "should return 2k for grok-imagine-image-pro and no args passed in",
    {},
    () => {
      assert.equal(p.handleImgGenOutputQuality("grok-imagine-image-pro"), "2k");
    }
  );
});

describe("handleImgGenOutputFormat", () => {
  it("should return undefined for grok", {}, () => {
    assert.equal(
      p.handleImgGenOutputFormat("grok-imagine-image", {
        format: undefined
      }),
      undefined
    );
  });
  it(
    "should return image/jpeg for proivder gemini, model imagen-4.0-fast-generate-001, format set to image/png",
    {},
    () => {
      assert.equal(
        p.handleImgGenOutputFormat("imagen-4.0-fast-generate-001", {
          format: "image/png"
        }),
        "image/png"
      );
    }
  );
  it(
    "should return webp for proivder openai, model gpt-5.1, format set to webp",
    {},
    () => {
      assert.equal(
        p.handleImgGenOutputFormat("gpt-5.1", {
          format: "webp"
        }),
        "webp"
      );
    }
  );
});

describe("handleImgGenCompression", () => {
  it(
    "should return undefined for openai provdier with model set to gpt-image-1 and output_format set to png and output_compression set to 90",
    {},
    () => {
      assert.equal(
        p.handleImgGenCompression("gpt-image-1", {
          output_compression: 90,
          output_format: "png"
        }),
        undefined
      );
    }
  );
  it(
    "should return 90 for openai provider with model set to gpt-image-1, output_format set to webp, and output_compression set to 90",
    {},
    () => {
      assert.equal(
        p.handleImgGenCompression("gpt-image-1", {
          output_compression: 90,
          output_format: "webp"
        }),
        90
      );
    }
  );
  it(
    "should return 100 for openai provider with model set to gpt-image-1.5, output_format set to jpeg, and output_compression set to 110",
    {},
    () => {
      assert.equal(
        p.handleImgGenCompression("gpt-image-1.5", {
          output_compression: 110,
          output_format: "jpeg"
        }),
        100
      );
    }
  );
  it(
    "should return 100 for openai provider with model set to gpt-image-1.5, output_format set to jpeg, and output_compression set to undefined",
    {},
    () => {
      assert.equal(
        p.handleImgGenCompression("gpt-image-1.5", {
          output_compression: undefined,
          output_format: "jpeg"
        }),
        100
      );
    }
  );
  it(
    "should return 75 for gemini provider with model set to imagen-4.0-ultra-generate-001, output_format set to jpeg, and output_compression set to undefined",
    {},
    () => {
      assert.equal(
        p.handleImgGenCompression("imagen-4.0-ultra-generate-001", {
          output_compression: undefined,
          output_format: "jpeg"
        }),
        75
      );
    }
  );
  it(
    "should return undefined for gemini provider with model set to gemini-2.5-flash-image, output_format set to jpeg, and output_compression set to 100",
    {},
    () => {
      assert.equal(
        p.handleImgGenCompression("gemini-2.5-flash-image", {
          output_compression: 100,
          output_format: "jpeg"
        }),
        undefined
      );
    }
  );
  it(
    "should return undefined for claude-opus-4-6, output_format set to jpeg, and output_compression set to 100",
    {},
    () => {
      assert.equal(
        p.handleImgGenCompression("claude-opus-4-6", {
          output_compression: 100,
          output_format: "jpeg"
        }),
        undefined
      );
    }
  );
});

describe("handlePartialImgGen", () => {
  it("should return undefined for grok provider", {}, () => {
    assert.equal(
      p.handlePartialImgGen("grok-imagine-image-pro", {
        partialImagesRequested: 2
      }),
      undefined
    );
  });
  it(
    "should return undefined for 🍌 Nano Bananas Two 🍌 without an arg",
    {},
    () => {
      assert.equal(
        p.handlePartialImgGen("gemini-3.1-flash-image-preview"),
        undefined
      );
    }
  );
  it(
    "should return undefined for 🍌 Nano Bananas Two 🍌 with an arg",
    {},
    () => {
      assert.equal(
        p.handlePartialImgGen("gemini-3.1-flash-image-preview", {
          partialImagesRequested: 3
        }),
        undefined
      );
    }
  );
  it(
    "should return 0 for openai provider with gpt-image-1 or gpt-image-1-mini set",
    {},
    () => {
      assert.equal(p.handlePartialImgGen("gpt-image-1"), 0);
    }
  );
  it(
    "should return 0 for openai provider with gpt-5 set and no args",
    {},
    () => {
      assert.equal(p.handlePartialImgGen("gpt-5.4"), 0);
    }
  );
  it(
    "should return 3 for 100 partial images requested (gpt-image-1.5)",
    {},
    () => {
      assert.equal(
        p.handlePartialImgGen("gpt-image-1.5", {
          partialImagesRequested: 100
        }),
        3
      );
    }
  );
});

describe("handleImgGenCount", () => {
  it(
    "should return 1 for imagen-4.0-ultra-generate-001 model with n=undefined",
    {},
    () => {
      assert.equal(p.handleImgGenCount("imagen-4.0-ultra-generate-001"), 1);
    }
  );
  it(
    "should return 1 for gemini-2.5-flash-image model with n=-11 set as input",
    {},
    () => {
      assert.equal(
        p.handleImgGenCount("gemini-3.1-flash-image-preview", { n: -11 }),
        1
      );
    }
  );
  it(
    "should return 10 for gemini-2.5-flash-image model with n=11 set as input",
    {},
    () => {
      assert.equal(
        p.handleImgGenCount("gemini-2.5-flash-image", { n: 11 }),
        10
      );
    }
  );
  it(
    "should return 1 for grok-imagine-image model with n=-11 set as input",
    {},
    () => {
      assert.equal(p.handleImgGenCount("grok-imagine-image", { n: -11 }), 1);
    }
  );
  it(
    "should return 10 for grok-imagine-image model with n=11 set as input",
    {},
    () => {
      assert.equal(p.handleImgGenCount("grok-imagine-image", { n: 11 }), 10);
    }
  );
  it(
    "should return 7 for gpt-image-1.5, gpt-image-1, or gpt-image-1-mini with n=7 set as input",
    {},
    () => {
      assert.equal(p.handleImgGenCount("gpt-image-1.5", { n: 7 }), 7);
    }
  );
  it("should return 1 for gpt-5.4 with n=-7 set as input", {}, () => {
    assert.equal(p.handleImgGenCount("gpt-5.4", { n: -7 }), 1);
  });
  it(
    "should return 4 for imagen-4.0-ultra-generate-001 model with n=4000",
    {},
    () => {
      assert.equal(
        p.handleImgGenCount("imagen-4.0-ultra-generate-001", {
          n: 4000
        }),
        4
      );
    }
  );
  it("should return 10 for gpt-5.4 with n=2000 set", {}, () => {
    assert.equal(p.handleImgGenCount("gpt-5.4", { n: 2000 }), 10);
  });
});

describe("isImgGenCapableModel", () => {
  it("should return true for imagen-4.0-ultra-generate-001", {}, () => {
    assert.equal(p.isImgGenCapableModel("imagen-4.0-ultra-generate-001"), true);
  });
  it("should return true for gemini-3.1-flash-image-preview", {}, () => {
    assert.equal(
      p.isImgGenCapableModel("gemini-3.1-flash-image-preview"),
      true
    );
  });
  it("should return false for grok-4.20-multi-agent-0309", {}, () => {
    assert.equal(p.isImgGenCapableModel("grok-4.20-multi-agent-0309"), false);
  });
  it("should return true for grok-imagine-image", {}, () => {
    assert.equal(p.isImgGenCapableModel("grok-imagine-image"), true);
  });
  it("should return true for gpt-5.4", {}, () => {
    assert.equal(p.isImgGenCapableModel("gpt-5.4"), true);
  });
  it("should return true for gpt-image-1.5", {}, () => {
    assert.equal(p.isImgGenCapableModel("gpt-image-1.5"), true);
  });
  it("should return false for sora-2-pro", {}, () => {
    assert.equal(p.isImgGenCapableModel("sora-2-pro"), false);
  });
  it("should return false for claude-opus-4-6", {}, () => {
    assert.equal(p.isImgGenCapableModel("claude-opus-4-6"), false);
  });
  it("should return false for v0-1.5-md", {}, () => {
    assert.equal(p.isImgGenCapableModel("v0-1.5-md"), false);
  });
  it(
    "should return false for Llama-4-Maverick-17B-128E-Instruct-FP8",
    {},
    () => {
      assert.equal(
        p.isImgGenCapableModel("Llama-4-Maverick-17B-128E-Instruct-FP8"),
        false
      );
    }
  );
});

describe("isPureImgGenModel", () => {
  it("should return true for  imagen-4.0-ultra-generate-001", {}, () => {
    assert.equal(p.isPureImgGenModel("imagen-4.0-ultra-generate-001"), true);
  });
  it(
    "should return true for gemini-3.1-flash-image-preview (🍌 nano banana 2 🍌)",
    {},
    () => {
      assert.equal(p.isPureImgGenModel("gemini-3.1-flash-image-preview"), true);
    }
  );
  it("should return false for gemini-3.1-pro-preview", {}, () => {
    assert.equal(p.isPureImgGenModel("gemini-3.1-pro-preview"), false);
  });
  it("should return false for grok-4.20-multi-agent-0309", {}, () => {
    assert.equal(p.isPureImgGenModel("grok-4.20-multi-agent-0309"), false);
  });
  it("should return true for grok-imagine-image", {}, () => {
    assert.equal(p.isPureImgGenModel("grok-imagine-image"), true);
  });
  it("should return false for deep-research-pro-preview-12-2025", {}, () => {
    assert.equal(
      p.isPureImgGenModel("deep-research-pro-preview-12-2025"),
      false
    );
  });
  it("should return true for gpt-image-1.5", {}, () => {
    assert.equal(p.isPureImgGenModel("gpt-image-1.5"), true);
  });
  it("should return false for gpt-5.3-codex", {}, () => {
    assert.equal(p.isPureImgGenModel("gpt-5.3-codex"), false);
  });
  it("should return false for claude-opus-4-6", {}, () => {
    assert.equal(p.isPureImgGenModel("claude-opus-4-6"), false);
  });
  it("should return false for v0-1.5-md", {}, () => {
    assert.equal(p.isPureImgGenModel("v0-1.5-md"), false);
  });
  it(
    "should return false for Llama-4-Maverick-17B-128E-Instruct-FP8",
    {},
    () => {
      assert.equal(
        p.isPureImgGenModel("Llama-4-Maverick-17B-128E-Instruct-FP8"),
        false
      );
    }
  );
});

describe("handleImgGenBg", () => {
  it("should return undefined for imagen-4.0-ultra-generate-001", {}, () => {
    assert.equal(p.handleImgGenBg("imagen-4.0-ultra-generate-001"), undefined);
  });
  it(
    "should return undefined for gemini-3.1-flash-image-preview with background=auto and format=webp",
    {},
    () => {
      assert.equal(
        p.handleImgGenBg("gemini-3.1-flash-image-preview", {
          background: "auto",
          format: "webp"
        }),
        undefined
      );
    }
  );
  it(
    "should return undefined for grok-4.20-multi-agent-0309 with background=auto and format=webp",
    {},
    () => {
      assert.equal(
        p.handleImgGenBg("grok-4.20-multi-agent-0309", {
          background: "auto",
          format: "webp"
        }),
        undefined
      );
    }
  );
  it(
    "should return undefined for gpt-5.3-codex with background=auto and format=webp",
    {},
    () => {
      assert.equal(
        p.handleImgGenBg("gpt-5.3-codex", {
          background: "auto",
          format: "webp"
        }),
        undefined
      );
    }
  );
  it(
    "should return opaque for gpt-5.4 with background=opaque and format=webp",
    {},
    () => {
      assert.equal(
        p.handleImgGenBg("gpt-5.4", {
          background: "opaque",
          format: "webp"
        }),
        "opaque"
      );
    }
  );
  it(
    "should return transparent for gpt-5.4 with background=transparent and format=png",
    {},
    () => {
      assert.equal(
        p.handleImgGenBg("gpt-5.4", {
          background: "transparent",
          format: "png"
        }),
        "transparent"
      );
    }
  );
  it(
    "should return undefined for gpt-5.4 with format=jpeg and background=transparent",
    {},
    () => {
      assert.equal(
        p.handleImgGenBg("gpt-5.4", {
          background: "transparent",
          format: "jpeg"
        }),
        undefined
      );
    }
  );
  it(
    "should return auto for gpt-image-1.5 with background=auto and format=webp",
    {},
    () => {
      assert.equal(
        p.handleImgGenBg("gpt-image-1.5", {
          background: "auto",
          format: "webp"
        }),
        "auto"
      );
    }
  );
  it(
    "should return auto for gpt-image-1.5 with background=undefined and format=webp",
    {},
    () => {
      assert.equal(
        p.handleImgGenBg("gpt-image-1.5", {
          background: undefined,
          format: "webp"
        }),
        "auto"
      );
    }
  );
  it(
    "should return auto for gpt-image-1.5 with background=undefined and format=png",
    {},
    () => {
      assert.equal(
        p.handleImgGenBg("gpt-image-1.5", {
          background: undefined,
          format: "png"
        }),
        "auto"
      );
    }
  );
  it(
    "should return undefined for gpt-image-1.5 with background=undefined and format=jpeg",
    {},
    () => {
      assert.equal(
        p.handleImgGenBg("gpt-image-1.5", {
          background: undefined,
          format: "jpeg"
        }),
        undefined
      );
    }
  );
  it(
    "should return undefined for claude-sonnet-4-5-20250929 with background=auto and format=webp",
    {},
    () => {
      assert.equal(
        p.handleImgGenBg("claude-sonnet-4-5-20250929", {
          background: "auto",
          format: "webp"
        }),
        undefined
      );
    }
  );
});
