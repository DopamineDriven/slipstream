import { join, relative, resolve } from "path";
import { Fs } from "@d0paminedriven/fs";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";

export class EmojiRenderer extends Fs {
  private emojiCache = new Map<string, string>();
  private emojiDir = "src/test/__out__/emojis";

  constructor() {
    super(process.cwd());
    this.exists(this.emojiDir);

    // Register emoji fonts if needed
    GlobalFonts.registerFromPath(
      relative(
        process.cwd(),
        resolve("/usr/share/fonts/truetype/noto", "NotoColorEmoji.ttf")
      )
    );
    // GlobalFonts.registerFromPath(join(__dirname, 'fonts', 'AppleColorEmoji@2x.ttf'), 'Apple Emoji');
    // Or use system fonts that support emojis
  }

  private async renderEmojiToFile(emoji: string): Promise<string> {
    // Check cache first
    if (this.emojiCache.has(emoji)) {
      return this.emojiCache.get(emoji) ?? "";
    }

    // Create a small canvas for the emoji
    const canvas = createCanvas(32, 32);
    const ctx = canvas.getContext("2d");

    // Clear background (or make it transparent)
    ctx.clearRect(0, 0, 32, 32);

    // Set font and render emoji
    ctx.font = '28px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, 16, 16);

    // Generate filename based on emoji codepoint
    const codePoint =
      emoji.codePointAt(0)?.toString(16).toUpperCase() ?? "unknown";
    const filename = `emoji_${codePoint}.png`;
    const filepath = join(this.emojiDir, filename);

    // Save to file
    const buffer = canvas.toBuffer("image/png");
    this.withWs(filepath, buffer);

    // Cache the path
    this.emojiCache.set(emoji, filepath);

    return filepath;
  }

  async processContentWithRenderedEmojis(content: string): Promise<string> {
    // Find all emojis in content
    const emojiRegex =
      /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA70}-\u{1FAFF}]/gu;

    const emojis = content.match(emojiRegex) ?? [];
    const uniqueEmojis = [...new Set(emojis)];

    // Render all unique emojis
    const emojiPaths = new Map<string, string>();
    for (const emoji of uniqueEmojis) {
      const path = await this.renderEmojiToFile(emoji);
      emojiPaths.set(emoji, path);
    }

    // Replace emojis in content with LaTeX image includes
    let processed = content;
    for (const [emoji, path] of emojiPaths) {
      // Use absolute path for LaTeX
      const absolutePath = join(process.cwd(), path);
      // LaTeX command to include the image inline with text
      const replacement = `\\includegraphics[height=1em]{${absolutePath}}`;
      processed = processed.replace(new RegExp(emoji, "g"), replacement);
    }

    return processed;
  }
}
