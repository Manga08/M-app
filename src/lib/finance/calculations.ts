import type { Account, Budget, Category, GroupAllocation, Transaction } from "./types";

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

export function monthTotals(transactions: Transaction[], monthStart = currentMonthStart()) {
  return transactions.filter((transaction) => inMonth(transaction, monthStart)).reduce(
    (totals, transaction) => {
      if (transaction.kind === "income") totals.income += transaction.amount;
      if (transaction.kind === "expense") totals.expense += transaction.amount;
      return totals;
    },
    { income: 0, expense: 0 },
  );
}

export function accountBalance(account: Account, transactions: Transaction[]) {
  return transactions.filter((transaction) => transaction.accountId === account.id).reduce((balance, transaction) => {
    if (transaction.kind === "income" || transaction.kind === "transfer_in") return balance + transaction.amount;
    return balance - transaction.amount;
  }, account.initialBalance);
}

export function categorySpend(transactions: Transaction[], categoryId: string, monthStart = currentMonthStart()) {
  return transactions.filter((transaction) => transaction.kind === "expense" && transaction.categoryId === categoryId && inMonth(transaction, monthStart)).reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function groupBudgetSummary(categories: Category[], budgets: Budget[], transactions: Transaction[], financeGroups: GroupAllocation[], monthStart = currentMonthStart()) {
  return financeGroups.filter((group) => !group.archived).sort((a, b) => a.sortOrder - b.sortOrder).map((financeGroup) => {
    const group = financeGroup.group;
    const ids = categories.filter((category) => category.group === group).map((category) => category.id);
    const budget = budgets.filter((item) => item.month === monthStart && ids.includes(item.categoryId)).reduce((sum, item) => sum + item.amount, 0);
    const spent = transactions.filter((transaction) => transaction.kind === "expense" && transaction.categoryId && ids.includes(transaction.categoryId) && inMonth(transaction, monthStart)).reduce((sum, transaction) => sum + transaction.amount, 0);
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
