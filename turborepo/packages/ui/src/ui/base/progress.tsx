"use client"

import { motion, useMotionValue, useTransform, animate } from "motion/react"
import { useEffect } from "react"

interface UploadProgressProps {
  progress: number
  size?: "sm" | "md" | "lg"
  showPercentage?: boolean
}

export function UploadProgress({ progress, size = "sm", showPercentage = false }: UploadProgressProps) {
  const motionProgress = useMotionValue(0)
  const pathLength = useTransform(motionProgress, [0, 100], [0, 1])
  const opacity = useTransform(motionProgress, [0, 100], [0.3, 1])
  const scale = useTransform(motionProgress, [0, 100], [0.95, 1])
  const roundedProgress = useTransform(motionProgress, (latest) => Math.round(latest))

  useEffect(() => {
    animate(motionProgress, progress, {
      duration: 0.5,
      ease: "easeOut",
    })
  }, [progress, motionProgress])

  const dimensions = {
    sm: { size: 24, strokeWidth: 3, fontSize: "8px" },
    md: { size: 48, strokeWidth: 4, fontSize: "12px" },
    lg: { size: 96, strokeWidth: 6, fontSize: "20px" },
  }[size]

  const radius = (dimensions.size - dimensions.strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const center = dimensions.size / 2

  const strokeDashoffset = useTransform(pathLength, [0, 1], [circumference, 0])

  return (
    <motion.div
      className="relative inline-flex items-center justify-center"
      style={{ scale, opacity }}
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.95, opacity: 0 }}
    >
      <svg width={dimensions.size} height={dimensions.size} className="rotate-[-90deg]">
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={dimensions.strokeWidth}
          className="opacity-10"
        />
        {/* Progress circle */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={dimensions.strokeWidth}
          strokeDasharray={circumference}
          strokeLinecap="round"
          className="text-primary"
          style={{
            strokeDashoffset,
          }}
        />
      </svg>
      {showPercentage && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: dimensions.fontSize }}>
          <motion.span className="font-medium tabular-nums">{roundedProgress}</motion.span>
        </div>
      )}
      <span className="sr-only">Upload progress: {Math.round(progress)}%</span>
    </motion.div>
  )
}
