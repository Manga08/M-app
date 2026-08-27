import { describe, expect, it } from "vitest";
import type { FinanceSnapshot, Transaction } from "./types";
import { accountCurrencyIsLocked } from "./account-currency";

const snapshot: FinanceSnapshot = {
  month: "2026-08-01",
  income: 0,
  expense: 0,
  accountBalances: { old: 100, empty: 0 },
  accountMovementCounts: { old: 8, empty: 0 },
  categorySpending: {},
};

describe("accountCurrencyIsLocked", () => {
  it("locks an account whose older movements are outside the paginated local list", () => {
    expect(accountCurrencyIsLocked("old", snapshot, [])).toBe(true);
  });

  it("also sees a new local movement that is not in the remote snapshot yet", () => {
    const pending = [{ id: "pending", accountId: "empty" }] as Transaction[];
    expect(accountCurrencyIsLocked("empty", snapshot, pending)).toBe(true);
  });

  it("leaves a genuinely unused account editable", () => {
    expect(accountCurrencyIsLocked("empty", snapshot, [])).toBe(false);
  });
});
