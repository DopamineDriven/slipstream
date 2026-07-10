import { relative, resolve } from "path";
import { Fs } from "@d0paminedriven/fs";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import * as p from "./__out__/emojis/emoji-repo.json" with { type: "json" };

const fs = new Fs(process.cwd());

const x = p.default.payload.fileTree["png/160"].items.map(t => t.path);

const toWrite = `export const appleEmojiArr = ${JSON.stringify(x, null, 2)};`;

fs.withWs("src/test/paths-to-fetch.ts", toWrite);

const re = resolve("/usr/share/fonts/truetype/noto", "NotoColorEmoji.ttf");

const s = fs.fileToBuffer(re);

console.log(s);
GlobalFonts.registerFromPath(
  relative(
    process.cwd(),
    resolve("/usr/share/fonts/truetype/noto", "NotoColorEmoji.ttf")
  ),
  "Noto Color Emoji"
);
GlobalFonts.registerFromPath(
  relative(
    process.cwd(),
    "src/test/__out__/emojis/fonts/AppleColorEmoji_WindowsCompatible.ttf"
  ),
  "Apple Emoji"
);

fs.withWs(
  "src/test/__out__/global-fonts/families.json",
  JSON.stringify(GlobalFonts.families, null, 2)
);
const canvas = createCanvas(760, 360);
const ctx = canvas.getContext("2d");

ctx.font = "50px Apple Emoji";
ctx.strokeText("🍷🐉🥑🌚🌝💅💰🥺😿😼", 50, 150);

ctx.font = "100px COLRv1";
ctx.fillText("abc", 50, 300);

const b = canvas.toBuffer("image/png");

fs.withWs("src/test/__out__/emojis/draw-emoji-2.png", b);
