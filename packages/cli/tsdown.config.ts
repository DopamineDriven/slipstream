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
        "src/chat-ws-client.ts",
        "src/chat-ws.ts",
        "src/client-context.ts",
        "src/client.ts",
        "src/config.ts",
        "src/convo-picker.ts",
        "src/hydrated-history.ts",
        "src/identity-config.ts",
        "src/index.ts",
        "src/local-tools.ts",
        "src/markdown-ansi.ts",
        "src/message-blocks.ts",
        "src/model-picker.ts",
        "src/provider-context.ts",
        "src/render.ts",
        "src/repl.ts",
        "src/types.ts",
        "src/workspace-read-tools.ts",
        "src/bin/aic.ts",
        "!src/__out__/**/*",
        "!src/scripts/**/*",
        "!src/tests/**/*"
      ],
      cwd: process.cwd(),
      target: ["node26"],
      fixedExtension: false,
      dts: { tsgo: { path } },
      watch: process.env.NODE_ENV === "development",
      format: ["esm"],
      sourcemap: true,
      tsconfig: relative(process.cwd(), "tsconfig.json"),
      clean: true,
      outDir: "dist",
      unbundle: true
    }) satisfies UserConfig
);
