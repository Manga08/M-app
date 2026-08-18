import { describe, expect, it } from "vitest";
import { accountBalance, categorySpend, groupBudgetSummary, monthTotals, toCsv } from "./calculations";
import type { Account, Budget, Category, GroupAllocation, Transaction } from "./types";

const account: Account = { id: "a", name: "Principal", type: "checking", initialBalance: 1000, color: "#000000" };
const categories: Category[] = [{ id: "food", name: "Comida", group: "needs", color: "#000000", icon: "food", kind: "expense" }];
const budgets: Budget[] = [{ id: "b", categoryId: "food", month: "2026-08-01", amount: 500 }];
const groups: GroupAllocation[] = [{ id: "g", group: "needs", name: "Necesidades", color: "#55a8f8", icon: "home", targetPercent: 100, includedInPlan: true, sortOrder: 0 }];
const transactions: Transaction[] = [
  { id: "1", kind: "income", amount: 1000, accountId: "a", description: "Nómina", occurredOn: "2026-08-01", createdAt: "2026-08-01T00:00:00Z" },
  { id: "2", kind: "expense", amount: 200, accountId: "a", categoryId: "food", description: "Mercado", occurredOn: "2026-08-02", createdAt: "2026-08-02T00:00:00Z" },
  { id: "3", kind: "transfer_out", amount: 100, accountId: "a", transferGroupId: "g", description: "Transferencia", occurredOn: "2026-08-03", createdAt: "2026-08-03T00:00:00Z" },
  { id: "4", kind: "expense", amount: 50, accountId: "a", categoryId: "food", description: "Otro mes", occurredOn: "2026-07-30", createdAt: "2026-07-30T00:00:00Z" },
];

describe("cálculos financieros", () => {
  it("separa ingresos y gastos sin contar transferencias", () => {
    expect(monthTotals(transactions)).toEqual({ income: 1000, expense: 200 });
  });

  it("calcula saldo de cuenta incluyendo transferencias", () => {
    expect(accountBalance(account, transactions)).toBe(1650);
  });

  it("calcula gasto mensual por categoría", () => {
    expect(categorySpend(transactions, "food")).toBe(200);
  });

  it("resume presupuesto, usado y disponible", () => {
    expect(groupBudgetSummary(categories, budgets, transactions, groups)[0]).toEqual({ group: "needs", name: "Necesidades", color: "#55a8f8", includedInPlan: true, targetPercent: 100, budget: 500, spent: 200, available: 300, percent: 40 });
  });

  it("exporta CSV escapando texto y conservando encabezados", () => {
    const csv = toCsv([{ ...transactions[1], description: 'Compra "grande"' }], [account], categories);
    expect(csv).toContain("Fecha,Tipo,Descripción");
    expect(csv).toContain('"Compra ""grande"""');
  });

  it("neutraliza fórmulas al exportar texto controlado por el usuario", () => {
    const csv = toCsv([{ ...transactions[1], description: "=HYPERLINK(\"https://example.com\")" }], [account], categories);
    expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")"');
  });
});
