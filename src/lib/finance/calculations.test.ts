import { describe, expect, it } from "vitest";
import { accountBalance, accountBaseBalance, categorySpend, currentMonthStart, distributePlanAllocationFromWeights, groupBudgetSummary, localIsoDate, monthTotals, normalizePlanAllocationDraft, planAllocationNeedsAdjustment, setPlanAllocationIncluded, toCsv, type PlanAllocationDraft } from "./calculations";
import type { Account, Budget, Category, FinanceSnapshot, GroupAllocation, Transaction } from "./types";

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
const snapshot: FinanceSnapshot = { month: "2026-08-01", income: 25000, expense: 7400, accountBalances: { a: 17600 }, categorySpending: { food: 7400 } };

describe("cálculos financieros", () => {
  it("separa ingresos y gastos sin contar transferencias", () => {
    expect(monthTotals(transactions, "2026-08-01")).toEqual({ income: 1000, expense: 200 });
  });

  it("calcula saldo de cuenta incluyendo transferencias", () => {
    expect(accountBalance(account, transactions)).toBe(1650);
  });

  it("calcula gasto mensual por categoría", () => {
    expect(categorySpend(transactions, "food", "2026-08-01")).toBe(200);
  });

  it("suma flujos en moneda contable y conserva el saldo nativo de la cuenta", () => {
    const usdAccount = { ...account, id: "usd", currencyCode: "USD", initialBalance: 100, openingExchangeRate: 4_000 };
    const usdTransactions: Transaction[] = [
      { id: "usd-income", kind: "income", amount: 10, baseAmount: 41_000, exchangeRate: 4_100, nativeCurrencyCode: "USD", baseCurrencyCode: "COP", accountId: "usd", description: "Ingreso USD", occurredOn: "2026-08-01", createdAt: "2026-08-01T00:00:00Z" },
      { id: "usd-adjustment", kind: "adjustment_in", amount: 5, baseAmount: 20_500, exchangeRate: 4_100, nativeCurrencyCode: "USD", baseCurrencyCode: "COP", accountId: "usd", description: "Ajuste", occurredOn: "2026-08-02", createdAt: "2026-08-02T00:00:00Z" },
    ];

    expect(monthTotals(usdTransactions, "2026-08-01")).toEqual({ income: 41_000, expense: 0 });
    expect(accountBalance(usdAccount, usdTransactions)).toBe(115);
    expect(accountBaseBalance(usdAccount, usdTransactions)).toBe(461_500);
  });

  it("valora el patrimonio inicial USD aun antes de recibir un snapshot remoto", () => {
    const usdAccount = { ...account, id: "usd-opening", currencyCode: "USD", initialBalance: 80, openingExchangeRate: 3_081.67 };
    expect(accountBaseBalance(usdAccount, [])).toBeCloseTo(246_533.6);
  });

  it("respeta la zona horaria del perfil al elegir el día y el mes actuales", () => {
    const instant = new Date("2026-01-01T01:30:00.000Z");
    expect(localIsoDate(instant, "America/Bogota")).toBe("2025-12-31");
    expect(currentMonthStart(instant, "America/Bogota")).toBe("2025-12-01");
    expect(localIsoDate(instant, "Asia/Tokyo")).toBe("2026-01-01");
  });

  it("prioriza agregados exactos del servidor sobre un historial paginado", () => {
    expect(monthTotals(transactions, "2026-08-01", snapshot)).toEqual({ income: 25000, expense: 7400 });
    expect(accountBalance(account, transactions, snapshot)).toBe(17600);
    expect(categorySpend(transactions, "food", "2026-08-01", snapshot)).toBe(7400);
  });

  it("resume presupuesto, usado y disponible", () => {
    expect(groupBudgetSummary(categories, budgets, transactions, groups, "2026-08-01")[0]).toEqual({ group: "needs", name: "Necesidades", color: "#55a8f8", includedInPlan: true, targetPercent: 100, budget: 500, spent: 200, available: 300, percent: 40 });
  });

  it("conserva el gasto histórico pero excluye el presupuesto de una categoría archivada", () => {
    const archivedCategories = [{ ...categories[0], archived: true }];
    expect(groupBudgetSummary(archivedCategories, budgets, transactions, groups, "2026-08-01")[0]).toEqual({ group: "needs", name: "Necesidades", color: "#55a8f8", includedInPlan: true, targetPercent: 100, budget: 0, spent: 200, available: -200, percent: 0 });
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

  it("ajusta el plan usando solo los grupos incluidos sin reactivar los excluidos", () => {
    const draft = {
      needs: { percent: 50, included: true, sortOrder: 0 },
      wants: { percent: 0, included: false, sortOrder: 1 },
      savings: { percent: 20, included: true, sortOrder: 2 },
    };
    const planGroups = [
      { group: "needs", sortOrder: 0 },
      { group: "wants", sortOrder: 1 },
      { group: "savings", sortOrder: 2 },
    ];

    const normalized = normalizePlanAllocationDraft(draft, planGroups);

    expect(normalized).toEqual({
      needs: { percent: 71, included: true, sortOrder: 0 },
      wants: { percent: 0, included: false, sortOrder: 1 },
      savings: { percent: 29, included: true, sortOrder: 2 },
    });
    expect(draft.needs.percent).toBe(50);
  });

  it("el ajuste equitativo redistribuye también un grupo recién incluido en cero", () => {
    const draft = {
      needs: { percent: 50, included: true, sortOrder: 0 },
      wants: { percent: 30, included: true, sortOrder: 1 },
      savings: { percent: 10, included: true, sortOrder: 2 },
      investments: { percent: 10, included: true, sortOrder: 3 },
      debts: { percent: 0, included: true, sortOrder: 4 },
    };
    const planGroups = Object.entries(draft).map(([group, value]) => ({ group, sortOrder: value.sortOrder }));

    expect(planAllocationNeedsAdjustment(draft, planGroups, "equal")).toBe(true);
    expect(normalizePlanAllocationDraft(draft, planGroups, "equal")).toEqual({
      needs: { percent: 20, included: true, sortOrder: 0 },
      wants: { percent: 20, included: true, sortOrder: 1 },
      savings: { percent: 20, included: true, sortOrder: 2 },
      investments: { percent: 20, included: true, sortOrder: 3 },
      debts: { percent: 20, included: true, sortOrder: 4 },
    });
  });

  it("reparte por igual con enteros equilibrados y suma exacta de 100", () => {
    const draft = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [
      `group-${index}`,
      { percent: index === 0 ? 100 : 0, included: true, sortOrder: index },
    ]));
    const planGroups = Array.from({ length: 6 }, (_, index) => ({ group: `group-${index}`, sortOrder: index }));
    const normalized = normalizePlanAllocationDraft(draft, planGroups, "equal");
    const percentages = planGroups.map((group) => normalized[group.group].percent);

    expect(percentages).toEqual([17, 17, 17, 17, 16, 16]);
    expect(percentages.reduce((sum, percent) => sum + percent, 0)).toBe(100);
    expect(Math.max(...percentages) - Math.min(...percentages)).toBe(1);
  });

  it("procesa en orden una secuencia rápida de switches y ajuste usando siempre el estado más reciente", () => {
    const planGroups = [
      { group: "needs", sortOrder: 0 },
      { group: "wants", sortOrder: 1 },
      { group: "savings", sortOrder: 2 },
      { group: "debts", sortOrder: 3 },
    ];
    const initial: PlanAllocationDraft = {
      needs: { percent: 50, included: true, sortOrder: 0 },
      wants: { percent: 30, included: true, sortOrder: 1 },
      savings: { percent: 20, included: true, sortOrder: 2 },
      debts: { percent: 0, included: false, sortOrder: 3 },
    };

    const reducers = [
      (current: PlanAllocationDraft) => setPlanAllocationIncluded(current, "wants", false),
      (current: PlanAllocationDraft) => setPlanAllocationIncluded(current, "debts", true),
      (current: PlanAllocationDraft) => setPlanAllocationIncluded(current, "wants", true),
      (current: PlanAllocationDraft) => normalizePlanAllocationDraft(current, planGroups, "equal"),
    ];
    const normalized = reducers.reduce((current, reducer) => reducer(current), initial);
    const included = Object.values(normalized).filter((entry) => entry.included);

    expect(normalized.wants.included).toBe(true);
    expect(normalized.debts.included).toBe(true);
    expect(included.map((entry) => entry.percent)).toEqual([25, 25, 25, 25]);
    expect(included.reduce((sum, entry) => sum + entry.percent, 0)).toBe(100);
  });

  it("detecta el ajuste según la distribución equitativa que aplicará el botón", () => {
    const planGroups = [
      { group: "needs", sortOrder: 0 },
      { group: "wants", sortOrder: 1 },
      { group: "savings", sortOrder: 2 },
      { group: "debts", sortOrder: 3 },
    ];
    const customDraft: PlanAllocationDraft = {
      needs: { percent: 40, included: true, sortOrder: 0 },
      wants: { percent: 30, included: true, sortOrder: 1 },
      savings: { percent: 20, included: true, sortOrder: 2 },
      debts: { percent: 10, included: true, sortOrder: 3 },
    };
    const equalDraft = normalizePlanAllocationDraft(customDraft, planGroups, "equal");

    expect(planAllocationNeedsAdjustment(customDraft, planGroups, "equal")).toBe(true);
    expect(Object.values(equalDraft).map((entry) => entry.percent)).toEqual([25, 25, 25, 25]);
    expect(planAllocationNeedsAdjustment(equalDraft, planGroups, "equal")).toBe(false);
  });

  it("reparte el plan según el gasto observado y conserva fuera los grupos excluidos", () => {
    const planGroups = [
      { group: "needs", sortOrder: 0 },
      { group: "wants", sortOrder: 1 },
      { group: "savings", sortOrder: 2 },
      { group: "debts", sortOrder: 3 },
    ];
    const draft: PlanAllocationDraft = {
      needs: { percent: 25, included: true, sortOrder: 0 },
      wants: { percent: 25, included: true, sortOrder: 1 },
      savings: { percent: 25, included: true, sortOrder: 2 },
      debts: { percent: 25, included: false, sortOrder: 3 },
    };

    expect(distributePlanAllocationFromWeights(draft, planGroups, { needs: 500, wants: 300, savings: 200, debts: 900 })).toEqual({
      needs: { percent: 50, included: true, sortOrder: 0 },
      wants: { percent: 30, included: true, sortOrder: 1 },
      savings: { percent: 20, included: true, sortOrder: 2 },
      debts: { percent: 0, included: false, sortOrder: 3 },
    });
  });

  it("mantiene una suma exacta con gastos históricos difíciles de redondear", () => {
    const planGroups = ["a", "b", "c"].map((group, sortOrder) => ({ group, sortOrder }));
    const draft = Object.fromEntries(planGroups.map(({ group, sortOrder }) => [group, { percent: 0, included: true, sortOrder }]));
    const result = distributePlanAllocationFromWeights(draft, planGroups, { a: 1, b: 1, c: 1 });

    expect(result && planGroups.map(({ group }) => result[group].percent)).toEqual([34, 33, 33]);
  });

  it("no inventa porcentajes cuando el mes elegido no tiene gastos", () => {
    const planGroups = [{ group: "needs", sortOrder: 0 }];
    const draft = { needs: { percent: 100, included: true, sortOrder: 0 } };
    expect(distributePlanAllocationFromWeights(draft, planGroups, { needs: 0 })).toBeNull();
  });

  it("es estable al ajustar repetidamente y no modifica el borrador de entrada", () => {
    const draft: PlanAllocationDraft = {
      needs: { percent: 42, included: true, sortOrder: 2 },
      wants: { percent: 0, included: true, sortOrder: 0 },
      savings: { percent: 17, included: true, sortOrder: 1 },
      debts: { percent: 9, included: false, sortOrder: 3 },
    };
    const planGroups = [
      { group: "needs", sortOrder: 0 },
      { group: "wants", sortOrder: 1 },
      { group: "savings", sortOrder: 2 },
      { group: "debts", sortOrder: 3 },
    ];
    const snapshot = structuredClone(draft);
    const first = normalizePlanAllocationDraft(draft, planGroups);
    const second = normalizePlanAllocationDraft(first, planGroups);

    expect(second).toEqual(first);
    expect(planAllocationNeedsAdjustment(first, planGroups)).toBe(false);
    expect(first.debts).toEqual({ percent: 0, included: false, sortOrder: 3 });
    expect(draft).toEqual(snapshot);
  });

  it("mantiene el plan vacío válido y limpia porcentajes residuales de grupos excluidos", () => {
    const draft: PlanAllocationDraft = {
      needs: { percent: 65, included: false, sortOrder: 0 },
      wants: { percent: 35, included: false, sortOrder: 1 },
    };
    const planGroups = [
      { group: "needs", sortOrder: 0 },
      { group: "wants", sortOrder: 1 },
    ];

    expect(normalizePlanAllocationDraft(draft, planGroups)).toEqual({
      needs: { percent: 0, included: false, sortOrder: 0 },
      wants: { percent: 0, included: false, sortOrder: 1 },
    });
  });

  it("garantiza las invariantes para cualquier cantidad viable de grupos y pesos mixtos", () => {
    for (let groupCount = 1; groupCount <= 100; groupCount += 1) {
      const planGroups = Array.from({ length: groupCount }, (_, index) => ({ group: `group-${index}`, sortOrder: groupCount - index }));
      const draft = Object.fromEntries(planGroups.map((group, index) => [
        group.group,
        { percent: index % 4 === 0 ? 0 : (index * 37) % 101, included: true, sortOrder: group.sortOrder },
      ]));

      for (const mode of ["proportional", "equal"] as const) {
        const normalized = normalizePlanAllocationDraft(draft, planGroups, mode);
        const percentages = planGroups.map((group) => normalized[group.group].percent);

        expect(percentages.every((percent) => Number.isInteger(percent) && percent >= 1)).toBe(true);
        expect(percentages.reduce((sum, percent) => sum + percent, 0)).toBe(100);
        expect(normalizePlanAllocationDraft(normalized, planGroups)).toEqual(normalized);
      }
    }
  });
});
