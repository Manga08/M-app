import { describe, expect, it } from "vitest";
import { automaticBudgetDraft, distributeMoney, simulatorStateFromSeed, summarizeSimulator } from "./plan-simulator";
import type { PlanSimulationSeed } from "./types";

describe("plan simulator math", () => {
  it("distributes money exactly and deterministically", () => {
    const result = distributeMoney(100, ["a", "b", "c"]);
    expect(result).toEqual({ a: 33.34, b: 33.33, c: 33.33 });
    expect(Object.values(result).reduce((sum, amount) => sum + amount, 0)).toBe(100);
  });

  it("builds a budget from main-category targets and subcategory weights", () => {
    const result = automaticBudgetDraft({
      incomeTarget: 1_000,
      mainCategories: [
        { group: "needs", includedInPlan: true, targetPercent: 60, sortOrder: 0 },
        { group: "wants", includedInPlan: true, targetPercent: 40, sortOrder: 1 },
        { group: "debts", includedInPlan: false, targetPercent: 0, sortOrder: 2 },
      ],
      subcategories: [
        { id: "food", group: "needs", sortOrder: 0 },
        { id: "home", group: "needs", sortOrder: 1 },
        { id: "fun", group: "wants", sortOrder: 0 },
        { id: "debt", group: "debts", sortOrder: 0 },
      ],
      weights: { food: 1, home: 2, fun: 1 },
    });
    expect(result).toEqual({ food: 200, home: 400, fun: 400, debt: 0 });
  });

  it("creates and summarizes a seed without mutating it", () => {
    const seed: PlanSimulationSeed = {
      month: "2026-08-01",
      incomeTarget: 1_000,
      actualIncome: 900,
      source: "local",
      coverage: "complete",
      mainCategories: [{ id: "g", group: "needs", name: "Necesidades", color: "#000000", icon: "home", targetPercent: 100, includedInPlan: true, sortOrder: 0 }],
      categories: [{ id: "c", name: "Casa", group: "needs", color: "#000000", icon: "home", sortOrder: 0, budget: 700, spent: 500 }],
    };
    const before = structuredClone(seed);
    const state = simulatorStateFromSeed(seed);
    expect(summarizeSimulator(state)).toMatchObject({ budget: 700, spent: 500, unassigned: 300 });
    expect(seed).toEqual(before);
  });
});
