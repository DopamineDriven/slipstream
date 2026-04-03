import { Fs } from "@d0paminedriven/fs";

const fs = new Fs(process.cwd());

function ScanOutput() {
  const readDir = fs.readDir("src/generated/prisma", { recursive: true });
  console.log(readDir);
}

if (process.argv[2] === "--scan" && process.argv[3] === "output") {
  ScanOutput();
}
