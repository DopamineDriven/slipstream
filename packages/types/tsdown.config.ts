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
        "!src/codegen/index.ts",
        "!src/services/automate-tsdown.ts",
        "src/codegen-types.ts",
        "src/codegen/__gen__/display-name-to-model-id-audio-gen.ts",
        "src/codegen/__gen__/display-name-to-model-id-img-gen.ts",
        "src/codegen/__gen__/display-name-to-model-id-video-gen.ts",
        "src/codegen/__gen__/display-name-to-model-id.ts",
        "src/codegen/__gen__/display-names-by-provider-audio-gen.ts",
        "src/codegen/__gen__/display-names-by-provider-img-gen.ts",
        "src/codegen/__gen__/display-names-by-provider-video-gen.ts",
        "src/codegen/__gen__/display-names-by-provider.ts",
        "src/codegen/__gen__/model-id-to-display-name-audio-gen.ts",
        "src/codegen/__gen__/model-id-to-display-name-img-gen.ts",
        "src/codegen/__gen__/model-id-to-display-name-video-gen.ts",
        "src/codegen/__gen__/model-id-to-display-name.ts",
        "src/codegen/__gen__/model-ids-by-provider-audio-gen.ts",
        "src/codegen/__gen__/model-ids-by-provider-img-gen.ts",
        "src/codegen/__gen__/model-ids-by-provider-video-gen.ts",
        "src/codegen/__gen__/model-ids-by-provider.ts",
        "src/contract/ai-chat-events.ts",
        "src/contract/asset-events.ts",
        "src/contract/cli-events.ts",
        "src/contract/conversation-list-events.ts",
        "src/contract/hydrate-conversation.ts",
        "src/contract/image-gen-events.ts",
        "src/contract/index.ts",
        "src/contract/local-tool-events.ts",
        "src/contract/ping.ts",
        "src/contract/provider-context-events.ts",
        "src/contract/stt-events.ts",
        "src/contract/tts-events.ts",
        "src/contract/typing-indicator.ts",
        "src/contract/user-rxn-events.ts",
        "src/events-audio.ts",
        "src/events-images.ts",
        "src/events-workup.ts",
        "src/index.ts",
        "src/models.ts",
        "src/stt.ts",
        "src/tts.ts",
        "src/types.ts",
        "src/utils.ts"
      ],
      cwd: process.cwd(),
      target: ["node26"],
      fixedExtension: false,
      dts: { tsgo: { path } },
      format: ["esm"],
      sourcemap: true,
      tsconfig: relative(process.cwd(), "tsconfig.json"),
      clean: true,
      outDir: "dist",
      unbundle: true
    }) satisfies UserConfig
);
