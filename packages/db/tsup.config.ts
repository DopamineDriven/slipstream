import { relative } from "node:path";
import type { Options } from "tsup";
import { defineConfig } from "tsup";

const tsupConfig = (options: Options) =>
  ({
    ...options,
    entry: ["!prisma/**", "!src/test/**/*.ts", "src/**/*.ts"],
    
    dts: true,
    watch: process.env.NODE_ENV === "development",
    keepNames: true,
    target: ["esnext"],
    format: ["esm"],
    sourcemap: true,
    tsconfig: relative(process.cwd(), "tsconfig.json"),
    clean: true,
    outDir: "dist"
  }) satisfies Options;

export default defineConfig(tsupConfig);
