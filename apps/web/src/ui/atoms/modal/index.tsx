"use client";

import { Fragment, useEffect, useState } from "react";
import {
  delay,
  motion,
  MotionConfig,
  TargetAndTransition,
  Transition
} from "motion/react";

const MotionFragment = motion.create(Fragment);

export default function PokopiaModal() {
  const [animationPhase, setAnimationPhase] = useState<AnimationPhase>("idle");
  const [iteration, setIteration] = useState(0);

  useEffect(() => {
    if (animationPhase === "idle") {
      return delay(() => setAnimationPhase("entry"), 1);
    }
  }, [animationPhase]);

  const toggleModal = () => {
    console.log("phase:", animationPhase);

    if (
      animationPhase === "idle" ||
      animationPhase === "entry" ||
      animationPhase === "spin"
    )
      return;

    const isRestart = animationPhase === "exit";
    setAnimationPhase(isRestart ? "idle" : "exit");
    if (isRestart) setIteration(iteration + 1);
  };

  return (
    <MotionConfig
      transition={animationPhase === "expand" ? EXPAND_TRANSITION : undefined}>
      <div className="container" data-phase={animationPhase}>
        <motion.img
          className="bg"
          src="/photos/pokopia-modal/screenshot.webp"
          alt="Pokopia screenshot"
          onClick={toggleModal}
          animate={{
            filter:
              animationPhase === "spin" || animationPhase === "expand"
                ? "blur(5px)"
                : "blur(0px)"
          }}
        />
        <MotionFragment
          initial={false}
          animate={animationPhase}
          key={iteration}
          onAnimationComplete={definition => {
            if (definition === "entry") {
              setAnimationPhase("spin");
            } else if (definition === "spin") {
              setAnimationPhase("expand");
            }
          }}>
          <motion.div className="modal" variants={modalVariants} layout>
            <motion.div className="red" variants={redBoxVariants} layout />
          </motion.div>
          <motion.div
            className="inner"
            variants={innerBoxVariants}
            layout
            key={iteration}
            transition={{
              layout: {
                ease: [0.44, 0.07, 0.51, 1],
                duration: 0.55
              }
            }}
            style={{ borderRadius: 15 }}
          />
          <motion.div
            className="icon"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={
              animationPhase === "expand" || animationPhase === "exit"
                ? { scale: 2, opacity: 0 }
                : {
                    scale: [0.8, 1.75, 0.8],
                    opacity: 1
                  }
            }
            transition={{
              scale: { duration: 0.36, ease: "easeInOut" },
              opacity: {
                duration: animationPhase === "expand" ? 0.15 : 0.05,
                delay: animationPhase === "expand" ? 0.3 : 0
              }
            }}>
            <motion.svg
              xmlns="http://www.w3.org/2000/svg"
              width="100%"
              height="100%"
              viewBox="0 0 115 115"
              fill="none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}>
              <path
                d="M55.7433 0.0168174C87.2515 -0.740415 113.418 24.1683 114.212 55.6756C115.007 87.183 90.1295 113.379 58.6231 114.211C27.0639 115.044 0.814386 90.1155 0.0185149 58.5553C-0.777328 26.9952 24.1822 0.775333 55.7433 0.0168174Z"
                fill="#FDFBF7"
              />
              <path
                d="M54.3116 6.21124C82.4237 4.69293 106.441 26.2584 107.946 54.3713C109.452 82.484 87.8757 106.491 59.7622 107.984C31.6666 109.476 7.67795 87.9166 6.17333 59.8218C4.6687 31.7269 26.2174 7.72856 54.3116 6.21124Z"
                fill="#8C2626"
              />
              <path
                d="M12.2132 60.7636L26.4864 60.7986C30.367 60.8053 34.5988 60.8703 38.4644 60.7113C41.1467 68.6183 45.5045 73.8847 54.1334 75.5215C63.3339 77.2668 74.0019 70.2491 75.3303 60.8202C84.0595 60.6643 93.1491 60.7742 101.903 60.7762C101.255 68.7037 99.596 74.1228 95.4633 80.9429C94.3073 82.8839 92.7969 84.866 91.3138 86.5547C83.4762 95.6321 72.3253 101.187 60.3584 101.975C35.5907 103.546 13.8134 85.8403 12.2132 60.7636Z"
                fill="#FDFBF7"
              />
              <path
                d="M32.7167 19.35C59.0868 2.16005 95.4285 17.4744 101.396 48.324C101.729 50.0418 101.893 51.671 102.177 53.3734C93.4621 53.5918 84.3325 53.4668 75.5906 53.4388C74.2155 48.2409 71.3752 43.8985 66.7064 41.1552C62.8705 38.9013 60.7359 38.8329 56.487 38.7633C47.3529 38.6139 40.8877 44.888 38.621 53.3862C29.8802 53.2381 20.9489 53.6203 12.1438 53.3507C12.6273 45.2151 16.3051 35.4201 21.6766 29.2727C22.5075 28.3216 23.5258 27.0565 24.4587 26.2408C24.6543 26.067 24.8695 25.9166 25.1 25.7927C27.6881 22.6525 29.4023 21.5289 32.7167 19.35Z"
                fill="#ff3949"
              />
              <path
                d="M32.7167 19.35C33.2328 19.6694 33.9251 19.6758 34.5243 19.643C37.4758 19.4814 40.8112 21.7049 41.1904 24.7919C41.9822 31.2384 33.108 36.5091 27.6829 33.363C26.3796 32.5939 25.4348 31.3391 25.0558 29.8739C24.7303 28.5667 24.9256 27.1168 25.1 25.7927C27.6881 22.6525 29.4023 21.5289 32.7167 19.35Z"
                fill="#FEDBD9"
              />
              <path
                d="M55.2785 43.9393C62.5335 42.9596 69.2137 48.0337 70.2161 55.2854C71.2188 62.5372 66.1658 69.2334 58.9173 70.2588C51.6362 71.2888 44.9035 66.2083 43.8965 58.9241C42.8895 51.6399 47.9912 44.9232 55.2785 43.9393Z"
                fill="#FDFBF7"
              />
            </motion.svg>
          </motion.div>
        </MotionFragment>
        <Stylesheet />
      </div>
    </MotionConfig>
  );
}

