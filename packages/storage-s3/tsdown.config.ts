import { arch, platform } from "node:os";
import { join, relative, resolve } from "node:path";
import type { UserConfig } from "tsdown";
import { defineConfig } from "tsdown";

const p = platform();
const a = arch();
const executable = p === "win32" ? "tsgo.exe" : "tsgo";
const dirname = `native-preview-${p}-${a}`;

const path = resolve(
  join(
    process.cwd(),
    `../../node_modules/@typescript/${dirname}/lib/${executable}`
  )
);

export default defineConfig(
  options =>
    ({
      ...options,
      entry: [
        "src/index.ts",
        "src/utils/index.ts",
        "src/s3/index.ts",
        "src/types/index.ts",
        "!src/test/**"
      ],
      target: ["node26"],
      dts: { tsgo: { path } },
      fixedExtension: false,
      unbundle: true,
      watch: process.env.NODE_ENV === "development",
      format: ["esm"],
      cwd: process.cwd(),
      sourcemap: true,
      tsconfig: relative(process.cwd(), "tsconfig.json"),
      clean: true,
      outDir: "dist"
    }) satisfies UserConfig
);
