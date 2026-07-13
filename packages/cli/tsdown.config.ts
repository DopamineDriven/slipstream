import { relative } from "node:path";
import type { UserConfig } from "tsdown";
import { defineConfig } from "tsdown";

export default defineConfig(
  options =>
    ({
      ...options,
      entry: [
        "src/chat-ws-client.ts",
        "src/chat-ws.ts",
        "src/client.ts",
        "src/config.ts",
        "src/convo-picker.ts",
        "src/hydrated-history.ts",
        "src/index.ts",
        "src/provider-context.ts",
        "src/render.ts",
        "src/repl.ts",
        "src/types.ts",
        "src/bin/slipstream.ts",
        "!src/__out__/**/*",
        "!src/scripts/**/*",
        "!src/tests/**/*"
      ],
      cwd: process.cwd(),
      target: ["node26"],
      fixedExtension: false,
      dts: { tsgo: true },
      watch: process.env.NODE_ENV === "development",
      format: ["esm"],
      sourcemap: true,
      tsconfig: relative(process.cwd(), "tsconfig.json"),
      clean: true,
      outDir: "dist",
      unbundle: true
    }) satisfies UserConfig
);
