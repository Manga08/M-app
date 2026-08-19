"use client";

import { LazyMotion, MotionConfig } from "motion/react";

const loadMotionFeatures = () => import("@/lib/motion-features").then((module) => module.default);

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadMotionFeatures}>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
