export const motionDurations = {
  press: 0.1,
  tooltip: 0.125,
  menu: 0.16,
  state: 0.18,
  overlay: 0.2,
  spatial: 0.24,
  settle: 0.24,
  settleGesture: 0.28,
  reduced: 0.1,
  activity: 1.35,
} as const

export const motionEasings = {
  out: [0.23, 1, 0.32, 1],
  move: [0.77, 0, 0.175, 1],
  sheet: [0.32, 0.72, 0, 1],
} as const

export const motionSprings = {
  direct: { type: "spring", bounce: 0, duration: motionDurations.settle },
  gesture: { type: "spring", bounce: 0, duration: motionDurations.settleGesture },
} as const
