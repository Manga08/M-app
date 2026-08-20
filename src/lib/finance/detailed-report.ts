import type {
  DetailedFinanceReport,
  FinanceReportSummary,
  FinanceState,
  ReportQuery,
  Transaction,
} from "@/lib/finance/types";
import { normalizeReportQuery, reportComparisonRange } from "@/lib/finance/report-query";

const DAY = 86_400_000;

function monthOf(date: string) { return date.slice(0, 7); }
function amountSign(transaction: Transaction) { return transaction.kind === "income" || transaction.kind === "transfer_in" ? transaction.amount : -transaction.amount; }

export function transactionMatchesReportQuery(transaction: Transaction, state: FinanceState, query: ReportQuery, startDate = query.startDate, endDate = query.endDate) {
  if (transaction.occurredOn < startDate || transaction.occurredOn > endDate) return false;
  if (query.preset === "months" && query.selectedMonths.length && !query.selectedMonths.includes(monthOf(transaction.occurredOn))) return false;
  if (query.kind !== "all" && transaction.kind !== query.kind && !(query.kind === "transfer" && transaction.kind.startsWith("transfer_"))) return false;
  if (query.accountIds.length && !query.accountIds.includes(transaction.accountId)) return false;
  const category = state.categories.find((item) => item.id === transaction.categoryId);
  const hasCategoryFilters = query.groupKeys.length + query.categoryIds.length + query.incomeTypeIds.length > 0;
  if (hasCategoryFilters) {
    const matchesExpense = category?.kind === "expense" && (query.groupKeys.includes(category.group) || query.categoryIds.includes(category.id));
    const matchesIncome = category?.kind === "income" && query.incomeTypeIds.includes(category.id);
    if (!matchesExpense && !matchesIncome) return false;
  }
  if (query.search) {
    const haystack = [transaction.description, transaction.merchant, transaction.note, category?.name].filter(Boolean).join(" ").toLocaleLowerCase("es");
    if (!haystack.includes(query.search.toLocaleLowerCase("es"))) return false;
  }
  return true;
}

function summaryFor(transactions: Transaction[], budget: number, days: number): FinanceReportSummary {
  const income = transactions.reduce((sum, item) => sum + (item.kind === "income" ? item.amount : 0), 0);
  const expense = transactions.reduce((sum, item) => sum + (item.kind === "expense" ? item.amount : 0), 0);
  return {
    income,
    expense,
    balance: income - expense,
    savingsRate: income > 0 ? ((income - expense) / income) * 100 : 0,
    averageDailyExpense: expense / Math.max(1, days),
    transactionCount: transactions.filter((item) => item.kind !== "transfer_in").length,
    budget,
    budgetUsage: budget > 0 ? (expense / budget) * 100 : 0,
    budgetVariance: budget - expense,
  };
}

function bucketStart(value: string, granularity: ReportQuery["granularity"]) {
  const date = new Date(`${value}T00:00:00Z`);
  if (granularity === "month") return `${value.slice(0, 7)}-01`;
  if (granularity === "week") {
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
  }
  return date.toISOString().slice(0, 10);
}

function createBuckets(query: ReportQuery) {
  const first = new Date(`${bucketStart(query.startDate, query.granularity)}T00:00:00Z`);
  const last = new Date(`${bucketStart(query.endDate, query.granularity)}T00:00:00Z`);
  const values: string[] = [];
  for (const cursor = new Date(first); cursor <= last && values.length < 1_900;) {
    values.push(cursor.toISOString().slice(0, 10));
    if (query.granularity === "month") cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + (query.granularity === "week" ? 7 : 1));
  }
  return values;
}

