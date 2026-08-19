import type { Account, Budget, Category, FinanceSnapshot, GroupAllocation, Transaction } from "./types";

export type PlanAllocationDraft = Record<string, { percent: number; included: boolean; sortOrder: number }>;

export function normalizePlanAllocationDraft(current: PlanAllocationDraft, groups: Pick<GroupAllocation, "group" | "sortOrder">[], mode: "equal" | "proportional" = "proportional") {
  const currentOrder = [...groups].sort((a, b) => (current[a.group]?.sortOrder ?? a.sortOrder) - (current[b.group]?.sortOrder ?? b.sortOrder));
  const included = currentOrder.filter((group) => current[group.group]?.included);
  if (!included.length) return current;

  const currentTotal = included.reduce((sum, group) => sum + current[group.group].percent, 0);
  const next = { ...current };
  let assigned = 0;

  currentOrder.filter((group) => !current[group.group]?.included).forEach((group) => {
    next[group.group] = { ...current[group.group], included: false, percent: 0 };
  });

  included.forEach((group, index) => {
    const last = index === included.length - 1;
    const raw = mode === "equal" || currentTotal === 0 ? 100 / included.length : (current[group.group].percent / currentTotal) * 100;
    const percent = last ? 100 - assigned : Math.max(0, Math.round(raw));
    assigned += percent;
    next[group.group] = { ...current[group.group], included: true, percent };
  });

  return next;
}

export function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function currentMonthStart(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
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
      if (transaction.kind === "income") totals.income += transaction.amount;
      if (transaction.kind === "expense") totals.expense += transaction.amount;
      return totals;
    },
    { income: 0, expense: 0 },
  );
}

export function accountBalance(account: Account, transactions: Transaction[], snapshot?: FinanceSnapshot) {
  if (snapshot && account.id in snapshot.accountBalances) return snapshot.accountBalances[account.id];
  return transactions.filter((transaction) => transaction.accountId === account.id).reduce((balance, transaction) => {
    if (transaction.kind === "income" || transaction.kind === "transfer_in") return balance + transaction.amount;
    return balance - transaction.amount;
  }, account.initialBalance);
}

export function categorySpend(transactions: Transaction[], categoryId: string, monthStart = currentMonthStart(), snapshot?: FinanceSnapshot) {
  if (snapshot?.month === monthStart) return snapshot.categorySpending[categoryId] ?? 0;
  return transactions.filter((transaction) => transaction.kind === "expense" && transaction.categoryId === categoryId && inMonth(transaction, monthStart)).reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function groupBudgetSummary(categories: Category[], budgets: Budget[], transactions: Transaction[], financeGroups: GroupAllocation[], monthStart = currentMonthStart(), snapshot?: FinanceSnapshot) {
  return financeGroups.filter((group) => !group.archived).sort((a, b) => a.sortOrder - b.sortOrder).map((financeGroup) => {
    const group = financeGroup.group;
    const ids = categories.filter((category) => category.group === group).map((category) => category.id);
    const budget = budgets.filter((item) => item.month === monthStart && ids.includes(item.categoryId)).reduce((sum, item) => sum + item.amount, 0);
    const spent = snapshot?.month === monthStart
      ? ids.reduce((sum, id) => sum + (snapshot.categorySpending[id] ?? 0), 0)
      : transactions.filter((transaction) => transaction.kind === "expense" && transaction.categoryId && ids.includes(transaction.categoryId) && inMonth(transaction, monthStart)).reduce((sum, transaction) => sum + transaction.amount, 0);
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
