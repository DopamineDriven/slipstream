import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProviderValidation } from "@/provider-validation/index.ts";

const p = new ProviderValidation();
describe("handleOutputSize", () => {
  it("should return auto for openai provdier with no model set", {}, () => {
    assert.equal(p.handleOutputSize("openai"), "auto");
  });
  it("should return 1:1 for gemini provdier with no model set", {}, () => {
    assert.equal(p.handleOutputSize("gemini"), "1:1");
  });
  it("should return undefined for grok provdier with no model set", {}, () => {
    assert.equal(p.handleOutputSize("grok"), undefined);
  });
});

describe("handleImgGenOutputQuality", () => {
  it("should return auto for openai provdier with no model set", {}, () => {
    assert.equal(p.handleImgGenOutputQuality("openai"), "auto");
  });
  it(
    "should return undefined for gemini provdier with no model set",
    {},
    () => {
      assert.equal(p.handleImgGenOutputQuality("gemini"), undefined);
    }
  );
  it(
    "should return 1K for gemini provdier with model set to imagen-4.0-ultra-generate-001",
    {},
    () => {
      assert.equal(
        p.handleImgGenOutputQuality("gemini", "imagen-4.0-ultra-generate-001"),
        "1K"
      );
    }
  );
  it("should return undefined for grok provdier with no model set", {}, () => {
    assert.equal(p.handleImgGenOutputQuality("grok"), undefined);
  });
});

describe("handleImgGenCompression", () => {
  it(
    "should return undefined for openai provdier with model set to gpt-image-1 and output_format set to png and output_compression set to 90",
    {},
    () => {
      assert.equal(
        p.handleImgGenCompression("openai", "gpt-image-1", {
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
        p.handleImgGenCompression("openai", "gpt-image-1", {
          output_compression: 90,
          output_format: "webp"
        }),
        90
      );
    }
  );
  it(
    "should return 100 for openai provider with model set to gpt-image-1, output_format set to jpeg, and output_compression set to 110",
    {},
    () => {
      assert.equal(
        p.handleImgGenCompression("openai", "gpt-image-1", {
          output_compression: 110,
          output_format: "jpeg"
        }),
        100
      );
    }
  );
  it(
    "should return 100 for openai provider with model set to gpt-image-1, output_format set to jpeg, and output_compression set to undefined",
    {},
    () => {
      assert.equal(
        p.handleImgGenCompression("openai", "gpt-image-1", {
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
        p.handleImgGenCompression("gemini", "imagen-4.0-ultra-generate-001", {
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
        p.handleImgGenCompression("gemini", "gemini-2.5-flash-image", {
          output_compression: 100,
          output_format: "jpeg"
        }),
        undefined
      );
    }
  );
  it(
    "should return undefined for anthropic provider with model set to undefined, output_format set to jpeg, and output_compression set to 100",
    {},
    () => {
      assert.equal(
        p.handleImgGenCompression("anthropic", undefined, {
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
    assert.equal(p.handlePartialImgGen("grok"), undefined);
  });
  it("should return undefined for gemini provider", {}, () => {
    assert.equal(p.handlePartialImgGen("gemini"), undefined);
  });
  it(
    "should return 0 for openai provider with gpt-image-1 or gpt-image-1-mini set",
    {},
    () => {
      assert.equal(p.handlePartialImgGen("openai", "gpt-image-1"), 0);
    }
  );
  it("should return 0 for openai provider with gpt-5 set", {}, () => {
    assert.equal(p.handlePartialImgGen("openai", "gpt-5"), 0);
  });
  it(
    "should return undefined for openai provider with dall-e-3 set",
    {},
    () => {
      assert.equal(p.handlePartialImgGen("openai", "dall-e-3"), undefined);
    }
  );
});

describe("handleImgGenCount", () => {
  it(
    "should return 4 for imagen-4.0-ultra-generate-001 model with n=undefined",
    {},
    () => {
      assert.equal(p.handleImgGenCount("imagen-4.0-ultra-generate-001"), 4);
    }
  );
  it(
    "should return 1 for gemini-2.5-flash-image model with n=-11 set as input",
    {},
    () => {
      assert.equal(
        p.handleImgGenCount("gemini-2.5-flash-image", { n: -11 }),
        1
      );
    }
  );
  it(
    "should return 7 for gpt-image-1 or gpt-image-1-mini with n=7 set as input",
    {},
    () => {
      assert.equal(p.handleImgGenCount("gpt-image-1", { n: 7 }), 7);
    }
  );
  it("should return 1 for dall-e-3 model with n=2 as input", {}, () => {
    assert.equal(p.handleImgGenCount("dall-e-3", { n: 2 }), 1);
  });
  it("should return 10 for dall-e-3 with n=2000 set", {}, () => {
    assert.equal(p.handleImgGenCount("dall-e-2", { n: 2000 }), 10);
  });
});

describe("isImgGenCapableModel", () => {
  it(
    "should return true for provider=gemini, model=imagen-4.0-ultra-generate-001",
    {},
    () => {
      assert.equal(
        p.isImgGenCapableModel("gemini", "imagen-4.0-ultra-generate-001"),
        true
      );
    }
  );
  it(
    "should return false for provider=gemini, model=gemini-2.5-pro",
    {},
    () => {
      assert.equal(p.isImgGenCapableModel("gemini", "gemini-2.5-pro"), false);
    }
  );
  it("should return false for provider=grok, model=grok-4-0709", {}, () => {
    assert.equal(p.isImgGenCapableModel("grok", "grok-4-0709"), false);
  });
  it(
    "should return true for provider=grok, model=grok-2-image-1212",
    {},
    () => {
      assert.equal(p.isImgGenCapableModel("grok", "grok-2-image-1212"), true);
    }
  );
  it("should return true for provider=openai, model=gpt-5", {}, () => {
    assert.equal(p.isImgGenCapableModel("openai", "gpt-5"), true);
  });
  it("should return true for provider=openai, model=gpt-image-1", {}, () => {
    assert.equal(p.isImgGenCapableModel("openai", "gpt-image-1"), true);
  });
  it("should return false for provider=openai, model=gpt-3.5-turbo", {}, () => {
    assert.equal(p.isImgGenCapableModel("openai", "gpt-3.5-turbo"), false);
  });
  it(
    "should return false for provider=anthropic, model=claude-sonnet-4-5-20250929",
    {},
    () => {
      assert.equal(
        p.isImgGenCapableModel("anthropic", "claude-sonnet-4-5-20250929"),
        false
      );
    }
  );
  it("should return false for provider=vercel, model=v0-1.5-md", {}, () => {
    assert.equal(p.isImgGenCapableModel("vercel", "v0-1.5-md"), false);
  });
  it(
    "should return false for provider=meta, model=Llama-4-Maverick-17B-128E-Instruct-FP8",
    {},
    () => {
      assert.equal(
        p.isImgGenCapableModel(
          "meta",
          "Llama-4-Maverick-17B-128E-Instruct-FP8"
        ),
        false
      );
    }
  );
});
