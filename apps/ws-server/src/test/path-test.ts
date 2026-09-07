import { readdirSync } from "node:fs";
import { arch, platform } from "node:os";
import { join, resolve } from "node:path";

console.log({ platform: platform(), arch: arch() });
const p = platform();
const a = arch();
const executable = p === "win32" ? "tsgo.exe" : "tsgo";
const dirname = `native-preview-${p}-${a}`;
const dir = `../../node_modules/@typescript/${dirname}/lib`;
const path = `${dir}/${executable}`;
const exePath = resolve(join(process.cwd(), path));

const readDir = readdirSync(resolve(join(process.cwd(), dir)));
console.log({exePath, libDir: readDir});
