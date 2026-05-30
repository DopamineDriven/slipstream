import { Fs } from "@d0paminedriven/fs";

const _fs = new Fs(process.cwd());

const URLTARGTED = `https://raw.githubusercontent.com/jln13x/tailwindcss-highlights/refs/heads/main/highlights/`;
function toHighlights() {
  const arr = Array.from({ length: 20 });
  return arr.map((_, o) => URLTARGTED + `${++o}.svg`);
}
async function generateHighlights(urls: string[]) {
  let i = 0;
  for (const url of urls) {
    _fs.fetchRemoteWriteLocalLargeFiles(url, `public/highlights/${++i}`);
  }
}

generateHighlights(toHighlights()).then(() => console.log("finished"));
