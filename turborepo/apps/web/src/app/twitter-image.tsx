import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
export const size = {
  width: 1200,
  height: 628
};

export default async function Image() {
  const _logowhiteSource =
    "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758838093131-Asset_2hdpi.png";
  const _bgImgSource =
    "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758850621314-ai-human.png";

  try {
    const [logoLight, bgImage] = await Promise.all([
      readFile(join(process.cwd(), "src/app/logo-black.png"), "base64"),
      readFile(join(process.cwd(), "src/app/ai-human.png"), "base64")
    ]);
    return new ImageResponse(
      (
        <div
          style={{
            position: "relative",
            height: "100%",
            display: "flex",
            width: "100%",
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
              alt="AI and human interaction artwork"
              width={836.515}
              height={628}
              style={{
                inset: "0",
                position: "absolute",
                objectPosition: "center center",
                alignSelf: "center",
                height: "628px",
                width: "836.515px",
                objectFit: "cover",
                pointerEvents: "none",
                filter: "saturate(0.3) contrast(0.8) brightness(1.1)"
              }}
              src={`data:image/png;base64,${bgImage}`}
            />
          </div>
          <div
            style={{
              display: "none",
              position: "absolute",
              inset: "0",
              background:
                "linear-gradient(to right, rgb(255 255 255 / 0.6), transparent, rgb(255 255 255 / 0.6))"
            }}></div>
          <div
            style={{
              display: "none",
              position: "absolute",
              inset: "0",
              background:
                "linear-gradient(to bottom, rgb(255 255 255 / 0.4), transparent, rgb(255 255 255 / 0.5))"
            }}></div>
          <div
            style={{
              display: "none",
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
                display: "flex",
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
              <div
                style={{
                  padding: "0",
                  position: "relative",
                  justifyContent: "center",
                  alignContent: "center",
                  alignItems: "center",
                  display: "flex"
                }}>
                <img
                  src={`data:image/png;base64,${logoLight}`}
                  alt="aicoalesce logo"
                  width={267}
                  height={202}
                  style={{
                    zIndex: "50",
                    position:"absolute",
                    inset: "0",
                    objectPosition: "center center",
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
