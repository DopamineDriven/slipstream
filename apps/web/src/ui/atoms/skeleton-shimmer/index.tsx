"use client";

import type { CSSProperties, ReactNode } from "react";
import { startTransition, useEffect, useState } from "react";
import { AnimateView } from "motion-plus/animate-view";
import { motion } from "motion/react";
import { Logo } from "@/ui/logo";

export default function SkeletonShimmer({
  shimmerDuration = 1.5,
  loadDelay = 2500
}: {
  shimmerDuration?: number;
  loadDelay?: number;
}) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded) {
      const timer = setTimeout(
        () => startTransition(() => setLoaded(true)),
        loadDelay
      );
      return () => clearTimeout(timer);
    }
  }, [loaded, loadDelay]);

  return (
    <div style={containerStyle}>
      <style>{`
                @property --wipe {
                    syntax: '<percentage>';
                    inherits: true;
                    initial-value: -100%;
                }
                ::view-transition-group(skeleton-card) {
                    border-radius: 16px;
                    overflow: hidden;
                }
                ::view-transition-image-pair(skeleton-card) {
                    mix-blend-mode: normal;
                }
                ::view-transition-old(skeleton-card) {
                    /* AnimateView update currently animates old layers */
                    /* so we need to set the z-index to 2 to ensure it appears above the new layer */
                    z-index: 2;
                    mask-image: linear-gradient(to right, black var(--wipe), transparent calc(var(--wipe) + 100%));
                }
            `}</style>
      <AnimateView name="skeleton-card" update={wipeTransition}>
        {loaded ? (
          <ProfileCard />
        ) : (
          <SkeletonCard shimmerDuration={shimmerDuration} />
        )}
      </AnimateView>
      <button
        style={reloadBtnStyle}
        onClick={() => startTransition(() => setLoaded(false))}>
        Reload
      </button>
    </div>
  );
}

/** ==============   Views   ================ */

function ProfileCard() {
  return (
    <div style={cardStyle}>
      <div style={coverStyle} />
      <div style={profileAreaStyle}>
        <div style={avatarWrapStyle}>
          <div style={avatarStyle}>
            <Logo />
          </div>
        </div>
        <div style={infoGroupStyle}>
          <h3 style={nameStyle}>{PROFILE_NAME}</h3>
          <p style={handleStyle}>{PROFILE_HANDLE}</p>
        </div>
        <p style={bioStyle}>{PROFILE_BIO}</p>
        <div style={statsRowStyle}>
          {STATS.map(stat => (
            <div key={stat.label} style={statItemStyle}>
              <span style={statValueStyle}>{stat.value}</span>
              <span style={statLabelStyle}>{stat.label}</span>
            </div>
          ))}
        </div>
        <button style={followBtnStyle}>Follow</button>
      </div>
    </div>
  );
}

function SkeletonCard({ shimmerDuration }: { shimmerDuration: number }) {
  return (
    <div style={cardStyle}>
      <Bone
        width="100%"
        height={COVER_HEIGHT}
        borderRadius={0}
        duration={shimmerDuration}
      />
      <div style={profileAreaStyle}>
        <div style={avatarWrapStyle}>
          <div style={avatarRingStyle}>
            <Bone
              width={AVATAR_SIZE - 6}
              height={AVATAR_SIZE - 6}
              borderRadius="50%"
              duration={shimmerDuration}
            />
          </div>
        </div>
        <Shimmer
          duration={shimmerDuration}
          borderRadius="6px"
          style={fitContentStyle}>
          <div style={infoGroupStyle}>
            <h3 style={nameStyle}>{PROFILE_NAME}</h3>
            <p style={handleStyle}>{PROFILE_HANDLE}</p>
          </div>
        </Shimmer>
        <Shimmer duration={shimmerDuration} borderRadius="6px">
          <p style={bioStyle}>{PROFILE_BIO}</p>
        </Shimmer>
        <div style={statsRowStyle}>
          {STATS.map(stat => (
            <Shimmer
              key={stat.label}
              duration={shimmerDuration}
              borderRadius="8px"
              style={flexOneStyle}>
              <div style={statItemStyle}>
                <span style={statValueStyle}>{stat.value}</span>
                <span style={statLabelStyle}>{stat.label}</span>
              </div>
            </Shimmer>
          ))}
        </div>
        <Shimmer duration={shimmerDuration} borderRadius="10px">
          <div style={followSizerStyle}>Follow</div>
        </Shimmer>
      </div>
    </div>
  );
}

/** ==============   Components   ================ */

function _MotionLogo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1260 454"
      fill="currentColor"
      style={{ width: "65%", height: "65%" }}>
      <path d="M475.753 0L226.8 453.6L0 453.6L194.392 99.4116C224.526 44.5081 299.724 0 362.353 0L475.753 0Z" />
      <path d="M1031.93 113.4C1031.93 50.7709 1082.7 0 1145.33 0C1207.96 0 1258.73 50.7709 1258.73 113.4C1258.73 176.029 1207.96 226.8 1145.33 226.8C1082.7 226.8 1031.93 176.029 1031.93 113.4Z" />
      <path d="M518.278 0L745.078 0L496.125 453.6L269.325 453.6L518.278 0Z" />
      <path d="M786.147 0L1012.95 0L818.555 354.188C788.422 409.092 713.223 453.6 650.594 453.6L537.194 453.6L786.147 0Z" />
    </svg>
  );
}

