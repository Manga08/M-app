import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildArchiveGroupAllocations } from "./finance-structure-page";
import { applyFinanceGroupArchive, validateAllocationsWrite, validateArchiveFinanceGroupWrite } from "./finance-provider";
import type { ArchiveFinanceGroupInput, FinanceState, GroupAllocation, GroupAllocationWrite } from "@/lib/finance/types";

const groups: GroupAllocation[] = [
  { id: "needs-id", group: "needs", name: "Necesidades", color: "#55a8f8", icon: "home", targetPercent: 60, includedInPlan: true, sortOrder: 0 },
  { id: "wants-id", group: "wants", name: "Gustos", color: "#fb7185", icon: "sparkles", targetPercent: 40, includedInPlan: true, sortOrder: 1 },
  { id: "savings-id", group: "savings", name: "Ahorros", color: "#34d399", icon: "piggy-bank", targetPercent: 0, includedInPlan: false, sortOrder: 2 },
];

const emptyState: FinanceState = {
      profile: null,
      accountEntities: [],
      accounts: [],
  creditCards: [],
  creditCardStatements: [],
  creditCardPurchasePlans: [],
  creditCardInstallments: [],
  liabilities: [],
  liabilityTerms: [],
  liabilityRatePeriods: [],
  liabilityObligations: [],
  liabilityPaymentRules: [],
  liabilityPaymentIntents: [],
  liabilityOverview: { asOf: "", reportingCurrencyCode: "COP", totalReportingDebt: 0, items: [], coverage: "partial" },
  liabilityCalendar: [],
  categories: [],
  transactions: [],
  recurringRules: [],
  recurringOccurrences: [],
  financialTargets: [],
  financialTargetEntries: [],
  financialTargetDebts: [],
  budgets: [],
  monthlyBudgetPlans: [],
  budgetMonthsLoaded: [],
  groupAllocations: groups,
};

