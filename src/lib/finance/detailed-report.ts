import type {
  DetailedFinanceReport,
  FinanceReportSummary,
  FinanceState,
  ReportQuery,
  Transaction,
} from "@/lib/finance/types";
import { normalizeReportQuery, reportComparisonRange } from "@/lib/finance/report-query";
import { transactionReportingAmount } from "@/lib/finance/currency";

const DAY = 86_400_000;

function monthOf(date: string) { return date.slice(0, 7); }
function reportAmount(transaction: Transaction) { return transactionReportingAmount(transaction); }
function amountSign(transaction: Transaction) { return transaction.kind === "income" || transaction.kind === "transfer_in" || transaction.kind === "adjustment_in" ? reportAmount(transaction) : -reportAmount(transaction); }
function nativeAmountSign(transaction: Transaction) { return transaction.kind === "income" || transaction.kind === "transfer_in" || transaction.kind === "adjustment_in" ? transaction.amount : -transaction.amount; }

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
  const income = transactions.reduce((sum, item) => sum + (item.kind === "income" ? reportAmount(item) : 0), 0);
  const expense = transactions.reduce((sum, item) => sum + (item.kind === "expense" ? reportAmount(item) : 0), 0);
  return {
    income,
    expense,
    balance: income - expense,
    savingsRate: income > 0 ? ((income - expense) / income) * 100 : 0,
    averageDailyExpense: expense / Math.max(1, days),
    transactionCount: transactions.filter((item) => item.kind !== "transfer_in" && !item.kind.startsWith("adjustment")).length,
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
  const reportingCurrencyCode = state.profile?.currencyCode ?? "COP";
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
    const income = rows.reduce((sum, item) => sum + (item.kind === "income" ? reportAmount(item) : 0), 0);
    const expense = rows.reduce((sum, item) => sum + (item.kind === "expense" ? reportAmount(item) : 0), 0);
    return { period, income, expense, balance: income - expense };
  });

  const groups = state.groupAllocations
    .filter((group) => !query.groupKeys.length || query.groupKeys.includes(group.group))
    .map((group) => {
      const categories = state.categories.filter((category) => category.kind === "expense" && category.group === group.group && (!category.archived || transactions.some((item) => item.categoryId === category.id)))
        .filter((category) => !query.categoryIds.length || query.categoryIds.includes(category.id))
        .map((category) => {
          const rows = transactions.filter((item) => item.kind === "expense" && item.categoryId === category.id);
          const expense = rows.reduce((sum, item) => sum + reportAmount(item), 0);
          const budget = budgetRows.filter((item) => item.categoryId === category.id).reduce((sum, item) => sum + item.amount, 0);
          return { id: category.id, name: category.name, group: category.group, color: category.color, icon: category.icon, expense, budget, variance: budget - expense, usage: budget > 0 ? (expense / budget) * 100 : 0, transactionCount: rows.length };
        });
      const expense = categories.reduce((sum, item) => sum + item.expense, 0);
      const budget = categories.reduce((sum, item) => sum + item.budget, 0);
      return { ...group, archived: Boolean(group.archived), expense, budget, variance: budget - expense, usage: budget > 0 ? (expense / budget) * 100 : 0, transactionCount: categories.reduce((sum, item) => sum + item.transactionCount, 0), categories };
    })
    .filter((group) => !group.archived || group.expense > 0);

  const totalIncome = transactions.reduce((sum, item) => sum + (item.kind === "income" ? reportAmount(item) : 0), 0);
  const incomeTypes = state.categories.filter((category) => category.kind === "income" && (!query.incomeTypeIds.length || query.incomeTypeIds.includes(category.id))).map((category) => {
    const rows = transactions.filter((item) => item.kind === "income" && item.categoryId === category.id);
    const income = rows.reduce((sum, item) => sum + reportAmount(item), 0);
    return { id: category.id, name: category.name, color: category.color, icon: category.icon, income, percent: totalIncome > 0 ? income / totalIncome * 100 : 0, transactionCount: rows.length };
  }).filter((item) => item.income > 0 || !state.categories.find((category) => category.id === item.id)?.archived).sort((a, b) => b.income - a.income);

  const accounts = state.accounts.filter((account) => !query.accountIds.length || query.accountIds.includes(account.id)).map((account) => {
    const entity = account.entityId ? state.accountEntities.find((item) => item.id === account.entityId) : undefined;
    const openingBase = account.initialBalance * (account.openingExchangeRate ?? 1);
    const beforeRows = state.transactions.filter((item) => item.accountId === account.id && item.occurredOn < query.startDate);
    const untilRows = state.transactions.filter((item) => item.accountId === account.id && item.occurredOn <= query.endDate);
    const openingDate = account.openingBalanceDate ?? "0001-01-01";
    const nativeOpeningBalance = beforeRows.reduce((sum, item) => sum + nativeAmountSign(item), openingDate <= query.startDate ? account.initialBalance : 0);
    const nativeClosingBalance = untilRows.reduce((sum, item) => sum + nativeAmountSign(item), openingDate <= query.endDate ? account.initialBalance : 0);
    const reportingOpeningBalance = beforeRows.reduce((sum, item) => sum + amountSign(item), openingDate <= query.startDate ? openingBase : 0);
    const reportingClosingBalance = untilRows.reduce((sum, item) => sum + amountSign(item), openingDate <= query.endDate ? openingBase : 0);
    const rows = transactions.filter((item) => item.accountId === account.id);
    const nativeIncome = rows.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0);
    const nativeExpense = rows.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
    const nativeTransferIn = rows.filter((item) => item.kind === "transfer_in").reduce((sum, item) => sum + item.amount, 0);
    const nativeTransferOut = rows.filter((item) => item.kind === "transfer_out").reduce((sum, item) => sum + item.amount, 0);
    const reportingIncome = rows.filter((item) => item.kind === "income").reduce((sum, item) => sum + reportAmount(item), 0);
    const reportingExpense = rows.filter((item) => item.kind === "expense").reduce((sum, item) => sum + reportAmount(item), 0);
    const reportingTransferIn = rows.filter((item) => item.kind === "transfer_in").reduce((sum, item) => sum + reportAmount(item), 0);
    const reportingTransferOut = rows.filter((item) => item.kind === "transfer_out").reduce((sum, item) => sum + reportAmount(item), 0);
    return {
      id: account.id, name: account.name, type: account.type, color: account.color, icon: account.icon,
      currencyCode: account.currencyCode ?? reportingCurrencyCode,
      entityId: entity?.id, entityName: entity?.name, entityColor: entity?.color, entityIcon: entity?.icon,
      archived: Boolean(account.archived),
      nativeOpeningBalance, nativeClosingBalance, nativeIncome, nativeExpense, nativeTransferIn, nativeTransferOut,
      nativeNetFlow: nativeClosingBalance - nativeOpeningBalance,
      reportingOpeningBalance, reportingClosingBalance, reportingIncome, reportingExpense, reportingTransferIn, reportingTransferOut,
      reportingNetFlow: reportingClosingBalance - reportingOpeningBalance,
    };
  }).filter((item) => !item.archived || item.reportingNetFlow !== 0);
  const entities = reportEntitiesFromAccounts(accounts);

  const merchantMap = new Map<string, { expense: number; transactionCount: number }>();
  for (const item of transactions.filter((candidate) => candidate.kind === "expense")) {
    const name = item.merchant?.trim() || item.description;
    const current = merchantMap.get(name) ?? { expense: 0, transactionCount: 0 };
    merchantMap.set(name, { expense: current.expense + reportAmount(item), transactionCount: current.transactionCount + 1 });
  }
  const merchants = [...merchantMap].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.expense - a.expense).slice(0, 12);
  const weekdays = Array.from({ length: 7 }, (_, index) => {
    const weekday = index + 1;
    const rows = transactions.filter((item) => item.kind === "expense" && ((new Date(`${item.occurredOn}T00:00:00Z`).getUTCDay() || 7) === weekday));
    return { weekday, expense: rows.reduce((sum, item) => sum + reportAmount(item), 0), transactionCount: rows.length };
  });

  return {
    startDate: query.startDate,
    endDate: query.endDate,
    selectedMonths: query.selectedMonths,
    granularity: query.granularity,
    reportingCurrencyCode,
    summary: summaryFor(transactions, budgetTotal, dayCount),
    comparison: comparisonRange ? summaryFor(comparisonTransactions, 0, comparisonDays) : null,
    series,
    groups,
    incomeTypes,
    accounts,
    entities,
    merchants,
    weekdays,
    transactions: transactions.filter((item) => item.kind !== "transfer_in" && !item.kind.startsWith("adjustment")).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt)).slice(0, 100),
    source: "local",
    coverage,
  };
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function numeric(value: unknown) { const number = Number(value ?? 0); return Number.isFinite(number) ? number : 0; }
function flag(value: unknown) { return value === true; }

