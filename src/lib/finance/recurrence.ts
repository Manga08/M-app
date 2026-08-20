import type { Budget, RecurringOccurrence, RecurringRule, RecurringRuleInput } from "./types";

const DAY_MS = 86_400_000;

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) throw new Error(`Fecha inválida: ${value}`);
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function clampedMonthDate(year: number, monthIndex: number, requestedDay: number) {
  return new Date(Date.UTC(year, monthIndex, Math.min(requestedDay, daysInMonth(year, monthIndex))));
}

function addMonthsClamped(value: Date, count: number, requestedDay: number) {
  const absoluteMonth = value.getUTCFullYear() * 12 + value.getUTCMonth() + count;
  const year = Math.floor(absoluteMonth / 12);
  const month = absoluteMonth % 12;
  return clampedMonthDate(year, month, requestedDay);
}

function addYearsClamped(value: Date, count: number, month: number, requestedDay: number) {
  return clampedMonthDate(value.getUTCFullYear() + count, month, requestedDay);
}

export function recurringEffectiveDate(scheduledOn: string, postingPolicy: RecurringRule["postingPolicy"]) {
  return postingPolicy === "month_start" ? `${scheduledOn.slice(0, 7)}-01` : scheduledOn;
}

export function recurringScheduleDates(
  rule: Pick<RecurringRuleInput, "cadence" | "intervalCount" | "startsOn" | "endsOn" | "anchorDay">,
  rangeStart: string,
  rangeEnd: string,
) {
  const start = parseIsoDate(rule.startsOn);
  const from = parseIsoDate(rangeStart);
  const to = parseIsoDate(rangeEnd);
  const end = rule.endsOn ? parseIsoDate(rule.endsOn) : to;
  const limit = end < to ? end : to;
  const interval = Math.max(1, Math.trunc(rule.intervalCount));
  const requestedDay = Math.min(31, Math.max(1, Math.trunc(rule.anchorDay ?? start.getUTCDate())));
  const dates: string[] = [];
  let cursor = new Date(start);
  let guard = 0;

  while (cursor <= limit && guard < 2_000) {
    if (cursor >= from) dates.push(isoDate(cursor));
    if (rule.cadence === "weekly") cursor = new Date(cursor.getTime() + interval * 7 * DAY_MS);
    if (rule.cadence === "monthly") cursor = addMonthsClamped(cursor, interval, requestedDay);
    if (rule.cadence === "yearly") cursor = addYearsClamped(cursor, interval, start.getUTCMonth(), requestedDay);
    guard += 1;
  }

  return dates;
}

export function projectedOccurrences(
  rule: RecurringRule,
  rangeStart: string,
  rangeEnd: string,
): RecurringOccurrence[] {
  if (rule.status !== "active") return [];
  return recurringScheduleDates(rule, rangeStart, rangeEnd).map((scheduledOn) => ({
    id: `projected:${rule.id}:${scheduledOn}`,
    ruleId: rule.id,
    kind: rule.kind,
    scheduledOn,
    effectiveOn: recurringEffectiveDate(scheduledOn, rule.postingPolicy),
    amount: rule.amount,
    accountId: rule.accountId,
    destinationAccountId: rule.destinationAccountId,
    categoryId: rule.categoryId,
    description: rule.description,
    merchant: rule.merchant,
    note: rule.note,
    icon: rule.icon,
    status: "planned",
    createdAt: rule.createdAt,
  }));
}

export function recurringCommitmentsByCategory(occurrences: RecurringOccurrence[], rules: RecurringRule[], month: string) {
  const enabled = new Set(rules.filter((rule) => rule.includeInBudget && rule.status === "active").map((rule) => rule.id));
  const result: Record<string, number> = {};
  for (const occurrence of occurrences) {
    if (occurrence.kind !== "expense" || !occurrence.categoryId || !enabled.has(occurrence.ruleId)) continue;
    if (occurrence.effectiveOn.slice(0, 7) !== month.slice(0, 7) || occurrence.status !== "planned") continue;
    result[occurrence.categoryId] = (result[occurrence.categoryId] ?? 0) + occurrence.amount;
  }
  return result;
}

export function budgetsWithRecurringCommitments(budgets: Budget[], commitments: Record<string, number>, month: string) {
  const current = new Map(budgets.filter((budget) => budget.month === month).map((budget) => [budget.categoryId, budget]));
  const categories = new Set([...current.keys(), ...Object.keys(commitments)]);
  const merged = [...categories].map((categoryId) => {
    const budget = current.get(categoryId);
    return { id: budget?.id ?? `planned:${month}:${categoryId}`, categoryId, month, amount: Math.max(budget?.amount ?? 0, commitments[categoryId] ?? 0) } satisfies Budget;
  });
  return [...budgets.filter((budget) => budget.month !== month), ...merged];
}

export function nextPlannedOccurrence(occurrences: RecurringOccurrence[], today: string) {
  return occurrences
    .filter((item) => item.status === "planned" && item.effectiveOn >= today)
    .toSorted((a, b) => a.effectiveOn.localeCompare(b.effectiveOn) || a.id.localeCompare(b.id))[0];
}

export function validateRecurringRule(input: RecurringRuleInput) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("El monto programado debe ser mayor que cero.");
  if (!input.accountId) throw new Error("Selecciona una cuenta.");
  if (!input.description.trim()) throw new Error("Escribe una descripción.");
  if (input.kind === "transfer" && (!input.destinationAccountId || input.destinationAccountId === input.accountId)) {
    throw new Error("Selecciona una cuenta de destino diferente.");
  }
  if (input.kind !== "transfer" && !input.categoryId) throw new Error("Selecciona una subcategoría.");
  if (input.endsOn && input.endsOn < input.startsOn) throw new Error("La fecha final debe ser posterior a la inicial.");
  if (input.intervalCount < 1 || input.intervalCount > 365) throw new Error("El intervalo no es válido.");
}
