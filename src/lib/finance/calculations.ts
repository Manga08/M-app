import type { Account, Budget, Category, FinanceSnapshot, GroupAllocation, Transaction } from "./types";
import { transactionReportingAmount } from "./currency";

export type PlanAllocationDraft = Record<string, { percent: number; included: boolean; sortOrder: number }>;

export type PlanAllocationMode = "equal" | "proportional";

const PLAN_TOTAL_PERCENT = 100;

function validPercent(value: number | undefined) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : 0;
}

/**
 * Converts arbitrary weights into whole percentages whose sum is exact.
 * The largest-remainder method keeps rounding deterministic and prevents the
 * final group from absorbing all rounding error.
 */
function distributeWholePercentages(weights: number[], minimum: number) {
  if (!weights.length) return [];

  const safeMinimum = minimum * weights.length <= PLAN_TOTAL_PERCENT ? minimum : 0;
  const available = PLAN_TOTAL_PERCENT - safeMinimum * weights.length;
  const safeWeights = weights.map(validPercent);
  const weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0);
  const effectiveWeights = weightTotal > 0 ? safeWeights : safeWeights.map(() => 1);
  const effectiveTotal = effectiveWeights.reduce((sum, weight) => sum + weight, 0);
  const quotas = effectiveWeights.map((weight) => (weight / effectiveTotal) * available);
  const result = quotas.map((quota) => safeMinimum + Math.floor(quota));
  const remaining = PLAN_TOTAL_PERCENT - result.reduce((sum, percent) => sum + percent, 0);

  const remainderOrder = quotas
    .map((quota, index) => ({ index, remainder: quota - Math.floor(quota) }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);

  for (let index = 0; index < remaining; index += 1) {
    result[remainderOrder[index % remainderOrder.length].index] += 1;
  }

  return result;
}

export function setPlanAllocationIncluded(current: PlanAllocationDraft, groupKey: string, included: boolean) {
  const entry = current[groupKey];
  if (!entry || entry.included === included && (included || entry.percent === 0)) return current;

  return {
    ...current,
    [groupKey]: { ...entry, included, percent: included ? entry.percent : 0 },
  };
}

export function normalizePlanAllocationDraft(
  current: PlanAllocationDraft,
  groups: Pick<GroupAllocation, "group" | "sortOrder">[],
  mode: PlanAllocationMode = "proportional",
) {
  const currentOrder = [...groups].sort((left, right) => {
    const leftOrder = current[left.group]?.sortOrder ?? left.sortOrder;
    const rightOrder = current[right.group]?.sortOrder ?? right.sortOrder;
    return leftOrder - rightOrder;
  });
  const included = currentOrder.filter((group) => current[group.group]?.included);
  const next = { ...current };

  currentOrder.filter((group) => !current[group.group]?.included).forEach((group) => {
    const entry = current[group.group] ?? { percent: 0, included: false, sortOrder: group.sortOrder };
    next[group.group] = { ...entry, included: false, percent: 0 };
  });

  if (!included.length) return next;

  const currentWeights = included.map((group) => validPercent(current[group.group]?.percent));
  const currentTotal = currentWeights.reduce((sum, percent) => sum + percent, 0);
  const alreadyValid = mode === "proportional"
    && included.length <= PLAN_TOTAL_PERCENT
    && currentTotal === PLAN_TOTAL_PERCENT
    && currentWeights.every((percent) => Number.isInteger(percent) && percent > 0);
  const percentages = alreadyValid
    ? currentWeights
    : distributeWholePercentages(mode === "equal" ? currentWeights.map(() => 1) : currentWeights, included.length <= PLAN_TOTAL_PERCENT ? 1 : 0);

  included.forEach((group, index) => {
    const entry = current[group.group] ?? { percent: 0, included: true, sortOrder: group.sortOrder };
    next[group.group] = { ...entry, included: true, percent: percentages[index] };
  });

  return next;
}

