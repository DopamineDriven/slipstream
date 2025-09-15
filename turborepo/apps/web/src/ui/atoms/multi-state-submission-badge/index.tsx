"use client";

import type { Easing } from "motion-utils";
import type { Transition } from "motion/react";
import type { ComponentPropsWithRef } from "react";
import { useEffect, useRef, useState } from "react";
import { Save } from "@slipstream/ui";
import {
  animate,
  AnimatePresence,
  motion,
  useTime,
  useTransform
} from "motion/react";

type ApiKeySubmissionState = "idle" | "processing" | "success" | "error";
type ApiKeySubmissionActions = "add" | "update";

interface MultiStateApiKeySubmissionBadgeProps {
  state: ApiKeySubmissionState;
  context?: ApiKeySubmissionActions;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

const API_KEY_STATES = {
  add: {
    idle: "Add Key",
    processing: "Encrypting...",
    success: "Key Added",
    error: "Failed to Add"
  },
  update: {
    idle: "Save",
    processing: "Updating...",
    success: "Updated",
    error: "Failed to Save"
  }
} as const;

function MultiStateApiKeySubmissionBadge({
  state,
  context = "add",
  onClick,
  disabled = false,
  className = ""
}: MultiStateApiKeySubmissionBadgeProps) {
  const badgeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!badgeRef.current) return;

    if (state === "error") {
      animate(
        badgeRef.current,
        { x: [0, -6, 6, -6, 0] },
        {
          duration: 0.3,
          ease: "easeInOut",
          times: [0, 0.25, 0.5, 0.75, 1],
          repeat: 0,
          delay: 0.1
        }
      );
    } else if (state === "success") {
      animate(
        badgeRef.current,
        {
          scale: [1, 1.05, 1]
        },
        {
          duration: 0.3,
          ease: "easeInOut",
          times: [0, 0.5, 1],
          repeat: 0
        }
      );
    }
  }, [state]);

  const isDisabled = disabled || state === "processing" || state === "success";

  return (
    <motion.button
      ref={badgeRef}
      onClick={onClick}
      disabled={isDisabled}
      className={`bg-brand-sidebar border-brand-border hover:bg-brand-primary/20 text-brand-text flex min-h-[44px] items-center justify-center rounded-md border px-4 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${getStateStyles(state)} ${className} `}
      style={{
        gap: state === "idle" ? 8 : 12
      }}
      layout>
      <Icon state={state} />
      <Label state={state} context={context} />
    </motion.button>
  );
}

const getStateStyles = (state: ApiKeySubmissionState) => {
  const twStyles = {
    success:
      "bg-foreground border-accent-foreground text-background hover:bg-foreground/80",
    error:
      "bg-foreground border-accent-foreground hover:bg-foreground/80 text-destructive/75 ",
    processing:
      "bg-foreground border-accent-foreground text-background hover:bg-foreground/80"
  } as const;
  const { error, processing, success } = twStyles;
  switch (state) {
    case "success":
      return success;
    case "error":
      return error;
    case "processing":
      return processing;
    default:
      return "";
  }
};

