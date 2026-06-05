"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  animate,
  easeIn,
  mix,
  motion,
  progress,
  useMotionValue,
  useTransform,
  wrap
} from "motion/react";

interface CardStackProps {
  images?: { src: string; ratio: number }[];
  maxRotate?: number;
}

export default function CardStack({
  images = defaultImages,
  maxRotate = 5
}: CardStackProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const ref = useRef<HTMLUListElement>(null);
  const [width, setWidth] = useState(400);

  useEffect(() => {
    if (!ref.current) return;
    setWidth(ref.current.offsetWidth);
  }, []);

  return (
    <>
      <ul className="stack" ref={ref}>
        {images.map((image, index) => {
          return (
            <StackImage
              {...image}
              minDistance={width * 0.5}
              maxRotate={maxRotate}
              key={image.src}
              index={index}
              currentIndex={currentIndex}
              totalImages={images.length}
              setNextImage={() => {
                setCurrentIndex(wrap(0, images.length, currentIndex + 1));
              }}
            />
          );
        })}
      </ul>

      <Instructions />
      <Stylesheet />
    </>
  );
}

interface StackImageProps {
  src: string;
  ratio: number;
  index: number;
  totalImages: number;
  currentIndex: number;
  maxRotate: number;
  minDistance?: number;
  minSpeed?: number;
  setNextImage: () => void;
}

function StackImage({
  src,
  ratio,
  index,
  currentIndex,
  totalImages,
  maxRotate,
  setNextImage,
  minDistance = 400,
  minSpeed = 50
}: StackImageProps) {
  /**
   * Math.sin(index) is a way of generating a value between -1 and 1 in a
   * deterministic way that can provide a pleasing distribution throughout a range.
   * For instance passing it to `mix(0, maxRotate)` will give us a nice
   * distribution throughout -maxRotate and maxRotate.
   */
  const baseRotation = mix(0, maxRotate, Math.sin(index));
  const x = useMotionValue(0);
  const rotate = useTransform(x, [0, 400], [baseRotation, baseRotation + 10], {
    clamp: false
  });
  const zIndex = totalImages - wrap(totalImages, 0, index - currentIndex + 1);

  const onDragEnd = () => {
    const distance = Math.abs(x.get());
    const speed = Math.abs(x.getVelocity());

    if (distance > minDistance || speed > minSpeed) {
      setNextImage();

      animate(x, 0, {
        type: "spring",
        stiffness: 600,
        damping: 50
      });
    } else {
      animate(x, 0, {
        type: "spring",
        stiffness: 300,
        damping: 50
      });
    }
  };

  const opacity = progress(totalImages * 0.25, totalImages * 0.75, zIndex);

  const progressInStack = progress(0, totalImages - 1, zIndex);
  const scale = mix(0.5, 1, easeIn(progressInStack));

  return (
    <motion.li
      className="item"
      style={{
        width: ratio > 1 ? "100%" : "auto",
        height: ratio <= 1 ? "100%" : "auto",
        aspectRatio: ratio,
        zIndex,
        rotate,
        x
      }}
      initial={{ opacity: 0, scale: 0.3 }}
      animate={{ opacity, scale }}
      whileTap={index === currentIndex ? { scale: 0.98 } : {}}
      transition={{
        type: "spring",
        stiffness: 600,
        damping: 30
      }}
      drag={index === currentIndex ? "x" : false}
      onDragEnd={onDragEnd}>
      <Image src={src} fill alt="" onPointerDown={e => e.preventDefault()} />
    </motion.li>
  );
}

function Instructions() {
  return (
    <p className="instructions big">
      Swipe the top photo left or right.
      <br />
      Swiped photos move to the back of the stack.
    </p>
  );
}

/**
 * ==============   Styles   ================
 */
function Stylesheet() {
  return (
    <style>
      {`

          .stack {
            position: relative;
            width: 400px;
            height: 400px;
            max-width: 90vw;
            list-style: none;
            margin: 0;
            padding: 0;
          }

          @media (max-width: 600px) {
            .stack {
              width: 200px;
              height: 200px;
            }
          }

          .item {
            border-radius: 10px;
            overflow: hidden;
            will-change: transform, opacity, filter;
            top: 50%;
            left: 50%;
            translate: -50% -50%;
            position: absolute;
            background: #0001;
            filter: drop-shadow(1px 3px 5px rgba(0,0,0,0.3));
          }

          .item img {
            width: 100%;
            height: 100%;
            user-select: none;
            -webkit-user-select: none;
            touch-action: none;
          }

          .instructions {
            font-size: 14px;
            color: var(--feint-text);
            text-align: center;
            line-height: 1.4;
            padding: 20px 8px;
          }
            `}
    </style>
  );
}

export const defaultImages = [
  {
    src: "/ui/aicoalesce.png",
    ratio: 1.7142857142857142
  },
  {
    src: "/ui/current-bleh-ui.png",
    ratio: 1.9824470831182242
  },
  {
    src: "/ui/doge-final-source.png",
    ratio: 1.5
  },
  {
    src: "/ui/doge-final.png",
    ratio: 1.123902942694889
  },
  {
    src: "/ui/doge-partial.png",
    ratio: 1.1244769874476988
  },
  {
    src: "/ui/image-one.png",
    ratio: 1.9963861641713991
  },
  {
    src: "/ui/image-three.png",
    ratio: 1.9844961240310077
  },
  {
    src: "/ui/image-two.png",
    ratio: 1.9793814432989691
  },
  {
    src: "/ui/set-selected-model-as-a-target.png",
    ratio: 1.5911330049261083
  },
  {
    src: "/ui/shibe.png",
    ratio: 1.5
  },
  {
    src: "/ui/shred-pow-for-the-glory-of-rome.png",
    ratio: 1.5
  }
];
