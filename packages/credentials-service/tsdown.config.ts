import { relative } from "node:path";
import type { UserConfig as Options } from "tsdown";
import { defineConfig } from "tsdown";

export default defineConfig(
  options =>
    ({
      ...options,
      entry: [
        "src/index.ts",
        "src/creds/index.ts",
        "src/types/index.ts",
        "!src/test/**",
        "!src/service/**"
      ],
      cwd: process.cwd(),
      target: ["node26"],
      dts: { tsgo: true },
      unbundle: true,
      fixedExtension: false,
      watch: process.env.NODE_ENV === "development",
      format: ["esm"],
      sourcemap: true,
      tsconfig: relative(process.cwd(), "tsconfig.json"),
      clean: true,
      outDir: "dist"
    }) satisfies Options
);
