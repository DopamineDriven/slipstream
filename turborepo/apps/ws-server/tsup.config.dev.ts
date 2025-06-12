import { relative } from "node:path";
import type { Options } from "tsup";
import esbuildPluginPino from "esbuild-plugin-pino";
import { defineConfig } from "tsup";

const tsupConfig = (options: Options) =>
  ({
    entry: [
      "src/index.ts",
      "src/auth/index.ts",
      "src/logger/index.ts",
      "src/pubsub/index.ts",
      "src/types/index.ts",
      "src/ws-server/index.ts",
      "!src/__generated__/**/*",
      "!src/test/**/*",
      "!public/**/*"
    ],
    target: ["node22"],
    esbuildPlugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
    dts: true,
    watch: process.env.NODE_ENV === "development",
    keepNames: true,
    format: "esm",
    sourcemap: true,
    noExternal: ["pino", "pino-pretty"],
    onSuccess: "node dist/index.js",
    tsconfig: relative(process.cwd(), "tsconfig.json"),
    clean: true,
    outDir: "dist",
    ...options
  }) satisfies Options;

export default defineConfig(tsupConfig);
