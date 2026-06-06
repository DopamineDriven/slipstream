import { relative } from "node:path";
import type { UserConfig as Options } from "tsdown";
import { defineConfig } from "tsdown";

export default defineConfig(
  options =>
    ({
      ...options,
      entry: [
        "src/globals.css",
        "src/index.ts",
        "src/icons/*.tsx",
        "src/lib/*.ts",
        "src/ui/*.tsx",
        "src/ui/base/progress.tsx",
        "!src/services/postbuild.ts"
      ],
      dts: true,
      external: ["react"],
      platform: "neutral",
      fixedExtension: false,
      target: ["esnext"],
      format: ["esm"],
      sourcemap: true,
      tsconfig: relative(process.cwd(), "tsconfig.json"),
      cwd: process.cwd(),
      clean: true,
      outDir: "dist",
      unbundle: true,
      outputOptions: out => ({
        ...out,
        chunkFileNames: chunk =>
          chunk.isEntry && chunk.name.startsWith("globals")
            ? "globals.css"
            : "chunk-[hash].js",
        entryFileNames: chunk =>
          chunk.name === "index" ? "index.js" : "[name].js"
      })
    }) satisfies Options
);