export function planAllocationNeedsAdjustment(
  current: PlanAllocationDraft,
  groups: Pick<GroupAllocation, "group" | "sortOrder">[],
  mode: PlanAllocationMode = "proportional",
) {
  const normalized = normalizePlanAllocationDraft(current, groups, mode);
  return groups.some((group) => {
    const entry = current[group.group];
    const next = normalized[group.group];
    return Boolean(entry?.included) !== next.included || (entry?.percent ?? 0) !== next.percent;
  });
}

function calendarParts(date: Date, timeZone?: string) {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
      const value = (type: "year" | "month" | "day") => Number(parts.find((part) => part.type === type)?.value);
      const zoned = { year: value("year"), month: value("month"), day: value("day") };
      if (zoned.year && zoned.month && zoned.day) return zoned;
    } catch {
      // Invalid or unavailable IANA zones fall back to the device calendar.
    }
  }
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

/**
 * Reparte el plan según pesos observados (por ejemplo, gasto real de un mes).
 * Los grupos excluidos permanecen fuera y un mes sin actividad no inventa una
 * distribución: en ese caso devuelve null para que la interfaz lo explique.
 */
export function distributePlanAllocationFromWeights(
  current: PlanAllocationDraft,
  groups: Pick<GroupAllocation, "group" | "sortOrder">[],
  weights: Record<string, number | undefined>,
) {
  const ordered = [...groups].sort((left, right) => {
    const leftOrder = current[left.group]?.sortOrder ?? left.sortOrder;
    const rightOrder = current[right.group]?.sortOrder ?? right.sortOrder;
    return leftOrder - rightOrder;
  });
  const included = ordered.filter((group) => current[group.group]?.included);
  const includedWeights = included.map((group) => validPercent(weights[group.group]));
  if (!included.length || includedWeights.reduce((sum, weight) => sum + weight, 0) <= 0) return null;

  const percentages = distributeWholePercentages(includedWeights, 0);
  const next = { ...current };

  ordered.forEach((group) => {
    const entry = current[group.group] ?? { percent: 0, included: false, sortOrder: group.sortOrder };
    next[group.group] = entry.included ? { ...entry } : { ...entry, included: false, percent: 0 };
  });
  included.forEach((group, index) => {
    next[group.group] = { ...next[group.group], included: true, percent: percentages[index] };
  });

  return next;
}

export function localIsoDate(date = new Date(), timeZone?: string) {
  const { year, month, day } = calendarParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function currentMonthStart(date = new Date(), timeZone?: string) {
  const { year, month } = calendarParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function monthLabel(monthStart = currentMonthStart(), style: "long" | "short" = "long") {
  const [year, month] = monthStart.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CO", { month: style, year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function currencyFormatter(currencyCode = "COP", compact = false) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: currencyCode === "COP" ? 0 : 2,
    notation: compact ? "compact" : "standard",
  });
}

export function inMonth(transaction: Transaction, monthStart = currentMonthStart()) {
  return transaction.occurredOn.slice(0, 7) === monthStart.slice(0, 7);
}

export function monthTotals(transactions: Transaction[], monthStart = currentMonthStart(), snapshot?: FinanceSnapshot) {
  if (snapshot?.month === monthStart) return { income: snapshot.income, expense: snapshot.expense };
  return transactions.filter((transaction) => inMonth(transaction, monthStart)).reduce(
    (totals, transaction) => {
      if (transaction.kind === "income") totals.income += transactionReportingAmount(transaction);
      if (transaction.kind === "expense") totals.expense += transactionReportingAmount(transaction);
      return totals;
    },
    { income: 0, expense: 0 },
  );
}

