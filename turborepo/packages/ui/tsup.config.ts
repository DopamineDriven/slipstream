import { relative } from "node:path";
import type { Options } from "tsup";
import { defineConfig } from "tsup";

const tsupConfig = (
  options: Omit<
    Options,
    | "entry"
    | "dts"
    | "external"
    | "watch"
    | "keepNames"
    | "format"
    | "sourcemap"
    | "tsconfig"
    | "clean"
    | "outDir"
  >
) =>
  ({
    entry: [
      "src/globals.css",
      "src/index.ts",
      "src/icons/arrow-down-circle.tsx",
      "src/icons/arrow-left.tsx",
      "src/icons/arrow-right.tsx",
      "src/icons/book-open.tsx",
      "src/icons/bot.tsx",
      "src/icons/camera.tsx",
      "src/icons/check.tsx",
      "src/icons/chevron-down.tsx",
      "src/icons/chevron-right.tsx",
      "src/icons/circle-plus.tsx",
      "src/icons/circle.tsx",
      "src/icons/code.tsx",
      "src/icons/compass.tsx",
      "src/icons/copy.tsx",
      "src/icons/expand.tsx",
      "src/icons/file-text.tsx",
      "src/icons/github.tsx",
      "src/icons/history.tsx",
      "src/icons/image-icon.tsx",
      "src/icons/index.tsx",
      "src/icons/key-round.tsx",
      "src/icons/layers.tsx",
      "src/icons/log-out.tsx",
      "src/icons/mail.tsx",
      "src/icons/menu.tsx",
      "src/icons/message-circle-question.tsx",
      "src/icons/message-square-text.tsx",
      "src/icons/message-square.tsx",
      "src/icons/moon.tsx",
      "src/icons/package.tsx",
      "src/icons/palette.tsx",
      "src/icons/panel-left-close.tsx",
      "src/icons/panel-right-close.tsx",
      "src/icons/paperclip.tsx",
      "src/icons/pen-line.tsx",
      "src/icons/plus.tsx",
      "src/icons/search.tsx",
      "src/icons/send.tsx",
      "src/icons/settings.tsx",
      "src/icons/share-icon.tsx",
      "src/icons/sparkles.tsx",
      "src/icons/sun.tsx",
      "src/icons/terminal.tsx",
      "src/icons/user.tsx",
      "src/icons/x.tsx",
      "src/icons/zap.tsx",
      "src/lib/utils.ts",
      "src/ui/avatar.tsx",
      "src/ui/button.tsx",
      "src/ui/card.tsx",
      "src/ui/dialog.tsx",
      "src/ui/dropdown-menu.tsx",
      "src/ui/input.tsx",
      "src/ui/label.tsx",
      "src/ui/progress.tsx",
      "src/ui/scroll-area.tsx",
      "src/ui/separator.tsx",
      "src/ui/textarea.tsx",
      "!src/services/read.ts",
      "!src/services/postbuild.ts",
      "!src/services/__out__/*.json"
    ],
    dts: true,
    external: ["react"],
    watch: process.env.NODE_ENV === "development",
    keepNames: true,
    target: ["esnext"],
    format: ["esm"],
    sourcemap: true,
    tsconfig: relative(process.cwd(), "tsconfig.json"),
    clean: true,
    outDir: "dist",
    ...options
  }) satisfies Options;

export default defineConfig(tsupConfig);