function reportEntitiesFromAccounts(accounts: DetailedFinanceReport["accounts"]): DetailedFinanceReport["entities"] {
  const groups = new Map<string, DetailedFinanceReport["accounts"]>();
  for (const account of accounts) {
    const key = account.entityId ?? "ungrouped";
    groups.set(key, [...(groups.get(key) ?? []), account]);
  }
  return [...groups].map(([key, items]) => {
    const nativeByCurrency = new Map<string, { openingBalance: number; closingBalance: number; netFlow: number }>();
    for (const account of items) {
      const current = nativeByCurrency.get(account.currencyCode) ?? { openingBalance: 0, closingBalance: 0, netFlow: 0 };
      nativeByCurrency.set(account.currencyCode, {
        openingBalance: current.openingBalance + account.nativeOpeningBalance,
        closingBalance: current.closingBalance + account.nativeClosingBalance,
        netFlow: current.netFlow + account.nativeNetFlow,
      });
    }
    const first = items[0];
    return {
      key,
      id: first.entityId,
      name: first.entityName ?? "Sin entidad",
      color: first.entityColor ?? "#64748b",
      icon: first.entityIcon ?? "wallet-cards",
      accountCount: items.length,
      reportingOpeningBalance: items.reduce((sum, item) => sum + item.reportingOpeningBalance, 0),
      reportingClosingBalance: items.reduce((sum, item) => sum + item.reportingClosingBalance, 0),
      reportingNetFlow: items.reduce((sum, item) => sum + item.reportingNetFlow, 0),
      nativeTotals: [...nativeByCurrency].map(([currencyCode, values]) => ({ currencyCode, ...values })),
    };
  }).sort((a, b) => b.reportingClosingBalance - a.reportingClosingBalance || a.name.localeCompare(b.name, "es"));
}

