// app/api/og/route.tsx
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { Fs } from "@d0paminedriven/fs";

const fs = new Fs(process.cwd());
export const runtime = "nodejs"; // Using Node runtime for better performance
export const contentType = "image/png";

export const size = {
  width: 1200,
  height: 630
};

export default async function Image(request: NextRequest) {
  const fontRegular = fs.fileToBuffer("public/BasisGrotesquePro-Regular.ttf");
  const fontLight = fs.fileToBuffer("public/BasisGrotesquePro-Light.ttf");

  const logo = fs.fileToBuffer("public/dd-logo.svg");
  const fontRegularSrc = Uint8Array.from(fontRegular).buffer;
  const fontLightSrc = Uint8Array.from(fontLight).buffer;
  const logoSrc = Uint8Array.from(logo).buffer;
  try {
    const { searchParams } = new URL(request.url);

    // Dynamic parameters
    const title = searchParams.get("title") ?? "AI Chat";
    const model = searchParams.get("model") ?? "gpt-4.1";
    const provider = searchParams.get("provider") ?? "openai";

    // Load your dd logo SVG and convert to base64
    // const logoUrl = new URL("../../../public/favicon.svg", import.meta.url);
    // const fontRegularUrl = new URL(
    //   "../../../public/BasisGrotesquePro-Regular.ttf",
    //   import.meta.url
    // );
    // const fontLightUrl = new URL(
    //   "../../../public/BasisGrotesquePro-Light.ttf",
    //   import.meta.url
    // );

    // const [logoResponse, fontRegularResponse, fontLightResponse] =
    //   await Promise.all([
    //     fetch(logoUrl),
    //     fetch(fontRegularUrl),
    //     fetch(fontLightUrl)
    //   ]);

    // if (!logoResponse.ok || !fontRegularResponse.ok || !fontLightResponse.ok) {
    //   throw new Error("Failed to fetch assets");
    // }

    // const logoSvg = await logoResponse.text();
    // const fontRegularData = await fontRegularResponse.arrayBuffer();
    // const fontLightData = await fontLightResponse.arrayBuffer();

    // Convert SVG to data URL (with theme-appropriate color)
    // const logoColor = theme === "dark" ? "#ffffff" : "#000000";
    // const styledLogoSvg = logoSvg.replace(
    //   /fill="[^"]*"/g,
    //   `fill="${logoColor}"`
    // );
    // const logoDataUrl = `data:image/svg+xml;base64,${Buffer.from(styledLogoSvg).toString("base64")}`;

    // Theme colors

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
            background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)",
            fontFamily: '"Basis Grotesque Pro", sans-serif',
            position: "relative",
            padding: "80px"
          }}>
          {/* Subtle tech pattern background */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `radial-gradient(circle at 25% 25%, rgba(76, 236, 196, 0.15) 0%, transparent 50%),
                   radial-gradient(circle at 75% 75%, rgba(255, 107, 107, 0.1) 0%, transparent 50%),
                   radial-gradient(circle, rgba(255,255,255,0.02) 1px, transparent 1px)`,
              backgroundSize: "800px 800px, 600px 600px, 40px 40px",
              opacity: 0.8
            }}
          />

          {/* Flowing data lines inspired by your portfolio */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "200px",
              background: "linear-gradient(90deg, transparent, rgba(76, 236, 196, 0.1), rgba(255, 107, 107, 0.1), transparent)",
              transform: "skewY(-2deg)",
              transformOrigin: "bottom left"
            }}
          />

          {/* Neural network nodes */}
          <div
            style={{
              position: "absolute",
              top: "80px",
              right: "120px",
              display: "flex",
              gap: "40px"
            }}>
            {[1, 2, 3].map((_, i) => (
              <div
                key={i}
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  background: "#4ecdc4",
                  opacity: 0.6 - i * 0.15,
                  boxShadow: `0 0 20px #4ecdc450`
                }}
              />
            ))}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "40px"
            }}>
            <img
              src={logoSrc as unknown as Blob}
              style={{
                width: "80px",
                height: "126px",
                marginRight: "24px"
              }}
            />
            <div
              style={{
                fontSize: "42px",
                fontWeight: "300", // Using Light weight
                color: "#ffffff",
                letterSpacing: "-0.02em",
                fontFamily: '"Basis Grotesque Pro Light", sans-serif'
              }}>
              d0paminedriven
            </div>
          </div>

          {/* Main title */}
          <div
            style={{
              fontSize: "68px",
              fontWeight: "400", // Regular weight
              color: "#ffffff",
              textAlign: "center",
              marginBottom: "20px",
              lineHeight: 1.1,
              fontFamily: '"Basis Grotesque Pro", sans-serif',
              textShadow: "0 2px 20px rgba(0,0,0,0.5)"
            }}>
            {title}
          </div>

          {/* Model and provider info */}
          {(model || provider) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "20px",
                marginBottom: "40px"
              }}>
              {provider && (
                <div
                  style={{
                    background: "#4ecdc4",
                    color: "#000000",
                    padding: "12px 24px",
                    borderRadius: "25px",
                    fontSize: "24px",
                    fontWeight: "500"
                  }}>
                  {provider}
                </div>
              )}
              {model && (
                <div
                  style={{
                    background: "transparent",
                    color: "#666666",
                    border: `2px solid #666666`,
                    padding: "10px 22px",
                    borderRadius: "25px",
                    fontSize: "22px",
                    fontWeight: "400"
                  }}>
                  {model}
                </div>
              )}
            </div>
          )}

          {/* Tagline */}
          <div
            style={{
              fontSize: "26px",
              color: "#666666",
              textAlign: "center",
              lineHeight: 1.4,
              maxWidth: "800px",
              fontFamily: '"Basis Grotesque Pro Light", sans-serif',
              fontWeight: "300"
            }}>
            Multi-provider, multi-model LLM chat platform
          </div>

          {/* Subtle accent elements */}
          <div
            style={{
              position: "absolute",
              top: "40px",
              right: "40px",
              width: "100px",
              height: "4px",
              background: `linear-gradient(90deg, #4ecdc4, transparent)`,
              borderRadius: "2px"
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: "40px",
              left: "40px",
              width: "150px",
              height: "4px",
              background: `linear-gradient(90deg, transparent, #4ecdc4)`,
              borderRadius: "2px"
            }}
          />
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: "Basis Grotesque Pro",
            data: fontRegularSrc,
            style: "normal",
            weight: 400
          },
          {
            name: "Basis Grotesque Pro Light",
            data: fontLightSrc,
            style: "normal",
            weight: 300
          }
        ]
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
          <div>d0paminedriven</div>
          <div style={{ fontSize: "32px", marginTop: "20px", opacity: 0.8 }}>
            AI Chat Platform
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
