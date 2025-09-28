import { relative } from "node:path";
import type { Options } from "tsup";
import { wasmLoader } from "esbuild-plugin-wasm";
import { defineConfig } from "tsup";

export default defineConfig(
  options =>
    ({
      clean: true,
      dts: true,
      entry: [
        "!src/generated/prisma-edge/internal/query_engine_bg.*",
        "!src/test/**",
        "src/**/*.ts"
      ],
      esbuildPlugins: [wasmLoader()],
      loader: { ...options.loader, ".wasm": "file" },
      format: ["esm"],
      minify: true,
      target: "esnext",
      outDir: "dist",
      treeshake: true
    }) satisfies Options
);
