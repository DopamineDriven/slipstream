import { Fs } from "@d0paminedriven/fs";

if (process.argv[3] === "postinstall") {
  (async () => {
    const fs = new Fs(process.cwd());
    const getFiles = fs
      .readDir("generated/prisma", { recursive: true })
      .filter(t => /\./g.test(t));
    return getFiles.forEach(function (t) {
      const file = fs.fileToBuffer(`generated/prisma/${t}`);
      fs.withWs(`dist/generated/prisma/${t}`, file);
    });
  })();
}
