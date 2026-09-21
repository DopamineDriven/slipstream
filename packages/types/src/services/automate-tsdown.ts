import { Fs } from "@d0paminedriven/fs";

export class TsDownAuto {
  constructor(protected fs: Fs) {}

  private exclusion(s: string) {
    return (
      s === "src/codegen/index.ts" || s === "src/services/automate-tsdown.ts"
    );
  }
  private fileArr() {
    return this.fs
      .readDir("src", { recursive: true })
      .filter(t => t.lastIndexOf(".") !== -1)
      .map(v => `src/${v}`)
      .map(t => (this.exclusion(t) ? `!${t}` : t))
      .sort((a, b) => a.localeCompare(b) - b.localeCompare(a));
  }

  public exe() {
    const o = this.fileArr();
    this.fs.withWs("tsdown.config.ts", this.config(o));
  }

  private config(arr: string[]) {
    const toStr = JSON.stringify(arr, null, 2);
    // prettier-ignore
    return `import { arch, platform } from "node:os";
import { join, relative, resolve } from "node:path";
import type { UserConfig } from "tsdown";
import { defineConfig } from "tsdown";

const p = platform();
const a = arch();
const executable = p === "win32" ? "tsgo.exe" : "tsgo";
const dirname = \`native-preview-\${p}-\${a}\`;

const path = resolve(
  join(
    process.cwd(),
    \`../../node_modules/@typescript/\${dirname}/lib/\${executable}\`
  )
);

export default defineConfig(
  options =>
    ({
      ...options,
      entry: ${toStr},
      cwd: process.cwd(),
      target: ["node26"],
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
` as const;
  }
}

if (process.argv[3] === "gen") {
  const fs = new Fs(process.cwd());
  const ts = new TsDownAuto(fs);
  ts.exe();
}
