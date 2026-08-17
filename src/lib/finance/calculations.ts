import type { Account, Budget, Category, Transaction } from "./types";

export const MONTH_START = "2026-08-01";
export const MONTH_END = "2026-08-31";

export function inMonth(transaction: Transaction, monthStart = MONTH_START) {
  return transaction.occurredOn.slice(0, 7) === monthStart.slice(0, 7);
}

export function monthTotals(transactions: Transaction[], monthStart = MONTH_START) {
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

export function categorySpend(transactions: Transaction[], categoryId: string, monthStart = MONTH_START) {
  return transactions.filter((transaction) => transaction.kind === "expense" && transaction.categoryId === categoryId && inMonth(transaction, monthStart)).reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function groupBudgetSummary(categories: Category[], budgets: Budget[], transactions: Transaction[], monthStart = MONTH_START) {
  const groups = ["needs", "wants", "savings", "investments", "debts"] as const;
  return groups.map((group) => {
    const ids = categories.filter((category) => category.group === group).map((category) => category.id);
    const budget = budgets.filter((item) => item.month === monthStart && ids.includes(item.categoryId)).reduce((sum, item) => sum + item.amount, 0);
    const spent = transactions.filter((transaction) => transaction.kind === "expense" && transaction.categoryId && ids.includes(transaction.categoryId) && inMonth(transaction, monthStart)).reduce((sum, transaction) => sum + transaction.amount, 0);
    return { group, budget, spent, available: budget - spent, percent: budget ? Math.round((spent / budget) * 100) : 0 };
  });
}

export function toCsv(transactions: Transaction[], accounts: Account[], categories: Category[]) {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
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
