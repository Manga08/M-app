import { describe, expect, it } from "vitest";
import { budgetsWithRecurringCommitments, nextPlannedOccurrence, projectedOccurrences, recurringCommitmentsByCategory, recurringEffectiveDate, recurringScheduleDates, validateRecurringRule } from "./recurrence";
import type { RecurringRule } from "./types";

const rule: RecurringRule = {
  id: "rule-1", kind: "expense", amount: 25_000, accountId: "account-1", categoryId: "category-1",
  description: "Suscripción", cadence: "monthly", intervalCount: 1, startsOn: "2026-01-31", anchorDay: 31,
  postingPolicy: "scheduled_date", timezone: "America/Bogota", autoPost: true, includeInBudget: true,
  includeInIncomeTarget: false, status: "active", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};

describe("recurrence", () => {
  it("clamps days 29-31 to the last valid day and returns to the anchor later", () => {
    expect(recurringScheduleDates(rule, "2026-01-01", "2026-04-30")).toEqual([
      "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30",
    ]);
  });

  it("supports leap years without drifting", () => {
    expect(recurringScheduleDates({ ...rule, startsOn: "2028-02-29", cadence: "yearly", anchorDay: 29 }, "2028-01-01", "2032-12-31"))
      .toEqual(["2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
  });

  it("moves the effective posting date to month start when requested", () => {
    expect(recurringEffectiveDate("2026-08-15", "month_start")).toBe("2026-08-01");
  });

  it("does not project paused rules", () => {
    expect(projectedOccurrences({ ...rule, status: "paused" }, "2026-01-01", "2026-02-28")).toEqual([]);
  });

  it("counts only enabled expense commitments for the requested month", () => {
    const occurrences = projectedOccurrences(rule, "2026-01-01", "2026-03-31");
    expect(recurringCommitmentsByCategory(occurrences, [rule], "2026-02-01")).toEqual({ "category-1": 25_000 });
    expect(recurringCommitmentsByCategory(occurrences, [{ ...rule, includeInBudget: false }], "2026-02-01")).toEqual({});
  });

  it("raises the effective budget to the recurring commitment without mutating the stored budget", () => {
    const budgets = [{ id: "budget-1", categoryId: "category-1", month: "2026-02-01", amount: 10_000 }];
    expect(budgetsWithRecurringCommitments(budgets, { "category-1": 25_000 }, "2026-02-01")[0].amount).toBe(25_000);
    expect(budgets[0].amount).toBe(10_000);
  });

  it("finds the next planned occurrence deterministically", () => {
    const occurrences = projectedOccurrences(rule, "2026-01-01", "2026-04-30");
    expect(nextPlannedOccurrence(occurrences, "2026-02-01")?.scheduledOn).toBe("2026-02-28");
  });

  it("rejects invalid transfer destinations", () => {
    expect(() => validateRecurringRule({ ...rule, kind: "transfer", categoryId: undefined, destinationAccountId: "account-1" }))
      .toThrow("destino diferente");
  });
});
