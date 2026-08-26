import { describe, expect, it } from "vitest";
import { movementIdentityTone } from "@/lib/finance/movement-visuals";

describe("movementIdentityTone", () => {
  it("keeps income visually positive", () => {
    expect(movementIdentityTone("income")).toEqual({ surface: "bg-positive/12", text: "text-positive" });
    expect(movementIdentityTone("adjustment_in")).toEqual({ surface: "bg-positive/12", text: "text-positive" });
  });

  it("keeps expenses visually destructive", () => {
    expect(movementIdentityTone("expense")).toEqual({ surface: "bg-destructive/12", text: "text-destructive" });
    expect(movementIdentityTone("adjustment_out")).toEqual({ surface: "bg-destructive/12", text: "text-destructive" });
  });

  it("keeps transfers informational instead of looking like expenses", () => {
    for (const kind of ["transfer", "transfer_in", "transfer_out"] as const) {
      expect(movementIdentityTone(kind)).toEqual({ surface: "bg-info/12", text: "text-info" });
    }
  });
});