const Icon = ({ state }: { state: ApiKeySubmissionState }) => {
  let IconComponent = <></>;

  switch (state) {
    case "idle":
      IconComponent = <Save className="h-4 w-4" />;
      break;
    case "processing":
      IconComponent = <Loader />;
      break;
    case "success":
      IconComponent = <Check />;
      break;
    case "error":
      IconComponent = <X />;
      break;
  }

  return (
    <motion.span
      className="flex items-center justify-center"
      animate={{
        width: state === "idle" ? 16 : 20,
        height: state === "idle" ? 16 : 20
      }}
      transition={SPRING_CONFIG}>
      <AnimatePresence mode="wait">
        <motion.span
          key={state}
          className="flex items-center justify-center"
          initial={{
            y: -20,
            scale: 0.5,
            filter: "blur(4px)"
          }}
          animate={{
            y: 0,
            scale: 1,
            filter: "blur(0px)"
          }}
          exit={{
            y: 20,
            scale: 0.5,
            filter: "blur(4px)"
          }}
          transition={{
            duration: 0.15,
            ease: "easeInOut"
          }}>
          {IconComponent}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
};

const ICON_SIZE = 16;
const STROKE_WIDTH = 2;
const VIEW_BOX_SIZE = 24;

const svgProps = {
  width: ICON_SIZE,
  height: ICON_SIZE,
  viewBox: `0 0 ${VIEW_BOX_SIZE} ${VIEW_BOX_SIZE}`,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: STROKE_WIDTH,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const
};

const springConfig = {
  type: "spring",
  stiffness: 150,
  damping: 20
} satisfies Transition;

const animations = {
  initial: { pathLength: 0 },
  animate: { pathLength: 1 },
  transition: springConfig
} satisfies Omit<
  ComponentPropsWithRef<
    typeof motion.polyline | typeof motion.line | typeof motion.path
  >,
  "points" | "d" | "x1" | "x2" | "y1" | "y2"
>;

const secondLineAnimation = {
  ...animations,
  transition: { ...springConfig, delay: 0.1 }
};

function Check() {
  return (
    <motion.svg {...svgProps}>
      <motion.polyline points="4 12 9 17 20 6" {...animations} />
    </motion.svg>
  );
}

function Loader() {
  const time = useTime();
  const rotate = useTransform(time, [0, 1000], [0, 360], { clamp: false });

  return (
    <motion.div
      style={{
        rotate,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: ICON_SIZE,
        height: ICON_SIZE
      }}>
      <motion.svg {...svgProps}>
        <motion.path d="M21 12a9 9 0 1 1-6.219-8.56" {...animations} />
      </motion.svg>
    </motion.div>
  );
}

function X() {
  return (
    <motion.svg {...svgProps}>
      <motion.line x1="6" y1="6" x2="18" y2="18" {...animations} />
      <motion.line x1="18" y1="6" x2="6" y2="18" {...secondLineAnimation} />
    </motion.svg>
  );
}

const Label = ({
  state,
  context
}: {
  state: ApiKeySubmissionState;
  context: ApiKeySubmissionActions;
}) => {
  const [labelWidth, setLabelWidth] = useState(0);
  const measureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (measureRef.current) {
      const { width } = measureRef.current.getBoundingClientRect();
      setLabelWidth(width);
    }
  }, [state, context]); // Add context dependency

  const currentText = API_KEY_STATES[context][state];

  return (
    <>
      {/* Hidden copy of label to measure width */}
      <div
        ref={measureRef}
        className="invisible absolute text-sm font-medium whitespace-nowrap">
        {currentText}
      </div>

      <motion.span
        className="relative overflow-hidden"
        animate={{
          width: labelWidth
        }}
        transition={SPRING_CONFIG}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${state}-${context}`}
            className="text-sm font-medium whitespace-nowrap"
            initial={{
              y: -20,
              opacity: 0,
              filter: "blur(4px)"
            }}
            animate={{
              y: 0,
              opacity: 1,
              filter: "blur(0px)"
            }}
            exit={{
              y: 20,
              opacity: 0,
              filter: "blur(4px)"
            }}
            transition={{
              duration: 0.2,
              ease: "easeInOut"
            }}>
            {currentText}
          </motion.div>
        </AnimatePresence>
      </motion.span>
    </>
  );
};

const _bezier = [0.102, 0.783, 0.968, 1.07] satisfies Easing;

const SPRING_CONFIG = {
  type: "spring",
  stiffness: 600,
  damping: 30
} satisfies Transition;

export {
  API_KEY_STATES,
  MultiStateApiKeySubmissionBadge,
  type ApiKeySubmissionActions,
  type ApiKeySubmissionState,
  type MultiStateApiKeySubmissionBadgeProps
};
