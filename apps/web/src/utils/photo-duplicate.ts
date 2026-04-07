import {Fs} from "@d0paminedriven/fs";

const fs = new Fs(process.cwd());


const dogeBuffer = fs.fileToBuffer("public/photos/heritage/doge-404.jpg");


Array.from(
  { length: 16 },
  (_, i) => fs.withWs(`public/photos/heritage/doge-404-${i}.jpg`, dogeBuffer)
);
