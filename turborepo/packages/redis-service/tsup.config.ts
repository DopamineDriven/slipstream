import { relative } from "node:path";
import type { Options } from "tsup";
import { defineConfig } from "tsup";

const tsupConfig = (options: Options) =>
  ({
    entry: [
      "src/index.ts",
      "src/context/index.ts",
      "src/service/index.ts",
      "src/service/types.ts",
      "src/pubsub/channels.ts",
      "src/pubsub/enhanced-client.ts",
      "src/pubsub/extended-events.ts",
      "!src/test/**"
    ],
    target: ["node24"],
    dts: true,
    watch: process.env.NODE_ENV === "development",
    keepNames: true,
    format: ["esm"],
    sourcemap: true,
    tsconfig: relative(process.cwd(), "tsconfig.json"),
    clean: true,
    outDir: "dist",
    ...options
  }) satisfies Options;

export default defineConfig(tsupConfig);
