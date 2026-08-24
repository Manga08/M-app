import { describe, expect, it } from "vitest";
import { allocationTone, availableTone, budgetUsageTone, expenseTone } from "./financial-status";

describe("señales financieras", () => {
  it("marca el disponible positivo como saludable, cero como neutral y el déficit como riesgo", () => {
    expect(availableTone(1)).toBe("positive");
    expect(availableTone(0)).toBe("neutral");
    expect(availableTone(-1)).toBe("destructive");
  });

  it("presenta las salidas como costo y cero salidas como estado neutral", () => {
    expect(expenseTone(400)).toBe("destructive");
    expect(expenseTone(0)).toBe("neutral");
  });

  it("distingue presupuesto sano, próximo al límite y excedido", () => {
    expect(budgetUsageTone(50, 100)).toBe("positive");
    expect(budgetUsageTone(90, 100)).toBe("warning");
    expect(budgetUsageTone(101, 100)).toBe("destructive");
    expect(budgetUsageTone(1, 0)).toBe("destructive");
  });

  it("no presenta una asignación como sana cuando no hay ingresos", () => {
    expect(allocationTone(80, true)).toBe("positive");
    expect(allocationTone(95, true)).toBe("warning");
    expect(allocationTone(101, true)).toBe("destructive");
    expect(allocationTone(100, false)).toBe("destructive");
  });
});
