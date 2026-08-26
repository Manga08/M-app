export type MovementVisualKind = "income" | "expense" | "transfer" | "transfer_in" | "transfer_out" | "adjustment_in" | "adjustment_out";

/** Semantic movement colors are fixed so meaning never depends on personalization. */
export function movementIdentityTone(kind: MovementVisualKind) {
  if (kind === "income" || kind === "adjustment_in") {
    return { surface: "bg-positive/12", text: "text-positive" } as const;
  }
  if (kind === "transfer" || kind === "transfer_in" || kind === "transfer_out") {
    return { surface: "bg-info/12", text: "text-info" } as const;
  }
  return { surface: "bg-destructive/12", text: "text-destructive" } as const;
}