export function detailedFinanceReportFromRpc(value: unknown): DetailedFinanceReport {
  const payload = record(value);
  const summaryFrom = (input: unknown): FinanceReportSummary => {
    const item = record(input);
    return { income: numeric(item.income), expense: numeric(item.expense), balance: numeric(item.balance), savingsRate: numeric(item.savingsRate), averageDailyExpense: numeric(item.averageDailyExpense), transactionCount: numeric(item.transactionCount), budget: numeric(item.budget), budgetUsage: numeric(item.budgetUsage), budgetVariance: numeric(item.budgetVariance) };
  };
  const transactions = list(payload.transactions).map((input) => {
    const item = record(input);
    const hasNativeAmount = item.native_amount !== undefined;
    return {
      id: text(item.id), kind: text(item.kind) as Transaction["kind"],
      amount: numeric(hasNativeAmount ? item.native_amount : item.amount),
      baseAmount: item.base_amount !== undefined ? numeric(item.base_amount) : hasNativeAmount ? numeric(item.amount) : undefined,
      nativeCurrencyCode: text(item.native_currency_code) || undefined,
      baseCurrencyCode: text(item.base_currency_code) || undefined,
      exchangeRate: item.exchange_rate !== undefined ? numeric(item.exchange_rate) : undefined,
      exchangeRateDate: text(item.exchange_rate_date) || undefined,
      exchangeRateSource: text(item.exchange_rate_source) as Transaction["exchangeRateSource"] || undefined,
      referenceExchangeRate: item.reference_exchange_rate !== undefined ? numeric(item.reference_exchange_rate) : undefined,
      referenceRateSource: text(item.reference_rate_source) as Transaction["referenceRateSource"] || undefined,
      accountId: text(item.account_id), categoryId: text(item.category_id) || undefined,
      transferGroupId: text(item.transfer_group_id) || undefined, description: text(item.description),
      merchant: text(item.merchant) || undefined, note: text(item.note) || undefined, icon: text(item.icon) || undefined,
      occurredOn: text(item.occurred_on), createdAt: text(item.created_at), syncStatus: "synced" as const,
    };
  });
  const accounts = list(payload.accounts).map((input) => {
    const item = record(input);
    const oldOpening = numeric(item.openingBalance);
    const oldClosing = numeric(item.closingBalance);
    const oldIncome = numeric(item.income);
    const oldExpense = numeric(item.expense);
    const oldTransferIn = numeric(item.transferIn);
    const oldTransferOut = numeric(item.transferOut);
    const oldNetFlow = numeric(item.netFlow);
    return {
      id: text(item.id), name: text(item.name), type: text(item.type, "cash") as DetailedFinanceReport["accounts"][number]["type"],
      color: text(item.color, "#64748b"), icon: text(item.icon) || undefined,
      currencyCode: text(item.currencyCode, text(payload.reportingCurrencyCode, "COP")),
      entityId: text(item.entityId) || undefined, entityName: text(item.entityName) || undefined,
      entityColor: text(item.entityColor) || undefined, entityIcon: text(item.entityIcon) || undefined,
      archived: flag(item.archived),
      nativeOpeningBalance: item.nativeOpeningBalance !== undefined ? numeric(item.nativeOpeningBalance) : oldOpening,
      nativeClosingBalance: item.nativeClosingBalance !== undefined ? numeric(item.nativeClosingBalance) : oldClosing,
      nativeIncome: item.nativeIncome !== undefined ? numeric(item.nativeIncome) : oldIncome,
      nativeExpense: item.nativeExpense !== undefined ? numeric(item.nativeExpense) : oldExpense,
      nativeTransferIn: item.nativeTransferIn !== undefined ? numeric(item.nativeTransferIn) : oldTransferIn,
      nativeTransferOut: item.nativeTransferOut !== undefined ? numeric(item.nativeTransferOut) : oldTransferOut,
      nativeNetFlow: item.nativeNetFlow !== undefined ? numeric(item.nativeNetFlow) : oldNetFlow,
      reportingOpeningBalance: item.reportingOpeningBalance !== undefined ? numeric(item.reportingOpeningBalance) : oldOpening,
      reportingClosingBalance: item.reportingClosingBalance !== undefined ? numeric(item.reportingClosingBalance) : oldClosing,
      reportingIncome: item.reportingIncome !== undefined ? numeric(item.reportingIncome) : oldIncome,
      reportingExpense: item.reportingExpense !== undefined ? numeric(item.reportingExpense) : oldExpense,
      reportingTransferIn: item.reportingTransferIn !== undefined ? numeric(item.reportingTransferIn) : oldTransferIn,
      reportingTransferOut: item.reportingTransferOut !== undefined ? numeric(item.reportingTransferOut) : oldTransferOut,
      reportingNetFlow: item.reportingNetFlow !== undefined ? numeric(item.reportingNetFlow) : oldNetFlow,
    };
  });
  const parsedEntities = list(payload.entities).map((input) => {
    const item = record(input);
    return {
      key: text(item.key, text(item.id, "ungrouped")), id: text(item.id) || undefined,
      name: text(item.name, "Sin entidad"), color: text(item.color, "#64748b"), icon: text(item.icon, "wallet-cards"),
      accountCount: numeric(item.accountCount), reportingOpeningBalance: numeric(item.reportingOpeningBalance),
      reportingClosingBalance: numeric(item.reportingClosingBalance), reportingNetFlow: numeric(item.reportingNetFlow),
      nativeTotals: list(item.nativeTotals).map((nativeInput) => { const native = record(nativeInput); return { currencyCode: text(native.currencyCode, "COP"), openingBalance: numeric(native.openingBalance), closingBalance: numeric(native.closingBalance), netFlow: numeric(native.netFlow) }; }),
    };
  });
  return {
    startDate: text(payload.startDate),
    endDate: text(payload.endDate),
    selectedMonths: list(payload.selectedMonths).map((item) => text(item).slice(0, 7)).filter(Boolean),
    granularity: text(payload.granularity, "month") as DetailedFinanceReport["granularity"],
    reportingCurrencyCode: text(payload.reportingCurrencyCode, "COP"),
    summary: summaryFrom(payload.summary),
    comparison: payload.comparison ? summaryFrom(payload.comparison) : null,
    series: list(payload.series).map((input) => { const item = record(input); return { period: text(item.period), income: numeric(item.income), expense: numeric(item.expense), balance: numeric(item.balance) }; }),
    groups: list(payload.groups).map((input) => {
      const item = record(input);
      return { group: text(item.group), name: text(item.name), color: text(item.color, "#64748b"), expense: numeric(item.expense), targetPercent: numeric(item.targetPercent), includedInPlan: flag(item.includedInPlan), archived: flag(item.archived), budget: numeric(item.budget), variance: numeric(item.variance), usage: numeric(item.usage), transactionCount: numeric(item.transactionCount), categories: list(item.categories).map((categoryInput) => { const category = record(categoryInput); return { id: text(category.id), name: text(category.name), group: text(category.group), color: text(category.color, "#64748b"), icon: text(category.icon, "tag"), expense: numeric(category.expense), budget: numeric(category.budget), variance: numeric(category.variance), usage: numeric(category.usage), transactionCount: numeric(category.transactionCount) }; }) };
    }),
    incomeTypes: list(payload.incomeTypes).map((input) => { const item = record(input); return { id: text(item.id), name: text(item.name), color: text(item.color, "#64748b"), icon: text(item.icon, "wallet"), income: numeric(item.income), percent: numeric(item.percent), transactionCount: numeric(item.transactionCount) }; }),
    accounts,
    entities: parsedEntities.length ? parsedEntities : reportEntitiesFromAccounts(accounts),
    merchants: list(payload.merchants).map((input) => { const item = record(input); return { name: text(item.name), expense: numeric(item.expense), transactionCount: numeric(item.transactionCount) }; }),
    weekdays: list(payload.weekdays).map((input) => { const item = record(input); return { weekday: numeric(item.weekday), expense: numeric(item.expense), transactionCount: numeric(item.transactionCount) }; }),
    transactions,
    source: "remote",
    coverage: "complete",
  };
}
