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
        "src/globals.css",
        "src/index.ts",
        "src/icons/*.tsx",
        "src/lib/*.ts",
        "src/ui/*.tsx",
        "src/ui/base/progress.tsx",
        "!src/services/icon-workup.ts",
        "!src/services/postbuild.ts"
      ],
      dts: true,
      external: ["react"],
      platform: "neutral",
      watch: process.env.NODE_ENV === "development",
      target: ["esnext"],
      format: ["esm"],
      sourcemap: true,tsconfig: relative(process.cwd(), "tsconfig.json"),
      cwd: process.cwd(),
      clean: true,
      outDir: "dist"
    }) satisfies Options
);
