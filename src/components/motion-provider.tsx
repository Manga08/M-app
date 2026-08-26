"use client";

import { LazyMotion, MotionConfig } from "motion/react";

export const loadDomAnimationFeatures = () =>
  import("@/lib/motion-features").then((module) => module.default)

export const loadDomMaxFeatures = () =>
  import("@/lib/motion-gestures-features").then((module) => module.default)

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadDomAnimationFeatures}>
      <MotionConfig reducedMotion="user">
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

export function MotionGesturesProvider({ children }: { children: React.ReactNode }) {
  return <LazyMotion features={loadDomMaxFeatures}>{children}</LazyMotion>
}
