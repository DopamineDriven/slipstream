import { Fs } from "@d0paminedriven/fs";

class GenConfig extends Fs {
  constructor(public override cwd: string) {
    super((cwd ??= process.cwd()));
  }

  private recursivelyReadDir() {
    return this.readDir("src", { recursive: true })
      .filter(t => /(?:(services\/))/.test(t) === false)
      .filter(t => /\./.test(t) === true);
  }

  private exportsWorkup() {
    return JSON.stringify(
      Object.fromEntries(
        this.recursivelyReadDir().map(
          t =>
            [
              `./${(/(:?(icons\/index.ts|index.ts|utils\/))/g.test(t) ? t.replace("index.ts", "") && t.split(/\.ts$/)[0] : t.replace(/\.ts$/, "")) && t.replace(/\.(ts|tsx)$/, "")}`,
              `./dist/${t.replace(/\.(ts|tsx)$/, ".js")}`
            ] as const
        )
      ),
      null,
      2
    );
  }

  private typesWorkup() {
    const splitter = (target: "icons" | "ui" | "lib") =>
      this.recursivelyReadDir()
        .filter(t => t.includes("/"))
        .filter(v => v.split(/\//)[0] === target)
        .map(t => `dist/${t.replace(/\.(ts|tsx)$/, ".d.ts")}`);
    console.log(splitter("ui"));

    return JSON.stringify(
      {
        typesVersions: {
          "*": {
            "*": ["dist/*.d.ts", "dist/*.d.cts", "dist/*/index.d.ts"],
            "globals.css": ["dist/globals.d.ts"],
            icons: splitter("icons"),
            lib: splitter("lib"),
            ui: splitter("ui")
          }
        }
      },
      null,
      2
    );
  }
  private tsupWorkup() {
    return JSON.stringify(
      {
        entry: this.recursivelyReadDir()
          .map(t => `src/${t}`)
          .concat([
            `!src/services/read.ts`,
            `!src/services/postbuild.ts`,
            "!src/services/__out__/*.json"
          ])
      },
      null,
      2
    );
  }

  public async writeTypes() {
   return this.withWs("src/services/__out__/types.json", this.typesWorkup());
  }

  public async writeTsup() {
   return this.withWs("src/services/__out__/tsup.json", this.tsupWorkup());
  }

  public async writeExports() {
   return this.withWs("src/services/__out__/exports.json", this.exportsWorkup());
  }

  public exe<const T extends "types" | "exports" | "tsup" | "all">(
    target: T
  ) {
    switch (target) {
      case "exports":
        this.writeExports();
        break;
      case "tsup":
        this.writeTsup();
        break;
      case "types":
        this.writeTypes();
        break;
      default:
        Promise.all([this.writeTypes(), this.writeTsup(), this.writeExports()]);
        break;
    }
  }
}

const gen = new GenConfig(process.cwd());

if (process.argv[3]) {
  if (process.argv[3] === "exports") {
    gen.exe("exports");
  }
   else if (process.argv[3] === "types") {
    gen.exe("types");
  }
   else if (process.argv[3] === "tsup") {
    gen.exe("tsup");
  }
  else {
    gen.exe("all");
  }
}
