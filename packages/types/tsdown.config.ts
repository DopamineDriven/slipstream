import { relative } from "node:path";
import type { InlineConfig } from "tsdown";
import { defineConfig } from "tsdown";

export default defineConfig(
  options =>
    ({
      ...options,
      entry: [
        "src/index.ts",
        "src/codegen-types.ts",
        "src/events-audio.ts",
        "src/events-images.ts",
        "src/events-workup.ts",
        "src/events.ts",
        "src/utils.ts",
        "src/local-tools.ts",
        "src/models.ts",
        "src/types.ts",
        "src/codegen/__gen__/display-name-to-model-id-img-gen.ts",
        "src/codegen/__gen__/display-name-to-model-id-video-gen.ts",
        "src/codegen/__gen__/display-name-to-model-id.ts",
        "src/codegen/__gen__/display-names-by-provider-img-gen.ts",
        "src/codegen/__gen__/display-names-by-provider-video-gen.ts",
        "src/codegen/__gen__/display-names-by-provider.ts",
        "src/codegen/__gen__/model-id-to-display-name-img-gen.ts",
        "src/codegen/__gen__/model-id-to-display-name-video-gen.ts",
        "src/codegen/__gen__/model-id-to-display-name.ts",
        "src/codegen/__gen__/model-ids-by-provider-img-gen.ts",
        "src/codegen/__gen__/model-ids-by-provider-video-gen.ts",
        "src/codegen/__gen__/model-ids-by-provider.ts"
      ],
      cwd: process.cwd(),
      target: ["node26"],
      fixedExtension: false,
      dts: { tsgo: true },
      watch: process.env.NODE_ENV === "development",
      format: ["esm"],
      sourcemap: true,
      tsconfig: relative(process.cwd(), "tsconfig.json"),
      clean: true,
      outDir: "dist",
      unbundle: true
    }) satisfies InlineConfig
);
