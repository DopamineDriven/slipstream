import type { UserConfig as Options } from "tsdown";
import { defineConfig } from "tsdown";

export default defineConfig(
  (options: Options) =>
    ({
      ...options,
      entry: ["!prisma/**", "!src/test/**/*.ts", "src/**/*.ts"],
      format: ["esm"],
      clean: true,
      dts: { tsgo: true },
      cwd: process.cwd(),
      target: "node25",
      fixedExtension: false,
      outDir: "dist",
      unbundle: true
    }) satisfies Options
);