export function buildDetailedFinanceReport(state: FinanceState, input: ReportQuery, coverage: "complete" | "partial"): DetailedFinanceReport {
  const query = normalizeReportQuery(input);
  const transactions = state.transactions.filter((item) => transactionMatchesReportQuery(item, state, query));
  const selectedMonthSet = new Set(query.preset === "months" ? query.selectedMonths : state.budgets.filter((item) => item.month >= `${query.startDate.slice(0, 7)}-01` && item.month <= `${query.endDate.slice(0, 7)}-01`).map((item) => item.month.slice(0, 7)));
  const budgetRows = state.budgets.filter((budget) => {
    const category = state.categories.find((item) => item.id === budget.categoryId);
    return selectedMonthSet.has(budget.month.slice(0, 7))
      && (!query.groupKeys.length || (category && query.groupKeys.includes(category.group)))
      && (!query.categoryIds.length || query.categoryIds.includes(budget.categoryId));
  });
  const budgetTotal = budgetRows.reduce((sum, item) => sum + item.amount, 0);
  const dayCount = Math.round((new Date(`${query.endDate}T00:00:00Z`).getTime() - new Date(`${query.startDate}T00:00:00Z`).getTime()) / DAY) + 1;
  const comparisonRange = reportComparisonRange(query);
  const comparisonTransactions = comparisonRange ? state.transactions.filter((item) => transactionMatchesReportQuery(item, state, query, comparisonRange.startDate, comparisonRange.endDate)) : [];
  const comparisonDays = comparisonRange ? Math.round((new Date(`${comparisonRange.endDate}T00:00:00Z`).getTime() - new Date(`${comparisonRange.startDate}T00:00:00Z`).getTime()) / DAY) + 1 : 0;
  const buckets = createBuckets(query);
  const series = buckets.map((period) => {
    const rows = transactions.filter((item) => bucketStart(item.occurredOn, query.granularity) === period);
    const income = rows.reduce((sum, item) => sum + (item.kind === "income" ? item.amount : 0), 0);
    const expense = rows.reduce((sum, item) => sum + (item.kind === "expense" ? item.amount : 0), 0);
    return { period, income, expense, balance: income - expense };
  });

  const groups = state.groupAllocations
    .filter((group) => !query.groupKeys.length || query.groupKeys.includes(group.group))
    .map((group) => {
      const categories = state.categories.filter((category) => category.kind === "expense" && category.group === group.group && (!category.archived || transactions.some((item) => item.categoryId === category.id)))
        .filter((category) => !query.categoryIds.length || query.categoryIds.includes(category.id))
        .map((category) => {
          const rows = transactions.filter((item) => item.kind === "expense" && item.categoryId === category.id);
          const expense = rows.reduce((sum, item) => sum + item.amount, 0);
          const budget = budgetRows.filter((item) => item.categoryId === category.id).reduce((sum, item) => sum + item.amount, 0);
          return { id: category.id, name: category.name, group: category.group, color: category.color, icon: category.icon, expense, budget, variance: budget - expense, usage: budget > 0 ? (expense / budget) * 100 : 0, transactionCount: rows.length };
        });
      const expense = categories.reduce((sum, item) => sum + item.expense, 0);
      const budget = categories.reduce((sum, item) => sum + item.budget, 0);
      return { ...group, archived: Boolean(group.archived), expense, budget, variance: budget - expense, usage: budget > 0 ? (expense / budget) * 100 : 0, transactionCount: categories.reduce((sum, item) => sum + item.transactionCount, 0), categories };
    })
    .filter((group) => !group.archived || group.expense > 0);

  const totalIncome = transactions.reduce((sum, item) => sum + (item.kind === "income" ? item.amount : 0), 0);
  const incomeTypes = state.categories.filter((category) => category.kind === "income" && (!query.incomeTypeIds.length || query.incomeTypeIds.includes(category.id))).map((category) => {
    const rows = transactions.filter((item) => item.kind === "income" && item.categoryId === category.id);
    const income = rows.reduce((sum, item) => sum + item.amount, 0);
    return { id: category.id, name: category.name, color: category.color, icon: category.icon, income, percent: totalIncome > 0 ? income / totalIncome * 100 : 0, transactionCount: rows.length };
  }).filter((item) => item.income > 0 || !state.categories.find((category) => category.id === item.id)?.archived).sort((a, b) => b.income - a.income);

  const accounts = state.accounts.filter((account) => !query.accountIds.length || query.accountIds.includes(account.id)).map((account) => {
    const before = state.transactions.filter((item) => item.accountId === account.id && item.occurredOn < query.startDate).reduce((sum, item) => sum + amountSign(item), account.initialBalance);
    const untilEnd = state.transactions.filter((item) => item.accountId === account.id && item.occurredOn <= query.endDate).reduce((sum, item) => sum + amountSign(item), account.initialBalance);
    const rows = transactions.filter((item) => item.accountId === account.id);
    const income = rows.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0);
    const expense = rows.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
    const transferIn = rows.filter((item) => item.kind === "transfer_in").reduce((sum, item) => sum + item.amount, 0);
    const transferOut = rows.filter((item) => item.kind === "transfer_out").reduce((sum, item) => sum + item.amount, 0);
    return { id: account.id, name: account.name, type: account.type, color: account.color, icon: account.icon, openingBalance: before, closingBalance: untilEnd, income, expense, transferIn, transferOut, netFlow: income + transferIn - expense - transferOut };
  }).filter((item) => !state.accounts.find((account) => account.id === item.id)?.archived || item.netFlow !== 0);

  const merchantMap = new Map<string, { expense: number; transactionCount: number }>();
  for (const item of transactions.filter((candidate) => candidate.kind === "expense")) {
    const name = item.merchant?.trim() || item.description;
    const current = merchantMap.get(name) ?? { expense: 0, transactionCount: 0 };
    merchantMap.set(name, { expense: current.expense + item.amount, transactionCount: current.transactionCount + 1 });
  }
  const merchants = [...merchantMap].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.expense - a.expense).slice(0, 12);
  const weekdays = Array.from({ length: 7 }, (_, index) => {
    const weekday = index + 1;
    const rows = transactions.filter((item) => item.kind === "expense" && ((new Date(`${item.occurredOn}T00:00:00Z`).getUTCDay() || 7) === weekday));
    return { weekday, expense: rows.reduce((sum, item) => sum + item.amount, 0), transactionCount: rows.length };
  });

  return {
    startDate: query.startDate,
    endDate: query.endDate,
    selectedMonths: query.selectedMonths,
    granularity: query.granularity,
    summary: summaryFor(transactions, budgetTotal, dayCount),
    comparison: comparisonRange ? summaryFor(comparisonTransactions, 0, comparisonDays) : null,
    series,
    groups,
    incomeTypes,
    accounts,
    merchants,
    weekdays,
    transactions: transactions.filter((item) => item.kind !== "transfer_in").sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt)).slice(0, 100),
    source: "local",
    coverage,
  };
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function numeric(value: unknown) { const number = Number(value ?? 0); return Number.isFinite(number) ? number : 0; }
function flag(value: unknown) { return value === true; }

