import { Fs } from "@d0paminedriven/fs";

const fs = new Fs(process.cwd());

const secrets = fs.fileToBuffer(".env").toString("utf-8");

const splitFirstEqual = /(?:(=)){1}/;

const manipulate = Object.fromEntries(
  secrets
    .split(`\n`)
    .filter(t => !t.startsWith("#"))
    .filter(t => t.length > 0)
    .map(t => t.split(splitFirstEqual).filter((_, i) => i !== 1))
    .map(v => [v[0], v.slice(1).join("")])
    .filter(t => typeof t !== "undefined") as [string, string][]
);

function toTaskDefFormat(props: { [k: string]: string }) {
  const arr = Array.of<{ name: string; value: string }>();
  Object.entries(props).forEach(function ([k, v]) {
    arr.push({ name: k, value: v as string });
  });
  return arr;
}
// awk -v ORS='\\n' '1'
console.log(JSON.stringify(toTaskDefFormat(manipulate), null, 2));
console.log(JSON.stringify(manipulate, null, 2));


