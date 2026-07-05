import { Fs } from "@d0paminedriven/fs";

const fs = new Fs(process.cwd());

const files = fs
  .readDir("src/test/__out__/condensed")
  .filter(
    t => t.lastIndexOf(".") !== -1 && t.slice(t.lastIndexOf(".") + 1) === "pdf"
  );

fs.withWs(
  "src/test/__out__/condensed/inventory/files.json",
  JSON.stringify(files, null, 2)
);
