import { Fs } from "@d0paminedriven/fs";

export class TsDownAuto {
  constructor(protected fs: Fs) {}

  private readTopDir(argv5?: string) {
    const argToArr = argv5?.split(",");
    const o = this.fs
      .readDir("src", { recursive: true })
      .filter(
        t =>
          !t.startsWith("__out__") &&
          !t.startsWith("test") &&
          !t.startsWith("tests") &&
          t.lastIndexOf(".") !== -1
      )
      .map(v => `src/${v}`);
    return argToArr ? [...o, ...argToArr] : [...o];
  }

  public exe(argv5?: string) {
    this.fs.withWs("tsdown.config.ts", this.config(this.readTopDir(argv5)));
  }

  private config(arr: string[]) {
    const toStr = JSON.stringify(arr, null, 2);
    return `import { relative } from "node:path";
import type { UserConfig } from "tsdown";
import { defineConfig } from "tsdown";

export default defineConfig(
  options =>
    ({
      ...options,
      entry: ${toStr},
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
` as const;
  }
}

if (process.argv[3] === "gen") {
  const fs = new Fs(process.cwd());
  const ts = new TsDownAuto(fs);
  ts.exe(process.argv[5]);
}
