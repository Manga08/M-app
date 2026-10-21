import { z } from "zod";
import { summarizeSimulator, automaticBudgetDraft, type PlanSimulatorState } from "@/lib/finance/plan-simulator";

const money = z.coerce.number().finite().min(0).max(1_000_000_000_000);
const text = z.string().min(1).max(120);
const base = { id: text, group: text, name: text, color: z.string().max(20), icon: z.string().max(80), sortOrder: z.number().int().min(0).max(10000) };
export const simulationSchema = z.object({
  month: z.iso.date(), incomeTarget: money, actualIncome: money.default(0),
  mainCategories: z.array(z.object({ ...base, included: z.boolean(), targetPercent: z.coerce.number().finite().min(0).max(100) }).strict()).max(100),
  subcategories: z.array(z.object({ ...base, budget: money, spent: money }).strict()).max(1000),
  automaticBudgets: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  const groups = new Set(value.mainCategories.map((item) => item.group));
  const ids = [...value.mainCategories, ...value.subcategories].map((item) => item.id);
  if (new Set(ids).size !== ids.length || groups.size !== value.mainCategories.length) context.addIssue({ code: "custom", message: "No repitas IDs ni categorías principales." });
  if (value.subcategories.some((item) => !groups.has(item.group))) context.addIssue({ code: "custom", message: "Cada subcategoría necesita una categoría principal." });
  const included = value.mainCategories.filter((item) => item.included);
  if (value.automaticBudgets && (!included.length || Math.abs(included.reduce((sum, item) => sum + item.targetPercent, 0) - 100) > 0.00001)) context.addIssue({ code: "custom", message: "Para repartir automáticamente, la distribución debe sumar 100%." });
});

export function runIntegrationSimulation(input: unknown) {
  const parsed = simulationSchema.parse(input);
  const state: PlanSimulatorState = parsed;
  if (parsed.automaticBudgets) {
    const budgets = automaticBudgetDraft({
      incomeTarget: state.incomeTarget, fractionDigits: 0,
      mainCategories: state.mainCategories.map((item) => ({ ...item, includedInPlan: item.included })),
      subcategories: state.subcategories,
    });
    state.subcategories = state.subcategories.map((item) => ({ ...item, budget: budgets[item.id] ?? 0 }));
  }
  return { persisted: false, currency: "COP", state, summary: summarizeSimulator(state) };
}
