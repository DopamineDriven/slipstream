import { relative } from "node:path";
import type { UserConfig as Options } from "tsdown";
import { defineConfig } from "tsdown";

export default defineConfig(
  (
    options: Omit<
      Options,
      | "entry"
      | "target"
      | "dts"
      | "watch"
      | "format"
      | "cwd"
      | "sourcemap"
      | "clean"
      | "outDir"
      | "tsconfig"
    >
  ) =>
    ({
      ...options,
      entry: [
        "src/index.ts",
        "src/anthropic/index.ts",
        "src/anthropic/types.ts",
        "src/anthropic/workup.ts",
        "src/byte-codec/index.ts",
        "src/extract/index.ts",
        "src/gemini/index.ts",
        "src/gemini/types.ts",
        "src/gemini/workup.ts",
        "src/image/index.ts",
        "src/logger/index.ts",
        "src/meta/index.ts",
        "src/mixins/index.ts",
        "src/models/index.ts",
        "src/openai/gpt-image.ts",
        "src/openai/index.ts",
        "src/openai/types.ts",
        "src/openai/workup.ts",
        "src/pdf/index.ts",
        "src/prisma/attachment-provider.ts",
        "src/prisma/attachment.ts",
        "src/prisma/chat.ts",
        "src/prisma/index.ts",
        "src/prisma/user-meta.ts",
        "src/prisma/utils.ts",
        "src/providers/index.ts",
        "src/resolver/index.ts",
        "src/types/index.ts",
        "src/vercel/index.ts",
        "src/vercel/sse.ts",
        "src/ws-server/index.ts",
        "src/xai/collections.ts",
        "src/xai/event-types.ts",
        "src/xai/img-gen.ts",
        "src/xai/index.ts",
        "src/xai/response-sse.ts",
        "src/xai/responses-api.ts",
        "src/xai/responses-types.ts",
        "src/xai/types.ts",
        "src/xai/workup.ts",
        "!src/__out__/**/*",
        "!src/test/**/*",
        "!public/**/*"
      ],
      cwd: process.cwd(),
      target: ["node25"],
      fixedExtension: false,
      dts: { tsgo: true },
      watch: process.env.NODE_ENV === "development",
      format: ["esm"],
      sourcemap: true,
      tsconfig: relative(process.cwd(), "tsconfig.json"),
      clean: true,
      outDir: "dist",
      unbundle: true
    }) satisfies Options
);
