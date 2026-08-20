import type { GroupAllocation, PlanSimulationSeed } from "./types";

export type SimulatorMainCategory = {
  id: string;
  group: string;
  name: string;
  color: string;
  icon: string;
  included: boolean;
  targetPercent: number;
  sortOrder: number;
};

export type SimulatorSubcategory = {
  id: string;
  group: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  budget: number;
  spent: number;
};

export type PlanSimulatorState = {
  month: string;
  incomeTarget: number;
  actualIncome: number;
  mainCategories: SimulatorMainCategory[];
  subcategories: SimulatorSubcategory[];
};

export type SimulatorCategorySummary = SimulatorMainCategory & {
  targetAmount: number;
  budget: number;
  spent: number;
  remaining: number;
};

export type PlanSimulatorSummary = {
  incomeTarget: number;
  budget: number;
  spent: number;
  unassigned: number;
  categories: SimulatorCategorySummary[];
};

function safeWeight(value: number | undefined) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : 0;
}

/**
 * Reparte dinero mediante restos mayores. La suma siempre coincide con el
 * total hasta el centavo y el desempate respeta el orden de las llaves.
 */
export function distributeMoney(
  total: number,
  keys: string[],
  weights?: Record<string, number | undefined>,
  fractionDigits = 2,
) {
  if (!keys.length) return {} as Record<string, number>;
  const factor = 10 ** fractionDigits;
  const totalUnits = Math.max(0, Math.round(total * factor));
  const requested = keys.map((key) => safeWeight(weights?.[key]));
  const requestedTotal = requested.reduce((sum, weight) => sum + weight, 0);
  const effective = requestedTotal > 0 ? requested : keys.map(() => 1);
  const effectiveTotal = effective.reduce((sum, weight) => sum + weight, 0);
  const quotas = effective.map((weight) => (weight / effectiveTotal) * totalUnits);
  const units = quotas.map(Math.floor);
  let remainder = totalUnits - units.reduce((sum, value) => sum + value, 0);
  const order = quotas
    .map((quota, index) => ({ index, remainder: quota - Math.floor(quota) }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);

  for (let index = 0; remainder > 0; index += 1, remainder -= 1) {
    units[order[index % order.length].index] += 1;
  }

  return Object.fromEntries(keys.map((key, index) => [key, units[index] / factor]));
}

export function automaticBudgetDraft({
  incomeTarget,
  mainCategories,
  subcategories,
  weights,
  fractionDigits = 2,
}: {
  incomeTarget: number;
  mainCategories: Pick<GroupAllocation, "group" | "includedInPlan" | "targetPercent" | "sortOrder">[];
  subcategories: Array<{ id: string; group: string; sortOrder: number }>;
  weights?: Record<string, number | undefined>;
  fractionDigits?: number;
}) {
  const draft: Record<string, number> = Object.fromEntries(subcategories.map((category) => [category.id, 0]));
  const orderedGroups = [...mainCategories].sort((left, right) => left.sortOrder - right.sortOrder);
  const groupTargets = distributeMoney(
    incomeTarget,
    orderedGroups.filter((group) => group.includedInPlan).map((group) => group.group),
    Object.fromEntries(orderedGroups.map((group) => [group.group, group.targetPercent])),
    fractionDigits,
  );

  for (const group of orderedGroups) {
    if (!group.includedInPlan) continue;
    const children = subcategories
      .filter((category) => category.group === group.group)
      .sort((left, right) => left.sortOrder - right.sortOrder);
    const allocation = distributeMoney(groupTargets[group.group] ?? 0, children.map((category) => category.id), weights, fractionDigits);
    Object.assign(draft, allocation);
  }
  return draft;
}

export function simulatorStateFromSeed(seed: PlanSimulationSeed): PlanSimulatorState {
  return {
    month: seed.month,
    incomeTarget: seed.incomeTarget,
    actualIncome: seed.actualIncome,
    mainCategories: seed.mainCategories
      .filter((category) => !category.archived)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((category) => ({
        id: category.id,
        group: category.group,
        name: category.name,
        color: category.color,
        icon: category.icon,
        included: category.includedInPlan,
        targetPercent: category.targetPercent,
        sortOrder: category.sortOrder,
      })),
    subcategories: seed.categories
      .filter((category) => !category.archived)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((category) => ({
        id: category.id,
        group: category.group,
        name: category.name,
        color: category.color,
        icon: category.icon,
        sortOrder: category.sortOrder,
        budget: category.budget,
        spent: category.spent,
      })),
  };
}

export function summarizeSimulator(state: PlanSimulatorState): PlanSimulatorSummary {
  const categories = [...state.mainCategories]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((category) => {
      const children = state.subcategories.filter((subcategory) => subcategory.group === category.group);
      const budget = children.reduce((sum, child) => sum + Math.max(0, child.budget), 0);
      const spent = children.reduce((sum, child) => sum + Math.max(0, child.spent), 0);
      return {
        ...category,
        targetAmount: category.included ? (state.incomeTarget * category.targetPercent) / 100 : 0,
        budget,
        spent,
        remaining: budget - spent,
      };
    });
  const budget = categories.reduce((sum, category) => sum + category.budget, 0);
  const spent = categories.reduce((sum, category) => sum + category.spent, 0);
  return { incomeTarget: state.incomeTarget, budget, spent, unassigned: state.incomeTarget - budget, categories };
}