export function accountBalance(account: Account, transactions: Transaction[], snapshot?: FinanceSnapshot) {
  if (snapshot && account.id in snapshot.accountBalances) return snapshot.accountBalances[account.id];
  return transactions.filter((transaction) => transaction.accountId === account.id).reduce((balance, transaction) => {
    if (transaction.kind === "income" || transaction.kind === "transfer_in" || transaction.kind === "adjustment_in") return balance + transaction.amount;
    return balance - transaction.amount;
  }, account.initialBalance);
}

/**
 * Returns the account balance in the profile reporting currency. The durable
 * snapshot is authoritative, while this fallback keeps demo/offline data and
 * a just-created USD account correct before the next server refresh.
 */
export function accountBaseBalance(account: Account, transactions: Transaction[], snapshot?: FinanceSnapshot) {
  const snapshotBalance = snapshot?.accountBalancesBase?.[account.id];
  if (snapshotBalance !== undefined) return snapshotBalance;
  const openingRate = account.currencyCode === "USD" ? account.openingExchangeRate ?? 1 : 1;
  return transactions.filter((transaction) => transaction.accountId === account.id).reduce((balance, transaction) => {
    const amount = transaction.baseAmount ?? transaction.amount * (transaction.exchangeRate ?? openingRate);
    if (transaction.kind === "income" || transaction.kind === "transfer_in" || transaction.kind === "adjustment_in") return balance + amount;
    return balance - amount;
  }, account.initialBalance * openingRate);
}

export function categorySpend(transactions: Transaction[], categoryId: string, monthStart = currentMonthStart(), snapshot?: FinanceSnapshot) {
  if (snapshot?.month === monthStart) return snapshot.categorySpending[categoryId] ?? 0;
  return transactions.filter((transaction) => transaction.kind === "expense" && transaction.categoryId === categoryId && inMonth(transaction, monthStart)).reduce((sum, transaction) => sum + transactionReportingAmount(transaction), 0);
}

export function groupBudgetSummary(categories: Category[], budgets: Budget[], transactions: Transaction[], financeGroups: GroupAllocation[], monthStart = currentMonthStart(), snapshot?: FinanceSnapshot) {
  return financeGroups.filter((group) => !group.archived).sort((a, b) => a.sortOrder - b.sortOrder).map((financeGroup) => {
    const group = financeGroup.group;
    const ids = categories.filter((category) => category.group === group).map((category) => category.id);
    const activeIds = categories.filter((category) => category.group === group && !category.archived).map((category) => category.id);
    const budget = budgets.filter((item) => item.month === monthStart && activeIds.includes(item.categoryId)).reduce((sum, item) => sum + item.amount, 0);
    const spent = snapshot?.month === monthStart
      ? ids.reduce((sum, id) => sum + (snapshot.categorySpending[id] ?? 0), 0)
      : transactions.filter((transaction) => transaction.kind === "expense" && transaction.categoryId && ids.includes(transaction.categoryId) && inMonth(transaction, monthStart)).reduce((sum, transaction) => sum + transactionReportingAmount(transaction), 0);
    return { group, name: financeGroup.name, color: financeGroup.color, includedInPlan: financeGroup.includedInPlan, targetPercent: financeGroup.targetPercent, budget, spent, available: budget - spent, percent: budget ? Math.round((spent / budget) * 100) : 0 };
  });
}

export function toCsv(transactions: Transaction[], accounts: Account[], categories: Category[]) {
  const escape = (value: string | number) => {
    const text = String(value);
    const safeText = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replaceAll('"', '""')}"`;
  };
  const rows = transactions.map((transaction) => [
    transaction.occurredOn,
    transaction.kind,
    transaction.description,
    transaction.merchant ?? "",
    categories.find((category) => category.id === transaction.categoryId)?.name ?? "Transferencia",
    accounts.find((account) => account.id === transaction.accountId)?.name ?? "",
    transaction.amount,
    transaction.note ?? "",
  ].map(escape).join(","));
  return ["Fecha,Tipo,Descripción,Comercio,Categoría,Cuenta,Monto,Nota", ...rows].join("\n");
}
