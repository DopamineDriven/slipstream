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
        "src/utils/index.ts",
        "src/s3/index.ts",
        "src/types/index.ts",
        "!src/test/**"
      ],
      target: ["node25"],
      dts: true,
      fixedExtension: false,
      watch: process.env.NODE_ENV === "development",
      format: ["esm"],
      cwd: process.cwd(),
      sourcemap: true,
      tsconfig: relative(process.cwd(), "tsconfig.json"),
      clean: true,
      outDir: "dist"
    }) satisfies Options
);
