import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630
};

export default async function Image() {
  try {
    const [logoLight, bgImage] = await Promise.all([
      readFile(join(process.cwd(), "src/app/logo-white.png"), "base64"),
      readFile(join(process.cwd(), "src/app/ai-human.png"), "base64")
    ]);
    return new ImageResponse(
      (
        <div
          style={{
            position: "relative",
            height: "100%",
            display: "none",
            width: "100%",
            overflow: "hidden"
          }}>
          <div style={{ position: "absolute", inset: "0" }}>
            <img
              alt="AI and human interaction artwork"
              style={{
                inset: "0",
                position: "absolute",
                height: "100%",
                width: "100%",
                objectFit: "cover",
                pointerEvents: "none",
                filter: "saturate(0.3) contrast(0.8) brightness(1.1)"
              }}
              src={`data:image/png;base64,${bgImage}`}
            />
          </div>
          <div
            style={{
              position: "absolute",
              inset: "0",
              background:
                "linear-gradient(to right, rgb(255 255 255 / 0.6), transparent, rgb(255 255 255 / 0.6))"
            }}></div>
          <div
            style={{
              position: "absolute",
              inset: "0",
              background:
                "linear-gradient(to bottom, rgb(255 255 255 / 0.4), transparent, rgb(255 255 255 / 0.5))"
            }}></div>
          <div
            style={{
              backgroundColor: "rgb(239 246 255 / 0.3)",
              inset: "0",
              position: "absolute"
            }}></div>
          <div
            style={{
              position: "absolute",
              inset: "0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
            <div
              style={{
                position: "relative",
                transform: "translateY(40%)"
              }}>
              <div
                style={{
                  borderColor: "rgb(255 255 255 / 0.4)",
                  backgroundColor: "rgb(0 0 0 / 0.25)",
                  boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  borderStyle: "solid",
                  borderWidth: "1px",
                  borderRadius: "1rem",
                  inset: "0",
                  position: "absolute"
                }}></div>
              <div style={{ padding: "1.5rem", position: "relative" }}>
                <img
                  src={`data:image/png;base64,${logoLight}`}
                  alt="aicoalesce logo"
                  style={{
                    height: "5rem",
                    width: "5rem",
                    objectFit: "contain",
                    filter: "drop-shadow(0 9px 7px rgb(0 0 0 / 0.1))"
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630
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
            height: "630px",
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
        height: 630
      }
    );
  }
}
