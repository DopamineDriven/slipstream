import { relative } from "node:path";
import type { Options } from "tsdown";
import { defineConfig } from "tsdown";

export default defineConfig(
  (
    options: Omit<
      Options,
      | "entry"
      | "target"
      | "dts"
      | "format"
      | "cwd"
      | "clean"
      | "outDir"
      | "tsconfig"
    >
  ) =>
    ({
      ...options,
      entry: [
        "!src/generated/prisma-edge/internal/query_engine_bg.*",
        "!src/test/**",
        "!edge/**",
        "src/**/*.ts"
      ],
      format: ["esm"],
      clean: true,
      dts: true,
      cwd: process.cwd(),
      target: "node24",
      outDir: "dist",
      unbundle: true
    }) satisfies Options
);
