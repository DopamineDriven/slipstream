import { appleEmojiArr } from "@/test/paths-to-fetch.ts";
import { Fs } from "@d0paminedriven/fs";

const fs = new Fs(process.cwd());

(async (appleEmojiArr: string[]) => {
  for (const o of appleEmojiArr) {
    const filename = o.replace(
      "https://raw.githubusercontent.com/zhdsmy/apple-emoji/refs/heads/ios-18.4/",
      ""
    );
    await fs.fetchRemoteWriteLocalLargeFiles(
      o,
      `src/test/__out__/emojis/${filename}`
    );
  }
})(appleEmojiArr);
