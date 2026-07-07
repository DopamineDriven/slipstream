import { Fs } from "@d0paminedriven/fs";

export const pathname = "/mnt/c/Users/Anthr/Documents/Platform-2026/Chapters";

const fs = new Fs(process.cwd());

fs.withWs(`${pathname}/testing/test.txt`, "🌚");
