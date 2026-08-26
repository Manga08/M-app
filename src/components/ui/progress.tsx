"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

type ProgressProps = Omit<
  React.ComponentProps<typeof ProgressPrimitive.Root>,
  "value" | "max" | "aria-label"
> & {
  value?: number | null
  min?: number
  max?: number
  label: string
  valueText?: string
  indicatorClassName?: string
}

function Progress({
  className,
  indicatorClassName,
  value,
  min = 0,
  max = 100,
  label,
  valueText,
  ...props
}: ProgressProps) {
  const range = normalizeProgressRange(value, min, max)

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={range.value === null ? null : range.percentage}
      max={100}
      aria-label={label}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      aria-valuenow={range.value ?? undefined}
      aria-valuetext={valueText ?? range.valueText}
      className={cn(
        "relative flex h-1.5 w-full items-center overflow-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "size-full flex-1 origin-left bg-primary transition-transform duration-[var(--motion-duration-spatial)] ease-[var(--motion-ease-move)] motion-reduce:transition-none",
          range.value === null && "opacity-65",
          indicatorClassName,
        )}
        style={{ transform: `translateX(-${100 - range.percentage}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

function normalizeProgressRange(value: number | null | undefined, min: number, max: number) {
  const safeMin = Number.isFinite(min) ? min : 0
  const safeMax = Number.isFinite(max) && max > safeMin ? max : safeMin + 100
  const safeValue = value === null || value === undefined || !Number.isFinite(value)
    ? null
    : Math.min(safeMax, Math.max(safeMin, value))
  const percentage = safeValue === null
    ? 35
    : ((safeValue - safeMin) / (safeMax - safeMin)) * 100

  return {
    min: safeMin,
    max: safeMax,
    value: safeValue,
    percentage,
    valueText: safeValue === null ? "En curso" : `${Math.round(percentage)}%`,
  }
}

export { Progress, normalizeProgressRange }
