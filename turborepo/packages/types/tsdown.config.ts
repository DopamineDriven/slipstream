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
        "src/events-workup.ts",
        "src/events.ts",
        "src/utils.ts",
        "src/models.ts",
        "src/types.ts",
        "src/codegen/**/*.ts"
      ],
      cwd: process.cwd(),
      target: ["node24.10.0"],
      dts: true,
      watch: process.env.NODE_ENV === "development",
      format: ["esm"],
      sourcemap: true,
      tsconfig: relative(process.cwd(), "tsconfig.json"),
      clean: true,
      outDir: "dist"
    }) satisfies Options
);
