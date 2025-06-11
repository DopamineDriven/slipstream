import { relative } from "node:path";
import type { Options } from "tsup";
import { defineConfig } from "tsup";

const tsupConfig = (options: Options) =>
  ({
    entry: [
      "src/index.ts",
      "src/globals.css",
      "src/icons/arrow-right.tsx",
      "src/icons/code.tsx",
      "src/icons/github.tsx",
      "src/icons/index.tsx",
      "src/icons/layers.tsx",
      "src/icons/moon.tsx",
      "src/icons/package.tsx",
      "src/icons/sun.tsx",
      "src/icons/terminal.tsx",
      "src/icons/zap.tsx",
      "src/lib/utils.ts",
      "src/ui/button.tsx",
      "!src/services/postbuild.ts"
    ],
    // esbuildOptions: (options, _) => {
    //   options.keepNames = true;
    //   options.minifyIdentifiers = false;
    // },
    // minifyIdentifiers: false,
    // banner: { js: '"use client"' },
    dts: true,
    external: ["react"],
    watch: process.env.NODE_ENV === "development",
    keepNames: true,
    format: ["cjs", "esm"],
    sourcemap: true,
    tsconfig: relative(process.cwd(), "tsconfig.json"),
    clean: true,
    outDir: "dist",
    ...options
  }) satisfies Options;

export default defineConfig(tsupConfig);
