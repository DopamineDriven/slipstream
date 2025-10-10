import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 628
};

export const alt = "Slipstream";

export const contentType = "image/png";

export default async function Image() {
  const file = "aicoalesce-twitter-img.png";
  const filePath = join(process.cwd(), file);
  const fileExists = existsSync(filePath);
  try {
    if (!fileExists) {
      throw new Error(`file ${filePath} does not exist!`);
    }
    const bgImage = await readFile(filePath, "base64");
    const dataUrl = `data:image/png;base64,${bgImage}` as const;
    return new ImageResponse(
      (
        <div
          style={{
            position: "relative",
            height: "100%",
            display: "flex",
            width: "100%",
            backgroundColor: "#f5f7fa",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden"
          }}>
          <div
            style={{
              position: "absolute",
              inset: "0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginInline: "auto"
            }}>
            <img
              alt="Slipstream"
              width={1077}
              height={628}
              style={{
                inset: "0",
                position: "absolute",
                objectPosition: "center center",
                alignSelf: "center",
                height: "628px",
                width: "1077px",
                objectFit: "cover",
                pointerEvents: "none"
              }}
              src={dataUrl}
            />
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 628
      }
    );
  } catch (error) {
    console.error("Error generating OG image:", error);
    // Fallback simple image
    return new ImageResponse(
      (
        <div
          style={{
            width: "1200px",
            height: "628px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#0a0a0a",
            color: "#ffffff",
            fontSize: "48px",
            fontFamily: "system-ui"
          }}>
          <div>aicoalesce</div>
          <div style={{ fontSize: "32px", marginTop: "20px", opacity: 0.8 }}>
            Slipstream
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 628
      }
    );
  }
}