describe("persistencia del plan", () => {
  it("acepta cero grupos incluidos a 0% y exige 100% cuando hay incluidos", () => {
    const emptyPlan: GroupAllocationWrite[] = groups.map((group) => ({
      group: group.group,
      targetPercent: 0,
      includedInPlan: false,
      sortOrder: group.sortOrder,
    }));
    expect(() => validateAllocationsWrite(emptyPlan)).not.toThrow();
    expect(() => validateAllocationsWrite([
      { ...emptyPlan[0], includedInPlan: true, targetPercent: 100 },
      ...emptyPlan.slice(1),
    ])).not.toThrow();
    expect(() => validateAllocationsWrite([
      { ...emptyPlan[0], includedInPlan: true, targetPercent: 99 },
      ...emptyPlan.slice(1),
    ])).toThrow("exactamente 100%");
  });

  it("redistribuye antes de archivar sin reactivar grupos excluidos", () => {
    const draft = {
      needs: { percent: 60, included: true, sortOrder: 0 },
      wants: { percent: 40, included: true, sortOrder: 1 },
      savings: { percent: 0, included: false, sortOrder: 2 },
    };

    expect(buildArchiveGroupAllocations(draft, groups, "needs")).toEqual([
      { group: "needs", targetPercent: 0, includedInPlan: false, sortOrder: 0 },
      { group: "wants", targetPercent: 100, includedInPlan: true, sortOrder: 1 },
      { group: "savings", targetPercent: 0, includedInPlan: false, sortOrder: 2 },
    ]);
  });

  it("conserva un plan vacío válido cuando se archiva su único grupo incluido", () => {
    const draft = {
      needs: { percent: 100, included: true, sortOrder: 0 },
      wants: { percent: 0, included: false, sortOrder: 1 },
      savings: { percent: 0, included: false, sortOrder: 2 },
    };
    const allocations = buildArchiveGroupAllocations(draft, groups, "needs");

    expect(allocations.every((allocation) => !allocation.includedInPlan && allocation.targetPercent === 0)).toBe(true);
    expect(() => validateAllocationsWrite(allocations)).not.toThrow();
  });

  it("aplica redistribución, movimiento y archivo en un único estado local", () => {
    const input: ArchiveFinanceGroupInput = {
      groupKey: "needs",
      destinationGroupKey: "wants",
      allocations: [
        { group: "needs", targetPercent: 0, includedInPlan: false, sortOrder: 0 },
        { group: "wants", targetPercent: 100, includedInPlan: true, sortOrder: 1 },
        { group: "savings", targetPercent: 0, includedInPlan: false, sortOrder: 2 },
      ],
    };
    const state: FinanceState = {
      ...emptyState,
      categories: [{ id: "food", name: "Alimentación", group: "needs", color: "#55a8f8", icon: "utensils", kind: "expense" }],
    };

    expect(() => validateArchiveFinanceGroupWrite(input, state)).not.toThrow();
    const next = applyFinanceGroupArchive(state, input);

    expect(next.groupAllocations.find((group) => group.group === "needs")).toMatchObject({ archived: true, includedInPlan: false, targetPercent: 0 });
    expect(next.groupAllocations.find((group) => group.group === "wants")).toMatchObject({ includedInPlan: true, targetPercent: 100 });
    expect(next.categories[0]).toMatchObject({ group: "wants" });
    expect(state.categories[0].group).toBe("needs");
  });

  it("rechaza redistribuciones incompletas antes de escribir el WAL", () => {
    const input: ArchiveFinanceGroupInput = {
      groupKey: "needs",
      archiveCategories: true,
      allocations: [
        { group: "needs", targetPercent: 0, includedInPlan: false, sortOrder: 0 },
        { group: "wants", targetPercent: 100, includedInPlan: true, sortOrder: 1 },
      ],
    };

    expect(() => validateArchiveFinanceGroupWrite(input, emptyState)).toThrow("cada categoría principal activa");
  });

  it("mantiene el contrato SQL atómico y la misma regla 0-o-100", () => {
    const migrationPath = fileURLToPath(new URL("../../supabase/migrations/20260819210743_plan_invariant_atomic_group_archive.sql", import.meta.url));
    const sql = readFileSync(migrationPath, "utf8");
    const applyPlanAt = sql.indexOf("perform public.set_group_allocations(p_allocations)");
    const moveCategoriesAt = sql.indexOf("update public.categories", applyPlanAt);
    const archiveGroupAt = sql.indexOf("update public.group_allocations", moveCategoriesAt);

    expect(sql).toContain("included_count = 0 and percent_sum = 0");
    expect(sql).toContain("included_count > 0 and percent_sum = 100");
    expect(sql).toContain("archive_finance_group_atomic");
    expect(sql).toContain("order by finance_group.group_key\n  for update");
    expect(sql).toContain("if source_archived then");
    expect(sql.indexOf("if source_archived then")).toBeLessThan(applyPlanAt);
    expect(sql).toContain("update of user_id, category_group, transaction_kind, archived");
    expect(applyPlanAt).toBeGreaterThan(-1);
    expect(moveCategoriesAt).toBeGreaterThan(applyPlanAt);
    expect(archiveGroupAt).toBeGreaterThan(moveCategoriesAt);
  });

  it("guarda el presupuesto mensual y su base en una sola transacción SQL", () => {
    const migrationPath = fileURLToPath(new URL("../../supabase/migrations/20260820045736_monthly_budget_plans_and_simulator.sql", import.meta.url));
    const sql = readFileSync(migrationPath, "utf8");
    const planAt = sql.indexOf("insert into public.monthly_budget_plans", sql.indexOf("set_monthly_budget_plan"));
    const deleteAt = sql.indexOf("delete from public.budgets", planAt);
    const budgetsAt = sql.indexOf("insert into public.budgets", deleteAt);

    expect(sql).toContain("alter table public.monthly_budget_plans enable row level security");
    expect(sql).toContain("monthly_budget_plans_private_access");
    expect(sql).toContain("set_finance_category_order");
    expect(sql).toContain("get_plan_simulation_seed");
    expect(sql).toContain("grant execute on function public.set_monthly_budget_plan");
    expect(planAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeGreaterThan(planAt);
    expect(budgetsAt).toBeGreaterThan(deleteAt);
  });
});