/** ==============   Variants   ================ */
type AnimationPhase = "idle" | "entry" | "spin" | "expand" | "exit";

const baseValues = { scale: 1, opacity: 1, rotate: 0 };

const SPIN_TRANSITION: Transition = {
  ease: "linear",
  duration: 0.33,
  rotate: {
    inherit: true,
    ease: [0.57, 0.44, 0.66, 1.17]
  }
};

const EXPAND_TRANSITION: Transition = {
  type: "spring",
  duration: 0.55,
  bounce: 0.05,
  borderRadius: { inherit: true, ease: "linear" },
  scale: { inherit: true, ease: "backOut" },
  rotate: { type: false }
};

const modalVariants: Record<AnimationPhase, TargetAndTransition> = {
  idle: {
    scale: 0.4,
    borderRadius: 75,
    opacity: 0
  },
  entry: {
    ...baseValues,
    borderRadius: 75,
    transition: {
      opacity: { duration: 0.08 },
      duration: 0.13
    }
  },
  spin: {
    ...baseValues,
    borderRadius: 50,
    rotate: [-180, 0],
    transition: SPIN_TRANSITION
  },
  expand: {
    ...baseValues,
    borderRadius: 40,
    transition: EXPAND_TRANSITION
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    borderRadius: 40
  }
};

const redBoxVariants: Record<AnimationPhase, TargetAndTransition> = {
  idle: {
    borderRadius: 70
  },
  entry: {
    borderRadius: 70
  },
  spin: {
    borderRadius: 45,
    transition: SPIN_TRANSITION
  },
  expand: {
    borderRadius: 35,
    transition: EXPAND_TRANSITION
  },
  exit: {
    borderRadius: 35
  }
};

const innerInitialValues = { opacity: 0, scale: 1 };

const innerBoxVariants: Record<AnimationPhase, TargetAndTransition> = {
  idle: innerInitialValues,
  entry: innerInitialValues,
  spin: innerInitialValues,
  expand: {
    opacity: 1,
    scale: 1,
    transition: {
      opacity: {
        duration: 0.1,
        ease: "linear"
      }
    }
  },
  exit: { scale: 0.8, opacity: 0 }
};

/** ==============   Styles   ================ */

function Stylesheet() {
  return (
    <style>{`
            #sandbox {
                align-items: stretch;
            }

            .container {
                position: relative;
                width: 100%;
                flex: 1;
                overflow: hidden;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .bg {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                object-fit: cover;
                will-change: filter;
            }

            .modal {
                background: white;
                width: 150px;
                height: 150px;
                z-index: 10000000;
                position: relative;
                will-change: transform;
            }

            [data-phase="expand"] .modal,
            [data-phase="exit"] .modal {
                width: auto;
                height: auto;
                inset: 40px;
                position: absolute;
            }

            .red {
               position: absolute;
               inset: 5px;
               background: #ff3949;
                will-change: transform;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .inner {
               background: white;
               position: absolute;
               inset: 70px;
               z-index: 10000001;
                will-change: transform;
            }

            [data-phase="idle"] .inner,
            [data-phase="entry"] .inner,
            [data-phase="spin"] .inner {
                width: 50px;
                height: 50px;
                inset: auto;
            }

            .icon {
                position: absolute;
                inset: 0;
                margin: auto;
                width: 50px;
                height: 50px;
                z-index: 10000002;
                border-radius: 50%;
                background: rgb(253, 251, 247);
                overflow: hidden;
            }
        `}</style>
  );
}