export function detailedFinanceReportFromRpc(value: unknown): DetailedFinanceReport {
  const payload = record(value);
  const summaryFrom = (input: unknown): FinanceReportSummary => {
    const item = record(input);
    return { income: numeric(item.income), expense: numeric(item.expense), balance: numeric(item.balance), savingsRate: numeric(item.savingsRate), averageDailyExpense: numeric(item.averageDailyExpense), transactionCount: numeric(item.transactionCount), budget: numeric(item.budget), budgetUsage: numeric(item.budgetUsage), budgetVariance: numeric(item.budgetVariance) };
  };
  const transactions = list(payload.transactions).map((input) => {
    const item = record(input);
    return { id: text(item.id), kind: text(item.kind) as Transaction["kind"], amount: numeric(item.amount), accountId: text(item.account_id), categoryId: text(item.category_id) || undefined, transferGroupId: text(item.transfer_group_id) || undefined, description: text(item.description), merchant: text(item.merchant) || undefined, note: text(item.note) || undefined, icon: text(item.icon) || undefined, occurredOn: text(item.occurred_on), createdAt: text(item.created_at), syncStatus: "synced" as const };
  });
  return {
    startDate: text(payload.startDate),
    endDate: text(payload.endDate),
    selectedMonths: list(payload.selectedMonths).map((item) => text(item).slice(0, 7)).filter(Boolean),
    granularity: text(payload.granularity, "month") as DetailedFinanceReport["granularity"],
    summary: summaryFrom(payload.summary),
    comparison: payload.comparison ? summaryFrom(payload.comparison) : null,
    series: list(payload.series).map((input) => { const item = record(input); return { period: text(item.period), income: numeric(item.income), expense: numeric(item.expense), balance: numeric(item.balance) }; }),
    groups: list(payload.groups).map((input) => {
      const item = record(input);
      return { group: text(item.group), name: text(item.name), color: text(item.color, "#64748b"), expense: numeric(item.expense), targetPercent: numeric(item.targetPercent), includedInPlan: flag(item.includedInPlan), archived: flag(item.archived), budget: numeric(item.budget), variance: numeric(item.variance), usage: numeric(item.usage), transactionCount: numeric(item.transactionCount), categories: list(item.categories).map((categoryInput) => { const category = record(categoryInput); return { id: text(category.id), name: text(category.name), group: text(category.group), color: text(category.color, "#64748b"), icon: text(category.icon, "tag"), expense: numeric(category.expense), budget: numeric(category.budget), variance: numeric(category.variance), usage: numeric(category.usage), transactionCount: numeric(category.transactionCount) }; }) };
    }),
    incomeTypes: list(payload.incomeTypes).map((input) => { const item = record(input); return { id: text(item.id), name: text(item.name), color: text(item.color, "#64748b"), icon: text(item.icon, "wallet"), income: numeric(item.income), percent: numeric(item.percent), transactionCount: numeric(item.transactionCount) }; }),
    accounts: list(payload.accounts).map((input) => { const item = record(input); return { id: text(item.id), name: text(item.name), type: text(item.type, "cash") as DetailedFinanceReport["accounts"][number]["type"], color: text(item.color, "#64748b"), icon: text(item.icon) || undefined, openingBalance: numeric(item.openingBalance), closingBalance: numeric(item.closingBalance), income: numeric(item.income), expense: numeric(item.expense), transferIn: numeric(item.transferIn), transferOut: numeric(item.transferOut), netFlow: numeric(item.netFlow) }; }),
    merchants: list(payload.merchants).map((input) => { const item = record(input); return { name: text(item.name), expense: numeric(item.expense), transactionCount: numeric(item.transactionCount) }; }),
    weekdays: list(payload.weekdays).map((input) => { const item = record(input); return { weekday: numeric(item.weekday), expense: numeric(item.expense), transactionCount: numeric(item.transactionCount) }; }),
    transactions,
    source: "remote",
    coverage: "complete",
  };
}
