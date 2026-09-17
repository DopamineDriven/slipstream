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
        "!src/services/automate-tsdown.ts",
        "src/index.ts",
        "src/worklet.ts",
        "src/types/index.ts",
        "src/bin/cli.ts"
      ],
      copy: [
        {
          from: "src/types/audioworklet.d.ts",
          to: "dist/types"
        }
      ],
      cwd: process.cwd(),
      target: ["esnext"],
      fixedExtension: false,
      dts: { tsgo: { path } },
      format: ["esm"],
      sourcemap: false,
      tsconfig: relative(process.cwd(), "tsconfig.json"),
      clean: true,
      outDir: "dist",
      unbundle: true
    }) satisfies UserConfig
);