const Shimmer = ({
  duration,
  borderRadius = "6px",
  style,
  children
}: {
  duration: number;
  borderRadius?: string;
  style?: CSSProperties;
  children: ReactNode;
}) => (
  <motion.div
    animate={shimmerAnimate}
    transition={{ duration, ease: "easeInOut", repeat: Infinity }}
    style={{
      borderRadius,
      background: SHIMMER_GRADIENT,
      backgroundSize: "200% 100%",
      overflow: "hidden",
      ...style
    }}>
    <div style={shimmerSizerStyle}>{children}</div>
  </motion.div>
);

const shimmerSizerStyle = { visibility: "hidden" } satisfies CSSProperties;
const fitContentStyle = { alignSelf: "flex-start" } satisfies CSSProperties;
const flexOneStyle = { flex: 1 } satisfies CSSProperties;

const Bone = ({
  width,
  height,
  borderRadius = 6,
  duration
}: {
  width: number | string;
  height: number;
  borderRadius?: number | string;
  duration: number;
}) => (
  <motion.div
    animate={shimmerAnimate}
    transition={{ duration, ease: "easeInOut", repeat: Infinity }}
    style={{
      width,
      height,
      borderRadius,
      background: SHIMMER_GRADIENT,
      backgroundSize: "200% 100%",
      flexShrink: 0
    }}
  />
);

/** ==============   Animation   ================ */

const wipeTransition = {
  "--wipe": ["100%", "-100%"],
  transition: { duration: 0.6, ease: "easeInOut" as const }
};

/** ==============   Styles   ================ */

const COVER_HEIGHT = 120;
const AVATAR_SIZE = 56;
const AVATAR_OVERLAP = 28;

const BONE_BASE = "rgba(255, 255, 255, 0.06)";
const BONE_HIGHLIGHT = "rgba(255, 255, 255, 0.12)";
const SHIMMER_GRADIENT = `linear-gradient(90deg, ${BONE_BASE} 25%, ${BONE_HIGHLIGHT} 50%, ${BONE_BASE} 75%)`;
const shimmerAnimate = { backgroundPosition: ["-200% 0", "200% 0"] };

const containerStyle = {
  width: "100%",
  minHeight: "100dvh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 16,
  padding: 20,
  boxSizing: "border-box"
} satisfies CSSProperties;

const cardStyle = {
  width: "100%",
  maxWidth: 360,
  borderRadius: "16px",
  border: "1px solid #1d2628",
  backgroundColor: "#0b1011",
  overflow: "hidden",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)"
} satisfies CSSProperties;

const coverStyle = {
  width: "100%",
  height: COVER_HEIGHT,
  background: "linear-gradient(135deg, #0d63f8 0%, #9911ff 100%)"
} satisfies CSSProperties;

const profileAreaStyle = {
  padding: "0 20px 20px",
  display: "flex",
  flexDirection: "column",
  gap: 14
} satisfies CSSProperties;

const avatarWrapStyle = {
  marginTop: -AVATAR_OVERLAP
} satisfies CSSProperties;

const avatarRingStyle = {
  width: AVATAR_SIZE,
  height: AVATAR_SIZE,
  borderRadius: "50%",
  backgroundColor: "#0b1011",
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
} satisfies CSSProperties;

const avatarStyle = {
  width: AVATAR_SIZE,
  height: AVATAR_SIZE,
  borderRadius: "50%",
  background: "#f5e725",
  border: "3px solid #0b1011",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#000"
} satisfies CSSProperties;

const infoGroupStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 4
} satisfies CSSProperties;

const nameStyle = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  color: "#f5f5f5",
  lineHeight: 1.2
} satisfies CSSProperties;

const handleStyle = {
  margin: 0,
  fontSize: 13,
  color: "rgba(255, 255, 255, 0.45)",
  lineHeight: 1.2
} satisfies CSSProperties;

const bioStyle = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.5,
  color: "rgba(255, 255, 255, 0.55)"
} satisfies CSSProperties;

const statsRowStyle = {
  display: "flex",
  gap: 8
} satisfies CSSProperties;

const statItemStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "8px 4px",
  borderRadius: "8px",
  backgroundColor: "rgba(255, 255, 255, 0.04)",
  flex: 1,
  gap: 2
} satisfies CSSProperties;

const statValueStyle = {
  fontSize: 15,
  fontWeight: 600,
  color: "#f5f5f5",
  lineHeight: 1.3
} satisfies CSSProperties;

const statLabelStyle = {
  fontSize: 11,
  color: "rgba(255, 255, 255, 0.35)",
  lineHeight: 1.3
} satisfies CSSProperties;

const followBaseStyle = {
  width: "100%",
  padding: "10px 0",
  fontSize: 14,
  fontWeight: 600,
  fontFamily: "inherit"
} satisfies CSSProperties;

const followSizerStyle = {
  ...followBaseStyle,
  textAlign: "center"
} satisfies CSSProperties;

const followBtnStyle = {
  ...followBaseStyle,
  borderRadius: "10px",
  border: "none",
  background: "#0d63f8",
  color: "#f5f5f5",
  cursor: "pointer"
} satisfies CSSProperties;

const reloadBtnStyle = {
  border: "1px solid #1d2628",
  borderRadius: "10px",
  background: "transparent",
  color: "#f5f5f5",
  padding: "8px 20px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer"
} satisfies CSSProperties;

/** ==============   Data   ================ */

const PROFILE_NAME = "Motion";
const PROFILE_HANDLE = "@motiondotdev";
const PROFILE_BIO =
  "Free and open source. Create stunning web animations for React, JavaScript and Vue.";

const STATS = [
  { value: "127", label: "Posts" },
  { value: "11K", label: "Followers" },
  { value: "5", label: "Following" }
];
