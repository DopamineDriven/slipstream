import Image from "next/image";

const logoLight =
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758838068725-aicoalesce-logo-white.png";
const bgImage =
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758231667843-gemini.webp";

export function OGFinal() {
  return (
    <div className="mx-auto flex h-full w-full max-w-6xl items-center rounded-lg justify-center p-8">
      <div
        style={{
          position: "relative",
          height: "100%",
          width: "100%",
          overflow: "hidden"
        }}>
        <div style={{ position: "absolute", inset: "0" }}>
          <Image
            alt="AI and human interaction artwork"
            width={1035}
            height={779}
            style={{
              inset: "0",
              position: "absolute",
              height: "100%",
              width: "100%",
              objectFit: "cover",
              pointerEvents: "none",
              filter: "saturate(0.3) contrast(0.8) brightness(1.1)"
            }}
            src={bgImage}
          />
        </div>

        {/* color-mix(in oklab,oklch(100% 0.00011 271.152) 40%, transparent)*/}
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

        {/* Subtle color wash to unify the palette */}
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
              transform: "translateY(40%)" // Position in upper chest/lower neck area
            }}>
            {/* Compact frosted glass backdrop */}
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
              <Image
                width={267}
                height={202}
                src={logoLight || "https://raw.githubusercontent.com/DopamineDriven/slipstream/refs/heads/main/turborepo/apps/web/public/aic-logo.svg"}
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
    </div>
  );
}
