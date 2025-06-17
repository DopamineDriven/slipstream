import { Fs } from "@d0paminedriven/fs";

const fs = new Fs(process.cwd());

const readDir = fs.readDir("src/icons", { recursive: true });

if (process.argv[3] === "exports") {
  const workup = readDir.map(
    t =>
      [
        `./icons/${t.replace(".tsx", "")}`,
        `./dist/icons/${t.replace(".tsx", ".js")}`
      ] as const
  );
  console.log(JSON.stringify(Object.fromEntries(workup), null, 2));
}

if (process.argv[3] === "tsup") {
  const tsup = readDir
          .map(t => `src/icons/${t}` as const);

  console.log(tsup);
}

if (process.argv[3] === "types") {
  const types = readDir.map((t) => `dist/icons/${t.replace(".tsx", ".d.ts")}`);

  console.log(JSON.stringify(types, null, 2))
}
