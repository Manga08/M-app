"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useTheme } from "next-themes";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { demoFinanceState } from "@/lib/finance/demo-data";
import { accountBalance, currentMonthStart } from "@/lib/finance/calculations";
import type {
  Account,
  AccountUpdateInput,
  ArchiveFinanceGroupInput,
  Budget,
  BudgetPlanSource,
  Category,
  CategoryInput,
  CategoryOrderWrite,
  DetailedFinanceReport,
  FinanceReport,
  FinanceReportGroup,
  FinanceReportMonth,
  FinanceGroupInput,
  FinancialTarget,
  FinancialTargetDebtDetails,
  FinancialTargetEntry,
  FinancialTargetEntryInput,
  FinancialTargetInput,
  FinancialTargetStatus,
  FinanceSnapshot,
  FinanceState,
  GroupAllocation,
  GroupAllocationWrite,
  IncomeTypeInput,
  MonthlyBudgetPlan,
  MonthlyBudgetPlanData,
  MonthlyBudgetPlanInput,
  PlanSimulationSeed,
  PlannerImportMutationInput,
  ProfileInput,
  QueueItem,
  RecurringRule,
  RecurringRuleInput,
  ReportQuery,
  Transaction,
  TransactionCursor,
  TransactionInput,
  TransactionListFilter,
  TransactionPage,
} from "@/lib/finance/types";
import { projectedOccurrences, validateRecurringRule } from "@/lib/finance/recurrence";
import { archiveIncomeTypeInCategories, upsertIncomeTypeInCategories } from "@/lib/finance/income-types";
import {
  localMutationResult,
  mutationFailure,
  queuedMutationResult,
  syncedMutationResult,
  type FinanceMutationResult,
} from "@/lib/finance/mutation-result";
import { transactionDateBounds, transactionIsInDateRange, transactionMonthBounds, type TransactionDateBounds } from "@/lib/finance/transaction-query";
import { applyPendingTransactionQueue, pendingTransactionReferences } from "@/lib/finance/pending-transactions";
import { localReportCoverage } from "@/lib/finance/report-coverage";
import { buildDetailedFinanceReport, detailedFinanceReportFromRpc, transactionMatchesReportQuery } from "@/lib/finance/detailed-report";
import { normalizeReportQuery, reportComparisonRange } from "@/lib/finance/report-query";
import { assertFinanceAmount, assertOptionalText, cleanRequiredText } from "@/lib/finance/validation";
import { activateLocalFinanceData, applyLocalFinanceResetGeneration, readLocalRevision, readLocalState, readQueue, removeQueueItem, resumeLocalFinanceData, suspendLocalFinanceData, updateLocalState, updateQueueItem, withBrowserLock, writeLocalMutation, writeLocalState } from "@/lib/offline-db";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { applyCustomThemeToElement, DEFAULT_CUSTOM_THEME_COLOR, normalizeHexColor } from "@/lib/custom-theme";
import { AppStartupScreen } from "@/components/app-startup-screen";
import { executeFinanceQueueItem } from "@/lib/finance/remote-mutations";
import { financialTargetEntryFromRow, isoDateOffset, loadRemoteFinanceState, recurringOccurrenceFromRow, recurringRuleFromRow, transactionFromRow, type FinancialTargetEntryRow, type RecurringOccurrenceRow, type RecurringRuleRow, type TransactionPageRowResult, type TransactionRow } from "@/lib/finance/remote-state";

export type FinanceDataStatus = "loading" | "ready" | "unavailable";
export type FinanceDataSource = "demo" | "local" | "remote" | null;
export type FinanceSyncResult = {
  status: "synced" | "pending" | "offline" | "local";
  pendingCount: number;
  error?: string;
};
export type FinanceSyncOptions = { flushOnly?: boolean };

export type TransactionQueryOptions = {
  limit?: number;
  cursor?: TransactionCursor | null;
  filter?: TransactionListFilter;
  query?: string;
  /** Primer día del mes en formato YYYY-MM-01. */
  monthStart?: string;
  /** Límites inclusivos en formato YYYY-MM-DD. Tienen prioridad sobre monthStart. */
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
  categoryId?: string;
};

export type FinanceMutationApi = {
  addTransaction: (input: TransactionInput) => Promise<FinanceMutationResult>;
  importTransactions: (inputs: TransactionInput[]) => Promise<FinanceMutationResult>;
  importPlanner: (input: PlannerImportMutationInput) => Promise<FinanceMutationResult>;
  updateTransaction: (id: string, input: TransactionInput) => Promise<FinanceMutationResult>;
  deleteTransaction: (id: string, transferGroupId?: string, knownRows?: Transaction[]) => Promise<FinanceMutationResult>;
  upsertRecurringRule: (input: RecurringRuleInput) => Promise<FinanceMutationResult>;
  archiveRecurringRule: (id: string) => Promise<FinanceMutationResult>;
  updateRecurringOccurrence: (id: string, status: "planned" | "skipped" | "cancelled") => Promise<FinanceMutationResult>;
  upsertFinancialTarget: (input: FinancialTargetInput) => Promise<FinanceMutationResult>;
  setFinancialTargetStatus: (id: string, status: FinancialTargetStatus) => Promise<FinanceMutationResult>;
  upsertFinancialTargetEntry: (input: FinancialTargetEntryInput) => Promise<FinanceMutationResult>;
  deleteFinancialTargetEntry: (id: string) => Promise<FinanceMutationResult>;
  addAccount: (account: Omit<Account, "id">) => Promise<FinanceMutationResult>;
  updateAccount: (input: AccountUpdateInput) => Promise<FinanceMutationResult>;
  addCategory: (category: Omit<Category, "id">) => Promise<FinanceMutationResult>;
  importCategories: (categories: CategoryInput[]) => Promise<FinanceMutationResult>;
  importIncomeTypes: (incomeTypes: IncomeTypeInput[]) => Promise<FinanceMutationResult>;
  upsertCategory: (category: CategoryInput) => Promise<FinanceMutationResult>;
  archiveCategory: (id: string) => Promise<FinanceMutationResult>;
  upsertIncomeType: (incomeType: IncomeTypeInput) => Promise<FinanceMutationResult>;
  archiveIncomeType: (id: string) => Promise<FinanceMutationResult>;
  upsertFinanceGroup: (group: FinanceGroupInput) => Promise<FinanceMutationResult>;
  archiveFinanceGroup: (input: ArchiveFinanceGroupInput) => Promise<FinanceMutationResult>;
  updateBudget: (categoryId: string, amount: number) => Promise<FinanceMutationResult>;
  setMonthlyBudgetPlan: (input: MonthlyBudgetPlanInput) => Promise<FinanceMutationResult>;
  updateCategoryOrder: (groupKey: string, positions: CategoryOrderWrite[]) => Promise<FinanceMutationResult>;
  updateProfile: (profile: ProfileInput) => Promise<FinanceMutationResult>;
  updateGroupAllocations: (allocations: GroupAllocationWrite[]) => Promise<FinanceMutationResult>;
};

type FinanceContextValue = FinanceState & {
  hydrated: boolean;
  dataStatus: FinanceDataStatus;
  dataSource: FinanceDataSource;
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  syncError: string | null;
  currentMonth: string;
  /** API tipada: distingue sincronizado, guardado solo local y en cola. */
  mutate: FinanceMutationApi;
  /** Compatibilidad temporal; usa mutate.* cuando la UI necesite comunicar el estado exacto. */
  addTransaction: (input: TransactionInput) => Promise<void>;
  updateTransaction: (id: string, input: TransactionInput) => Promise<void>;
  deleteTransaction: (id: string, transferGroupId?: string, knownRows?: Transaction[]) => Promise<void>;
  addAccount: (account: Omit<Account, "id">) => Promise<void>;
  updateAccount: (input: AccountUpdateInput) => Promise<void>;
  addCategory: (category: Omit<Category, "id">) => Promise<void>;
  upsertCategory: (category: CategoryInput) => Promise<void>;
  archiveCategory: (id: string) => Promise<void>;
  upsertIncomeType: (incomeType: IncomeTypeInput) => Promise<void>;
  archiveIncomeType: (id: string) => Promise<void>;
  upsertFinanceGroup: (group: FinanceGroupInput) => Promise<void>;
  archiveFinanceGroup: (input: ArchiveFinanceGroupInput) => Promise<void>;
  updateBudget: (categoryId: string, amount: number) => Promise<void>;
  setMonthlyBudgetPlan: (input: MonthlyBudgetPlanInput) => Promise<void>;
  updateCategoryOrder: (groupKey: string, positions: CategoryOrderWrite[]) => Promise<void>;
  updateProfile: (profile: ProfileInput) => Promise<void>;
  updateGroupAllocations: (allocations: GroupAllocationWrite[]) => Promise<void>;
  listTransactions: (options?: TransactionQueryOptions) => Promise<TransactionPage>;
  exportTransactions: (options?: Omit<TransactionQueryOptions, "limit" | "cursor">) => Promise<Transaction[]>;
  getFinanceReport: (endMonth?: string, months?: number) => Promise<FinanceReport>;
  getDetailedFinanceReport: (query: ReportQuery) => Promise<DetailedFinanceReport>;
  exportReportTransactions: (query: ReportQuery) => Promise<Transaction[]>;
  getMonthlyBudgetPlan: (month: string) => Promise<MonthlyBudgetPlanData>;
  getPlanSimulationSeed: (month: string) => Promise<PlanSimulationSeed>;
  loadFinancialTargetEntries: (targetId: string) => Promise<FinancialTargetEntry[]>;
  uploadFinancialTargetCover: (targetId: string, file: File) => Promise<string>;
  getFinancialTargetCoverUrl: (path: string) => Promise<string | null>;
  syncNow: (options?: FinanceSyncOptions) => Promise<FinanceSyncResult>;
  prepareSignOut: () => Promise<number>;
  cancelPreparedSignOut: () => Promise<void>;
  completeSignOut: () => void;
};

export type FinanceIdentity = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
};

const FinanceContext = createContext<FinanceContextValue | null>(null);
type FinanceSupabaseClient = SupabaseClient<Database>;

const emptyFinanceState: FinanceState = {
  profile: null,
  accounts: [],
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
  groupAllocations: [],
};

type ReportRow = {
  startMonth: string;
  endMonth: string;
  months: Array<{ month: string; income: number | string; expense: number | string; balance: number | string }>;
  groups: Array<{ group: string; name: string; color: string; expense: number | string; targetPercent: number | string; includedInPlan: boolean; archived: boolean }>;
};
type TransactionPayload = { transactions: Transaction[]; input: TransactionInput };
type TransactionImportPayload = { transactions: Transaction[] };
type PlannerImportQueuePayload = Omit<PlannerImportMutationInput, "transactions"> & { transactions: Transaction[] };

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  return Array.from(new Map(items.map((item) => [key(item), item])).values());
}

function normalizeFinanceState(state: FinanceState): FinanceState {
  return {
    ...state,
    profile: state.profile ? {
      ...state.profile,
      customThemeColor: normalizeHexColor(state.profile.customThemeColor) ?? DEFAULT_CUSTOM_THEME_COLOR,
    } : null,
    categories: (state.categories ?? []).map((category, index) => ({ ...category, sortOrder: category.sortOrder ?? index })),
    budgets: state.budgets ?? [],
    recurringRules: state.recurringRules ?? [],
    recurringOccurrences: state.recurringOccurrences ?? [],
    financialTargets: uniqueBy(state.financialTargets ?? [], (target) => target.id),
    financialTargetEntries: uniqueBy(state.financialTargetEntries ?? [], (entry) => entry.id),
    financialTargetDebts: uniqueBy(state.financialTargetDebts ?? [], (debt) => debt.targetId),
    monthlyBudgetPlans: state.monthlyBudgetPlans ?? [],
    budgetMonthsLoaded: state.budgetMonthsLoaded ?? [],
    groupAllocations: state.groupAllocations ?? [],
  };
}

function uid() {
  return crypto.randomUUID();
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "No fue posible sincronizar este cambio.";
}

function adjustedSnapshot(snapshot: FinanceSnapshot | undefined, transactions: Transaction[], direction: 1 | -1) {
  if (!snapshot) return snapshot;
  const startingBaseBalances = snapshot.accountBalancesBase ?? snapshot.accountBalances;
  const next: FinanceSnapshot = {
    ...snapshot,
    accountBalances: { ...snapshot.accountBalances },
    accountBalancesBase: { ...startingBaseBalances },
    netWorth: snapshot.netWorth ?? Object.values(startingBaseBalances).reduce((sum, value) => sum + value, 0),
    categorySpending: { ...snapshot.categorySpending },
  };
  for (const transaction of transactions) {
    const accountDirection = transaction.kind === "income" || transaction.kind === "transfer_in" || transaction.kind === "adjustment_in" ? 1 : -1;
    next.accountBalances[transaction.accountId] = (next.accountBalances[transaction.accountId] ?? 0) + direction * accountDirection * transaction.amount;
    const baseDelta = direction * accountDirection * (transaction.baseAmount ?? transaction.amount);
    next.accountBalancesBase![transaction.accountId] = (next.accountBalancesBase![transaction.accountId] ?? 0) + baseDelta;
    next.netWorth = (next.netWorth ?? 0) + baseDelta;
    if (transaction.occurredOn.slice(0, 7) !== snapshot.month.slice(0, 7)) continue;
    if (transaction.kind === "income") next.income += direction * (transaction.baseAmount ?? transaction.amount);
    if (transaction.kind === "expense") {
      next.expense += direction * (transaction.baseAmount ?? transaction.amount);
      if (transaction.categoryId) next.categorySpending[transaction.categoryId] = Math.max(0, (next.categorySpending[transaction.categoryId] ?? 0) + direction * (transaction.baseAmount ?? transaction.amount));
    }
  }
  return next;
}

function mergeTransactions(current: Transaction[], incoming: Transaction[]) {
  const byId = new Map(current.map((transaction) => [transaction.id, transaction]));
  for (const transaction of incoming) {
    const existing = byId.get(transaction.id);
    if (!existing || existing.syncStatus !== "pending") byId.set(transaction.id, transaction);
  }
  return [...byId.values()].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

function transactionMatches(transaction: Transaction, categories: Category[], filter: TransactionListFilter, query: string) {
  if (transaction.kind === "transfer_in" || transaction.kind.startsWith("adjustment")) return false;
  if (filter === "expense" && transaction.kind !== "expense") return false;
  if (filter === "income" && transaction.kind !== "income") return false;
  if (filter === "transfer" && transaction.kind !== "transfer_out") return false;
  const clean = query.trim().toLocaleLowerCase("es");
  if (!clean) return true;
  const category = categories.find((item) => item.id === transaction.categoryId)?.name ?? "";
  return [transaction.description, transaction.merchant, transaction.note, category]
    .filter(Boolean)
    .some((value) => value!.toLocaleLowerCase("es").includes(clean));
}

function isAfterCursor(transaction: Transaction, cursor?: TransactionCursor | null) {
  if (!cursor) return true;
  const transactionKey = `${transaction.occurredOn}|${transaction.createdAt}|${transaction.id}`;
  const cursorKey = `${cursor.occurredOn}|${cursor.createdAt}|${cursor.id}`;
  return transactionKey < cursorKey;
}

function transactionMatchesScope(transaction: Transaction, state: FinanceState, accountId?: string, categoryId?: string) {
  if (categoryId && transaction.categoryId !== categoryId) return false;
  if (!accountId || transaction.accountId === accountId) return true;
  return transaction.kind === "transfer_out" && Boolean(transaction.transferGroupId)
    && state.transactions.some((pair) => pair.transferGroupId === transaction.transferGroupId && pair.kind === "transfer_in" && pair.accountId === accountId);
}

function adjustedTargetProgress(targets: FinancialTarget[], movements: Array<Pick<Transaction, "financialTargetId" | "financialTargetEffect" | "amount" | "baseAmount">>, direction: 1 | -1) {
  const deltas = new Map<string, number>();
  for (const movement of movements) {
    if (!movement.financialTargetId || !movement.financialTargetEffect) continue;
    const reportAmount = movement.baseAmount ?? movement.amount;
    const signed = movement.financialTargetEffect === "advance" ? reportAmount : -reportAmount;
    deltas.set(movement.financialTargetId, (deltas.get(movement.financialTargetId) ?? 0) + signed * direction);
  }
  if (!deltas.size) return targets;
  return targets.map((target) => {
    const delta = deltas.get(target.id);
    if (delta === undefined || target.progressAmount === undefined) return target;
    return { ...target, progressAmount: target.progressAmount + delta };
  });
}

function localTransactionPage(state: FinanceState, options: { limit: number; cursor?: TransactionCursor | null; filter: TransactionListFilter; query: string; period: TransactionDateBounds | null; accountId?: string; categoryId?: string }): TransactionPage {
  const candidates = state.transactions
    .filter((transaction) => transactionMatches(transaction, state.categories, options.filter, options.query))
    .filter((transaction) => transactionIsInDateRange(transaction, options.period))
    .filter((transaction) => transactionMatchesScope(transaction, state, options.accountId, options.categoryId))
    .filter((transaction) => isAfterCursor(transaction, options.cursor))
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const items = candidates.slice(0, options.limit);
  const transferGroups = new Set(items.map((item) => item.transferGroupId).filter(Boolean));
  const related = state.transactions.filter((transaction) => transaction.kind === "transfer_in" && transaction.transferGroupId && transferGroups.has(transaction.transferGroupId));
  const last = items.at(-1);
  return {
    items,
    related,
    hasMore: candidates.length > options.limit,
    nextCursor: last ? { occurredOn: last.occurredOn, createdAt: last.createdAt, id: last.id } : null,
    source: "local",
  };
}

function fallbackReport(state: FinanceState, endMonth: string, monthCount: number, coverage: FinanceReport["coverage"]): FinanceReport {
  const [endYear, endMonthNumber] = endMonth.split("-").map(Number);
  const monthKeys = Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(Date.UTC(endYear, endMonthNumber - monthCount + index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
  });
  const months: FinanceReportMonth[] = monthKeys.map((month) => {
    const totals = state.transactions.filter((transaction) => transaction.occurredOn.slice(0, 7) === month.slice(0, 7)).reduce((sum, transaction) => {
      if (transaction.kind === "income") sum.income += transaction.baseAmount ?? transaction.amount;
      if (transaction.kind === "expense") sum.expense += transaction.baseAmount ?? transaction.amount;
      return sum;
    }, { income: 0, expense: 0 });
    if (state.snapshot?.month === month) {
      totals.income = state.snapshot.income;
      totals.expense = state.snapshot.expense;
    }
    return { month, ...totals, balance: totals.income - totals.expense };
  });
  const firstMonth = monthKeys[0];
  const nextMonthDate = new Date(Date.UTC(endYear, endMonthNumber, 1));
  const nextMonth = `${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const groups: FinanceReportGroup[] = state.groupAllocations.map((group) => {
    const ids = new Set(state.categories.filter((category) => category.group === group.group).map((category) => category.id));
    const expense = state.transactions.filter((transaction) => transaction.kind === "expense" && transaction.categoryId && ids.has(transaction.categoryId) && transaction.occurredOn >= firstMonth && transaction.occurredOn < nextMonth).reduce((sum, transaction) => sum + (transaction.baseAmount ?? transaction.amount), 0);
    return { group: group.group, name: group.name, color: group.color, expense, targetPercent: group.targetPercent, includedInPlan: group.includedInPlan, archived: Boolean(group.archived) };
  }).filter((group) => !group.archived || group.expense > 0);
  return { startMonth: firstMonth, endMonth, months, groups, source: "local", coverage };
}

async function fetchRemoteTransactionsForPending(client: FinanceSupabaseClient, items: QueueItem[]) {
  const { ids, transferGroupIds } = pendingTransactionReferences(items);
  const columns = "id,kind,amount,account_id,category_id,transfer_group_id,recurring_occurrence_id,financial_target_id,financial_target_effect,description,merchant,note,icon,occurred_on,created_at,ledger_event_id,native_currency_code,base_currency_code,base_amount,exchange_rate,exchange_rate_date,exchange_rate_source,version";
  const fetchChunks = async (field: "id" | "transfer_group_id", values: string[]) => {
    const rows: TransactionRow[] = [];
    for (let index = 0; index < values.length; index += 100) {
      const { data, error } = await client.from("transactions").select(columns).in(field, values.slice(index, index + 100));
      if (error) throw error;
      rows.push(...((data ?? []) as unknown as TransactionRow[]));
    }
    return rows;
  };
  const [byId, byGroup] = await Promise.all([fetchChunks("id", ids), fetchChunks("transfer_group_id", transferGroupIds)]);
  const rows = [...byId, ...byGroup];
  return [...new Map(rows.map((row) => [row.id, transactionFromRow(row)])).values()];
}

function overlayPendingTransactionsOnReport(base: FinanceReport, state: FinanceState, remoteAffected: Transaction[], pendingItems: QueueItem[]) {
  const finalAffected = applyPendingTransactionQueue(remoteAffected, pendingItems);
  const months = base.months.map((month) => ({ ...month }));
  const monthByKey = new Map(months.map((month) => [month.month, month]));
  const groups = base.groups.map((group) => ({ ...group }));
  const groupByKey = new Map(groups.map((group) => [group.group, group]));

  const apply = (transaction: Transaction, direction: 1 | -1) => {
    const reportAmount = transaction.baseAmount ?? transaction.amount;
    const month = monthByKey.get(`${transaction.occurredOn.slice(0, 7)}-01`);
    if (month) {
      if (transaction.kind === "income") month.income += reportAmount * direction;
      if (transaction.kind === "expense") month.expense += reportAmount * direction;
      month.balance = month.income - month.expense;
    }
    if (!month) return;
    if (transaction.kind !== "expense" || !transaction.categoryId) return;
    const groupKey = state.categories.find((category) => category.id === transaction.categoryId)?.group;
    if (!groupKey) return;
    let group = groupByKey.get(groupKey);
    if (!group) {
      const allocation = state.groupAllocations.find((candidate) => candidate.group === groupKey);
      if (!allocation) return;
      group = { group: groupKey, name: allocation.name, color: allocation.color, expense: 0, targetPercent: allocation.targetPercent, includedInPlan: allocation.includedInPlan, archived: Boolean(allocation.archived) };
      groups.push(group);
      groupByKey.set(groupKey, group);
    }
    group.expense += reportAmount * direction;
  };

  remoteAffected.forEach((transaction) => apply(transaction, -1));
  finalAffected.forEach((transaction) => apply(transaction, 1));
  return { ...base, months, groups: groups.filter((group) => !group.archived || group.expense > 0), source: "local" as const };
}

function localMonthlyBudgetPlan(state: FinanceState, month: string, coverage: MonthlyBudgetPlanData["coverage"]): MonthlyBudgetPlanData {
  return {
    plan: state.monthlyBudgetPlans.find((plan) => plan.month === month) ?? null,
    budgets: state.budgets.filter((budget) => budget.month === month),
    coverage,
    source: "local",
  };
}

function localPlanSimulationSeed(state: FinanceState, month: string, coverage: PlanSimulationSeed["coverage"]): PlanSimulationSeed {
  const isSnapshotMonth = state.snapshot?.month === month;
  const monthTransactions = state.transactions.filter((transaction) => transaction.occurredOn.slice(0, 7) === month.slice(0, 7));
  const actualIncome = isSnapshotMonth
    ? state.snapshot!.income
    : monthTransactions.filter((transaction) => transaction.kind === "income").reduce((sum, transaction) => sum + (transaction.baseAmount ?? transaction.amount), 0);
  const spending = isSnapshotMonth
    ? state.snapshot!.categorySpending
    : monthTransactions.reduce<Record<string, number>>((totals, transaction) => {
      if (transaction.kind === "expense" && transaction.categoryId) totals[transaction.categoryId] = (totals[transaction.categoryId] ?? 0) + (transaction.baseAmount ?? transaction.amount);
      return totals;
    }, {});
  const budgets = new Map(state.budgets.filter((budget) => budget.month === month).map((budget) => [budget.categoryId, budget.amount]));
  const plan = state.monthlyBudgetPlans.find((candidate) => candidate.month === month);
  return {
    month,
    incomeTarget: plan?.incomeTarget ?? actualIncome,
    actualIncome,
    mainCategories: state.groupAllocations.map((allocation) => ({ ...allocation })),
    categories: state.categories
      .filter((category) => category.kind === "expense")
      .map((category) => ({
        id: category.id,
        name: category.name,
        group: category.group,
        color: category.color,
        icon: category.icon,
        sortOrder: category.sortOrder ?? 0,
        archived: category.archived,
        budget: budgets.get(category.id) ?? 0,
        spent: spending[category.id] ?? 0,
      })),
    source: "local",
    coverage,
  };
}

async function withCrossTabLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  return withBrowserLock(name, task);
}

type SessionControlEvent = "closing" | "resume" | "signed-out";

function broadcastSessionControl(userId: string | null, type: SessionControlEvent) {
  if (!userId || userId === "demo" || typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel("moneva-finance-session");
  channel.postMessage({ type, userId });
  channel.close();
}

function broadcastFinanceChange(userId: string) {
  if (userId === "demo" || typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel("moneva-finance-data");
  channel.postMessage({ userId });
  channel.close();
}

async function flushQueue(client: FinanceSupabaseClient, userId: string) {
  return withCrossTabLock(`moneva:queue:${userId}`, async () => {
    const items = await readQueue(userId);
    let lastError: string | null = null;
    let failedItemId: string | null = null;
    for (const item of items) {
      try {
        await executeFinanceQueueItem(client, userId, item);
        await removeQueueItem(userId, item.id);
      } catch (error) {
        lastError = errorMessage(error);
        failedItemId = item.id;
        await updateQueueItem({ ...item, attempts: (item.attempts ?? 0) + 1, lastError, userId });
        // Preserve causality: a later edit must never overtake the change that failed.
        break;
      }
    }
    const pendingItems = await readQueue(userId);
    return { pending: pendingItems.length, pendingItems, pendingIds: new Set(pendingItems.map((item) => item.id)), error: lastError, failedItemId };
  });
}

function isTransactionQueueItem(item: QueueItem) {
  return item.operation.startsWith("transaction.") || item.operation === "planner.import";
}

async function remoteTransactionPage(client: FinanceSupabaseClient, options: { limit: number; cursor: TransactionCursor | null; filter: TransactionListFilter; query: string; period: TransactionDateBounds | null; accountId?: string; categoryId?: string }): Promise<TransactionPage> {
  const { data, error } = await client.rpc("get_transactions_page", {
    p_limit: options.limit,
    p_cursor_occurred_on: options.cursor?.occurredOn,
    p_cursor_created_at: options.cursor?.createdAt,
    p_cursor_id: options.cursor?.id,
    p_kind: options.filter,
    p_query: options.query,
    p_start_date: options.period?.start,
    p_end_date: options.period?.end,
    p_account_id: options.accountId || undefined,
    p_category_id: options.categoryId || undefined,
  });
  if (error) throw error;
  const payload = (data ?? {}) as TransactionPageRowResult;
  const pageRows = payload.items ?? [];
  const items = pageRows.map(transactionFromRow).filter((transaction) => !transaction.kind.startsWith("adjustment"));
  const related = pageRows.flatMap((row) => row.transfer_pair ? [transactionFromRow(row.transfer_pair)] : []);
  return {
    items,
    related,
    hasMore: Boolean(payload.hasMore),
    nextCursor: payload.nextCursor ?? null,
    source: "remote",
  };
}

export function FinanceProvider({ children, initialIdentity }: { children: React.ReactNode; initialIdentity?: FinanceIdentity }) {
  const { setTheme } = useTheme();
  const [state, setState] = useState<FinanceState>(emptyFinanceState);
  const [dataStatus, setDataStatus] = useState<FinanceDataStatus>("loading");
  const [startupGateVisible, setStartupGateVisible] = useState(true);
  const [dataSource, setDataSource] = useState<FinanceDataSource>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingTransactionCount, setPendingTransactionCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const stateRef = useRef(state);
  const mutationRevision = useRef(0);
  const localWriteChain = useRef<Promise<void>>(Promise.resolve());
  const remoteTaskChain = useRef<Promise<void>>(Promise.resolve());
  const activeRemoteTasks = useRef(0);
  const activeSync = useRef<Promise<FinanceSyncResult> | null>(null);
  const lastQueueTimestamp = useRef(0);
  const wasOnline = useRef(true);
  const closingSession = useRef(false);
  const hydrated = dataStatus === "ready";
  const online = useSyncExternalStore(
    (callback) => {
      window.addEventListener("online", callback);
      window.addEventListener("offline", callback);
      return () => {
        window.removeEventListener("online", callback);
        window.removeEventListener("offline", callback);
      };
    },
    () => navigator.onLine,
    () => true,
  );

  const replaceState = useCallback((next: FinanceState) => {
    const normalized = normalizeFinanceState(next);
    stateRef.current = normalized;
    setState(normalized);
  }, []);

  useEffect(() => {
    closingSession.current = false;
    if (!userId || userId === "demo" || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("moneva-finance-session");
    channel.onmessage = (event: MessageEvent<{ type?: string; userId?: string }>) => {
      if (event.data.userId !== userId) return;
      if (event.data.type === "closing") {
        closingSession.current = true;
        setStartupGateVisible(true);
        setDataStatus("loading");
      }
      if (event.data.type === "resume") {
        closingSession.current = false;
        if (stateRef.current.profile) setDataStatus("ready");
      }
      if (event.data.type === "signed-out") {
        closingSession.current = true;
        replaceState(emptyFinanceState);
        setDataSource(null);
        setStartupGateVisible(true);
        setDataStatus("loading");
        window.location.replace("/login");
      }
    };
    return () => channel.close();
  }, [replaceState, userId]);

  const applyPendingItems = useCallback((items: QueueItem[]) => {
    setPendingCount(items.length);
    setPendingTransactionCount(items.filter(isTransactionQueueItem).length);
  }, []);

  const refreshFromDurable = useCallback(async (id: string) => withCrossTabLock(`moneva:finance:${id}`, async () => {
    const [local, queue] = await Promise.all([readLocalState(id), readQueue(id)]);
    if (local?.profile?.id === id) replaceState(local);
    applyPendingItems(queue);
    return { local, queue };
  }), [applyPendingItems, replaceState]);

  useEffect(() => {
    if (!userId || userId === "demo" || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("moneva-finance-data");
    channel.onmessage = (event: MessageEvent<{ userId?: string }>) => {
      if (event.data.userId !== userId || closingSession.current) return;
      const refresh = localWriteChain.current.then(() => refreshFromDurable(userId));
      localWriteChain.current = refresh.then(() => undefined, () => undefined);
      void refresh.catch((error) => setSyncError(errorMessage(error)));
    };
    return () => channel.close();
  }, [refreshFromDurable, userId]);

  const commitLocalState = useCallback(async (operation: QueueItem["operation"], payload: unknown, updater: (current: FinanceState, queueItemId?: string) => FinanceState) => {
    if (!userId) throw mutationFailure(operation, "Tus datos todavía se están preparando. Inténtalo de nuevo en un momento.", false);
    if (closingSession.current) throw mutationFailure(operation, "Estamos cerrando tu sesión de forma segura. Espera un momento.", false);
    const targetUserId = userId;
    const timestamp = Math.max(Date.now(), lastQueueTimestamp.current + 1);
    lastQueueTimestamp.current = timestamp;
    const queueItem = targetUserId !== "demo" && createClient()
      ? { id: uid(), userId: targetUserId, operation, payload, createdAt: new Date(timestamp).toISOString() } satisfies QueueItem
      : null;
    // Signal the reconciliation loop as soon as a user mutation starts. The
    // durable write can still be in flight while a remote snapshot is loading.
    mutationRevision.current += 1;
    const commit = localWriteChain.current.then(async () => {
      const next = await withCrossTabLock(`moneva:finance:${targetUserId}`, () => queueItem
        ? writeLocalMutation(targetUserId, stateRef.current, queueItem, (current) => updater(current, queueItem.id))
        : updateLocalState(targetUserId, stateRef.current, (current) => updater(current, undefined)));
      replaceState(next);
      broadcastFinanceChange(targetUserId);
      if (queueItem) {
        setPendingCount((current) => current + 1);
        if (isTransactionQueueItem(queueItem)) setPendingTransactionCount((current) => current + 1);
      }
      return { next, queueItemId: queueItem?.id };
    });
    localWriteChain.current = commit.then(() => undefined, () => undefined);
    try {
      return await commit;
    } catch (error) {
      const message = "No pudimos guardar el cambio de forma segura en este dispositivo.";
      setSyncError(message);
      throw mutationFailure(operation, message, false, error);
    }
  }, [replaceState, userId]);

  const cacheState = useCallback(async (
    updater: (current: FinanceState) => FinanceState,
    options?: { expectedRevision?: number; staleUpdater?: (current: FinanceState) => FinanceState },
  ) => {
    if (closingSession.current) return stateRef.current;
    const targetUserId = userId;
    const cache = localWriteChain.current.then(async () => {
      const next = targetUserId
        ? await withCrossTabLock(`moneva:finance:${targetUserId}`, async () => {
          const revisionMatches = options?.expectedRevision === undefined
            || await readLocalRevision(targetUserId) === options.expectedRevision;
          const selectedUpdater = revisionMatches ? updater : options?.staleUpdater ?? ((current: FinanceState) => current);
          return updateLocalState(targetUserId, stateRef.current, selectedUpdater);
        })
        : updater(stateRef.current);
      replaceState(next);
      if (targetUserId) broadcastFinanceChange(targetUserId);
      return next;
    });
    localWriteChain.current = cache.then(() => undefined, () => undefined);
    try {
      return await cache;
    } catch (error) {
      setSyncError(errorMessage(error));
      throw error;
    }
  }, [replaceState, userId]);

  const enqueueRemoteTask = useCallback(<T,>(task: () => Promise<T>) => {
    activeRemoteTasks.current += 1;
    setSyncing(true);
    const run = remoteTaskChain.current.then(task, task);
    remoteTaskChain.current = run.then(() => undefined, () => undefined);
    void run.finally(() => {
      activeRemoteTasks.current = Math.max(0, activeRemoteTasks.current - 1);
      if (activeRemoteTasks.current === 0) setSyncing(false);
    }).catch(() => undefined);
    return run;
  }, []);

  const refreshPending = useCallback(async (id = userId) => {
    if (id) applyPendingItems(await readQueue(id));
  }, [applyPendingItems, userId]);

  const reconcileRemote = useCallback(async (client: FinanceSupabaseClient, id: string) => {
    let lastFlushed: Awaited<ReturnType<typeof flushQueue>> | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await localWriteChain.current;
      const stableRevision = mutationRevision.current;
      const stableLocalRevision = await readLocalRevision(id);
      const flushed = await flushQueue(client, id);
      lastFlushed = flushed;
      if (flushed.pending > 0) return { flushed, remote: undefined, stableRevision, unstable: false };
      const remote = await loadRemoteFinanceState(client);
      const published = await withCrossTabLock(`moneva:finance:${id}`, async () => {
        const [currentLocalRevision, queued] = await Promise.all([readLocalRevision(id), readQueue(id)]);
        if (mutationRevision.current !== stableRevision || currentLocalRevision !== stableLocalRevision || queued.length > 0) return false;
        await writeLocalState(id, remote);
        return true;
      });
      if (published) {
        broadcastFinanceChange(id);
        return { flushed, remote, stableRevision, unstable: false };
      }
    }
    return {
      flushed: lastFlushed ?? { pending: 0, pendingItems: [], pendingIds: new Set<string>(), error: null, failedItemId: null },
      remote: undefined,
      stableRevision: mutationRevision.current,
      unstable: true,
    };
  }, []);

  const syncNow = useCallback(async (options: FinanceSyncOptions = {}) => {
    const client = createClient();
    if (!client || !userId || userId === "demo") return { status: "local", pendingCount: 0 } satisfies FinanceSyncResult;
    if (!navigator.onLine) return { status: "offline", pendingCount, error: "Sin conexión; los cambios permanecen guardados en este dispositivo." } satisfies FinanceSyncResult;
    if (activeSync.current) return activeSync.current;

    const run = enqueueRemoteTask(async (): Promise<FinanceSyncResult> => {
      try {
        if (options.flushOnly) {
          await localWriteChain.current;
          const flushed = await flushQueue(client, userId);
          applyPendingItems(flushed.pendingItems);
          setSyncError(flushed.error);
          if (flushed.pending > 0) return { status: "pending", pendingCount: flushed.pending, ...(flushed.error ? { error: flushed.error } : {}) };
          return { status: "synced", pendingCount: 0 };
        }
        const reconciliation = await reconcileRemote(client, userId);
        const { flushed, remote, stableRevision, unstable } = reconciliation;
        applyPendingItems(flushed.pendingItems);
        setSyncError(flushed.error);
        if (flushed.pending > 0) {
          return { status: "pending", pendingCount: flushed.pending, ...(flushed.error ? { error: flushed.error } : {}) };
        }
        if (unstable || !remote || mutationRevision.current !== stableRevision) {
          const message = "Hay cambios nuevos en curso. Volveremos a comprobar la nube antes de reemplazar esta copia.";
          setSyncError(message);
          return { status: "pending", pendingCount: 0, error: message };
        }
        const durable = await refreshFromDurable(userId);
        if (durable.queue.length > 0) {
          const message = "Hay cambios nuevos pendientes; conservamos la versión local más reciente.";
          setSyncError(message);
          return { status: "pending", pendingCount: durable.queue.length, error: message };
        }
        setDataSource("remote");
        setSyncError(null);
        return { status: "synced", pendingCount: 0 };
      } catch (error) {
        const message = errorMessage(error);
        setSyncError(message);
        const pendingItems = await readQueue(userId).catch(() => null);
        if (pendingItems) applyPendingItems(pendingItems);
        // A queue-integrity failure must be treated conservatively: the
        // unreadable operation may be a movement and must never unlock a
        // remote replacement/report as if the queue were empty.
        const pending = pendingItems?.length ?? Math.max(1, pendingCount);
        if (!pendingItems) {
          setPendingCount(pending);
          setPendingTransactionCount((current) => Math.max(1, current));
        }
        return { status: pending > 0 ? "pending" : "offline", pendingCount: pending, error: message };
      }
    });
    activeSync.current = run;
    void run.finally(() => {
      if (activeSync.current === run) activeSync.current = null;
    }).catch(() => undefined);
    return run;
  }, [applyPendingItems, enqueueRemoteTask, pendingCount, reconcileRemote, refreshFromDurable, userId]);

  const cancelPreparedSignOut = useCallback(async () => {
    if (userId && userId !== "demo") await resumeLocalFinanceData(userId);
    closingSession.current = false;
    broadcastSessionControl(userId, "resume");
  }, [userId]);

  const completeSignOut = useCallback(() => {
    closingSession.current = true;
    broadcastSessionControl(userId, "signed-out");
    replaceState(emptyFinanceState);
    setDataSource(null);
    setStartupGateVisible(true);
    setDataStatus("loading");
  }, [replaceState, userId]);

  const prepareSignOut = useCallback(async () => {
    closingSession.current = true;
    try {
      if (userId && userId !== "demo") await suspendLocalFinanceData(userId);
      broadcastSessionControl(userId, "closing");
      // Drain both local durability work and cloud work. A second pass covers a
      // local cache write scheduled by the final remote task's continuation.
      for (let pass = 0; pass < 2; pass += 1) {
        await localWriteChain.current;
        await remoteTaskChain.current;
      }
      return userId
        ? withCrossTabLock(`moneva:finance:${userId}`, async () => (await readQueue(userId)).length)
        : 0;
    } catch (error) {
      if (userId && userId !== "demo") await resumeLocalFinanceData(userId).catch(() => undefined);
      closingSession.current = false;
      broadcastSessionControl(userId, "resume");
      throw error;
    }
  }, [userId]);

  useEffect(() => {
    let active = true;
    async function hydrate() {
      let hasUsableData = false;
      setStartupGateVisible(true);
      setDataStatus("loading");
      setDataSource(null);
      setBootstrapError(null);
      try {
        const client = createClient();
        if (!client) {
          const local = await readLocalState("demo");
          if (!active) return;
          const nextState = local ?? demoFinanceState;
          setUserId("demo");
          replaceState(nextState);
          hasUsableData = true;
          setDataSource(local ? "local" : "demo");
          setDataStatus("ready");
          return;
        }

        let identity = initialIdentity;
        if (!identity) {
          const { data, error } = await client.auth.getUser();
          const user = data.user;
          if (!active) return;
          if (error || !user) throw error ?? new Error("Tu sesión no está disponible.");
          identity = identityFromUser(user);
        }

        setUserId(identity.id);
        await activateLocalFinanceData(identity.id);
        await applyLocalFinanceResetGeneration(identity.id);
        const [local, queued] = await Promise.all([readLocalState(identity.id), readQueue(identity.id)]);
        if (!active) return;
        const localIsUsable = Boolean(local?.profile && local.snapshot);
        applyPendingItems(queued);
        if (local && localIsUsable) {
          replaceState(local);
          hasUsableData = true;
          setDataSource("local");
          setDataStatus("ready");
        }

        if (!navigator.onLine) {
          if (!localIsUsable) {
            setBootstrapError("No hay conexión y este dispositivo todavía no tiene una copia de tus datos.");
            setDataStatus("unavailable");
          }
          return;
        }

        const { flushed, remote, stableRevision, unstable } = await enqueueRemoteTask(() => reconcileRemote(client, identity.id));
        if (!active) return;
        applyPendingItems(flushed.pendingItems);
        setSyncError(flushed.error);
        if (remote && !unstable && mutationRevision.current === stableRevision) {
          await refreshFromDurable(identity.id);
          if (!active) return;
          hasUsableData = true;
          setDataSource("remote");
          setDataStatus("ready");
        } else if (localIsUsable && unstable) {
          setSyncError("Hay cambios nuevos en curso. Conservamos la copia local y volveremos a comprobar la nube.");
        } else if (!localIsUsable) {
          const message = flushed.error ?? "No pudimos recuperar tus datos desde la nube.";
          setBootstrapError(message);
          setDataStatus("unavailable");
        }
      } catch (error) {
        if (!active) return;
        const message = errorMessage(error);
        setSyncError(message);
        if (!hasUsableData) {
          setBootstrapError(message);
          setDataStatus("unavailable");
        }
      }
    }
    void hydrate();
    return () => { active = false; };
  }, [applyPendingItems, enqueueRemoteTask, initialIdentity, reconcileRemote, refreshFromDurable, replaceState]);

  useEffect(() => {
    if (!state.profile) return;
    setTheme(state.profile.themeMode);
    applyCustomThemeToElement(document.documentElement, state.profile.customThemeColor);
    document.documentElement.dataset.palette = state.profile.colorTheme;
  }, [setTheme, state.profile]);

  useEffect(() => {
    const reconnected = online && !wasOnline.current;
    wasOnline.current = online;
    if (!reconnected || dataStatus !== "ready" || !userId || userId === "demo") return;
    const timeout = window.setTimeout(() => { void syncNow(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [dataStatus, online, syncNow, userId]);

  const persist = useCallback(async (operation: QueueItem["operation"], queueItemId?: string) => {
    const client = createClient();
    if (!client || !userId || userId === "demo") return localMutationResult(operation);
    if (!queueItemId) throw mutationFailure(operation, "No encontramos la copia recuperable del cambio.", false);

    if (!navigator.onLine) return queuedMutationResult(operation, "Sin conexión; se sincronizará automáticamente al volver.");

    try {
      const flushed = await enqueueRemoteTask(() => flushQueue(client, userId));
      applyPendingItems(flushed.pendingItems);
      if (flushed.error) setSyncError(flushed.error);
      if (!flushed.pendingIds.has(queueItemId)) return syncedMutationResult(operation);
      return queuedMutationResult(operation, flushed.error ?? "Hay cambios anteriores pendientes; respetaremos su orden al reintentar.");
    } catch (error) {
      const message = errorMessage(error);
      setSyncError(message);
      await refreshPending(userId).catch(() => undefined);
      return queuedMutationResult(operation, message);
    }
  }, [applyPendingItems, enqueueRemoteTask, refreshPending, userId]);

  const persistTransactions = useCallback(async (operation: "transaction.create" | "transaction.update" | "transaction.import" | "planner.import", queueItemId: string | undefined, ids: string[]) => {
    try {
      const result = await persist(operation, queueItemId);
      if (result.status === "synced" || result.status === "local") {
        const idSet = new Set(ids);
        await cacheState((current) => ({
          ...current,
          transactions: current.transactions.map((transaction) => idSet.has(transaction.id)
            && (!queueItemId || transaction.pendingOperationId === queueItemId)
            ? { ...transaction, syncStatus: "synced", pendingOperationId: undefined }
            : transaction),
        }));
      }
      return result;
    } catch (error) {
      const idSet = new Set(ids);
      await cacheState((current) => ({
        ...current,
        transactions: current.transactions.map((transaction) => idSet.has(transaction.id)
          && (!queueItemId || transaction.pendingOperationId === queueItemId)
          ? { ...transaction, syncStatus: "error" }
          : transaction),
      }));
      throw error;
    }
  }, [cacheState, persist]);

  const refreshRecurringRule = useCallback(async (ruleId: string) => {
    const client = createClient();
    if (!client || !userId || userId === "demo" || !navigator.onLine) return;
    const month = currentMonthStart(new Date(), stateRef.current.profile?.timezone);
    const [ruleResult, occurrenceResult] = await Promise.all([
      client.from("recurring_rules").select("id,kind,amount,account_id,destination_account_id,category_id,financial_target_id,financial_target_effect,description,merchant,note,icon,cadence,interval_count,starts_on,ends_on,anchor_day,weekday,posting_policy,timezone,auto_post,include_in_budget,include_in_income_target,status,next_run_on,created_at,updated_at").eq("id", ruleId).maybeSingle(),
      client.from("recurring_occurrences").select("id,rule_id,kind,scheduled_on,effective_on,amount,account_id,destination_account_id,category_id,financial_target_id,financial_target_effect,description,merchant,note,icon,status,transaction_id,transfer_group_id,failure_reason,posted_at,created_at").eq("rule_id", ruleId).gte("effective_on", isoDateOffset(month, -45)).lte("effective_on", isoDateOffset(month, 430)).order("effective_on"),
    ]);
    if (ruleResult.error || occurrenceResult.error) throw ruleResult.error ?? occurrenceResult.error;
    await cacheState((current) => ({
      ...current,
      recurringRules: ruleResult.data
        ? [...current.recurringRules.filter((rule) => rule.id !== ruleId), recurringRuleFromRow(ruleResult.data as RecurringRuleRow)]
        : current.recurringRules.filter((rule) => rule.id !== ruleId),
      recurringOccurrences: [
        ...current.recurringOccurrences.filter((occurrence) => occurrence.ruleId !== ruleId),
        ...((occurrenceResult.data ?? []) as RecurringOccurrenceRow[]).map(recurringOccurrenceFromRow),
      ],
    }));
  }, [cacheState, userId]);

  const addTransaction = useCallback(async (input: TransactionInput) => {
    validateTransactionWrite(input);
    const created = buildTransactions(input, stateRef.current.accounts, stateRef.current.profile?.currencyCode);
    const payload = { transactions: created, input } satisfies TransactionPayload;
    const { queueItemId } = await commitLocalState("transaction.create", payload, (current, operationId) => {
      const localCreated = created.map((transaction) => ({ ...transaction, pendingOperationId: operationId }));
      return { ...current, transactions: mergeTransactions(current.transactions, localCreated), snapshot: adjustedSnapshot(current.snapshot, localCreated, 1), financialTargets: adjustedTargetProgress(current.financialTargets, localCreated, 1) };
    });
    return persistTransactions("transaction.create", queueItemId, created.map((transaction) => transaction.id));
  }, [commitLocalState, persistTransactions]);

  const importTransactions = useCallback(async (inputs: TransactionInput[]) => {
    if (!inputs.length) throw new Error("No hay movimientos nuevos para importar.");
    if (inputs.length > 1_000) throw new Error("Cada importación admite máximo 1.000 movimientos por lote.");
    inputs.forEach(validateTransactionWrite);
    const created = inputs.flatMap((input) => buildTransactions(input, stateRef.current.accounts, stateRef.current.profile?.currencyCode));
    if (created.some((transaction) => transaction.kind === "transfer_in" || transaction.kind === "transfer_out")) {
      throw new Error("La importación masiva todavía no admite transferencias.");
    }
    const payload = { transactions: created } satisfies TransactionImportPayload;
    const { queueItemId } = await commitLocalState("transaction.import", payload, (current, operationId) => {
      const localCreated = created.map((transaction) => ({ ...transaction, pendingOperationId: operationId }));
      return { ...current, transactions: mergeTransactions(current.transactions, localCreated), snapshot: adjustedSnapshot(current.snapshot, localCreated, 1), financialTargets: adjustedTargetProgress(current.financialTargets, localCreated, 1) };
    });
    return persistTransactions("transaction.import", queueItemId, created.map((transaction) => transaction.id));
  }, [commitLocalState, persistTransactions]);

  const importPlanner = useCallback(async (input: PlannerImportMutationInput) => {
    if (!input.transactions.length) throw new Error("No hay movimientos nuevos para importar.");
    if (input.transactions.length > 1_000) throw new Error("Cada importación admite máximo 1.000 movimientos por lote.");
    if (input.categories.length > 200) throw new Error("Cada importación admite máximo 200 categorías.");
    if (input.incomeTypes.length > 100) throw new Error("Cada importación admite máximo 100 tipos de ingreso.");
    const account: Account = {
      ...input.account,
      id: cleanRequiredText(input.account.id, "El identificador de la cuenta", 100),
      name: cleanRequiredText(input.account.name, "El nombre de la cuenta", 100),
      initialBalance: input.account.initialBalance,
    };
    assertFinanceAmount(account.initialBalance, { allowZero: true, allowNegative: true, label: "El saldo inicial conciliado" });
    input.transactions.forEach((transaction) => {
      validateTransactionWrite(transaction);
      if (transaction.accountId !== account.id) throw new Error("Todos los movimientos del planificador deben usar la cuenta elegida.");
    });
    const created = input.transactions.flatMap((transaction) => buildTransactions(transaction, [...stateRef.current.accounts, account], stateRef.current.profile?.currencyCode));
    if (created.some((transaction) => transaction.kind === "transfer_in" || transaction.kind === "transfer_out")) {
      throw new Error("La importación del planificador no admite transferencias.");
    }
    const categoryIds = new Set<string>();
    const categories = input.categories.map((category) => {
      const id = cleanRequiredText(category.id, "El identificador de la categoría", 100);
      if (categoryIds.has(id)) throw new Error("La importación contiene categorías repetidas.");
      categoryIds.add(id);
      return { ...category, id, name: cleanRequiredText(category.name, "El nombre de la categoría", 100), group: cleanRequiredText(category.group, "La categoría principal", 64) };
    });
    const incomeTypeIds = new Set<string>();
    const incomeTypes = input.incomeTypes.map((incomeType) => {
      const id = cleanRequiredText(incomeType.id, "El identificador del tipo de ingreso", 100);
      if (incomeTypeIds.has(id)) throw new Error("La importación contiene tipos de ingreso repetidos.");
      incomeTypeIds.add(id);
      return { ...incomeType, id, name: cleanRequiredText(incomeType.name, "El nombre del tipo de ingreso", 100) };
    });
    const payload: PlannerImportQueuePayload = {
      account,
      createAccount: input.createAccount,
      reconcileInitialBalance: input.reconcileInitialBalance,
      categories,
      incomeTypes,
      transactions: created,
    };
    const { queueItemId } = await commitLocalState("planner.import", payload, (current, operationId) => {
      const existingAccount = current.accounts.find((candidate) => candidate.id === account.id);
      if (input.createAccount && existingAccount) throw new Error("Ya existe una cuenta con el identificador de la importación.");
      if (!input.createAccount && !existingAccount) throw new Error("La cuenta elegida ya no está disponible.");
      const activeGroups = new Set(current.groupAllocations.filter((group) => !group.archived).map((group) => group.group));
      if (categories.some((category) => !activeGroups.has(category.group))) throw new Error("Una categoría nueva apunta a una categoría principal que ya no está disponible.");
      const importedExpenseIds = new Set(categories.map((category) => category.id));
      const importedCategories: Category[] = categories.map((category) => ({ ...category, kind: "expense", isDefault: false, archived: false }));
      let nextCategories = [...current.categories.filter((category) => !importedExpenseIds.has(category.id)), ...importedCategories];
      nextCategories = incomeTypes.reduce((items, incomeType) => upsertIncomeTypeInCategories(items, incomeType), nextCategories);
      const localCreated = created.map((transaction) => ({ ...transaction, pendingOperationId: operationId }));
      let snapshot = current.snapshot;
      if (snapshot) {
        const previousInitial = existingAccount?.initialBalance ?? 0;
        const initialDelta = input.createAccount ? account.initialBalance : input.reconcileInitialBalance ? account.initialBalance - previousInitial : 0;
        snapshot = {
          ...snapshot,
          accountBalances: {
            ...snapshot.accountBalances,
            [account.id]: (snapshot.accountBalances[account.id] ?? 0) + initialDelta,
          },
        };
        snapshot = adjustedSnapshot(snapshot, localCreated, 1);
      }
      const nextAccounts = input.createAccount
        ? [...current.accounts, account]
        : current.accounts.map((candidate) => candidate.id === account.id && input.reconcileInitialBalance ? account : candidate);
      return {
        ...current,
        accounts: nextAccounts,
        categories: nextCategories,
        transactions: mergeTransactions(current.transactions, localCreated),
        snapshot,
        financialTargets: adjustedTargetProgress(current.financialTargets, localCreated, 1),
      };
    });
    return persistTransactions("planner.import", queueItemId, created.map((transaction) => transaction.id));
  }, [commitLocalState, persistTransactions]);

  const updateTransaction = useCallback(async (id: string, input: TransactionInput) => {
    validateTransactionWrite(input);
    const selected = stateRef.current.transactions.find((transaction) => transaction.id === id);
    if (!selected) throw new Error("No encontramos el movimiento que quieres editar.");
    const existing = selected.transferGroupId ? stateRef.current.transactions.filter((transaction) => transaction.transferGroupId === selected.transferGroupId) : [selected];
    if (selected.transferGroupId && input.type !== "transfer") throw new Error("Una transferencia debe seguir siendo una transferencia.");
    if (!selected.transferGroupId && input.type === "transfer") throw new Error("Crea una transferencia nueva para cambiar el tipo.");

    const updated = selected.transferGroupId
      ? buildUpdatedTransfer(existing, input, stateRef.current.accounts, stateRef.current.profile?.currencyCode)
      : [{ ...selected, ...buildTransactions(input, stateRef.current.accounts, stateRef.current.profile?.currencyCode)[0], id: selected.id, ledgerEventId: selected.ledgerEventId }];
    const payload = { transactions: updated, input } satisfies TransactionPayload;
    const { queueItemId } = await commitLocalState("transaction.update", payload, (current, operationId) => {
      const currentSelected = current.transactions.find((transaction) => transaction.id === id);
      if (!currentSelected) throw new Error("No encontramos el movimiento que quieres editar.");
      const currentExisting = currentSelected.transferGroupId
        ? current.transactions.filter((transaction) => transaction.transferGroupId === currentSelected.transferGroupId)
        : [currentSelected];
      if (currentSelected.transferGroupId && input.type !== "transfer") throw new Error("Una transferencia debe seguir siendo una transferencia.");
      if (!currentSelected.transferGroupId && input.type === "transfer") throw new Error("Crea una transferencia nueva para cambiar el tipo.");
      const currentUpdated = (currentSelected.transferGroupId
        ? buildUpdatedTransfer(currentExisting, input, current.accounts, current.profile?.currencyCode)
        : [{ ...currentSelected, ...buildTransactions(input, current.accounts, current.profile?.currencyCode)[0], id: currentSelected.id, ledgerEventId: currentSelected.ledgerEventId }])
        .map((transaction) => ({ ...transaction, pendingOperationId: operationId }));
      const currentIds = new Set(currentExisting.map((transaction) => transaction.id));
      return {
        ...current,
        transactions: mergeTransactions(current.transactions.filter((transaction) => !currentIds.has(transaction.id)), currentUpdated),
        snapshot: adjustedSnapshot(adjustedSnapshot(current.snapshot, currentExisting, -1), currentUpdated, 1),
        financialTargets: adjustedTargetProgress(adjustedTargetProgress(current.financialTargets, currentExisting, -1), currentUpdated, 1),
      };
    });
    return persistTransactions("transaction.update", queueItemId, updated.map((transaction) => transaction.id));
  }, [commitLocalState, persistTransactions]);

  const deleteTransaction = useCallback(async (id: string, knownTransferGroupId?: string, knownRows: Transaction[] = []) => {
    const selected = stateRef.current.transactions.find((transaction) => transaction.id === id);
    const payload = { id, transferGroupId: selected?.transferGroupId ?? knownTransferGroupId };
    const { queueItemId } = await commitLocalState("transaction.delete", payload, (current) => {
      const currentSelected = current.transactions.find((transaction) => transaction.id === id);
      const knownSelected = knownRows.find((transaction) => transaction.id === id);
      const selectedForAdjustment = currentSelected ?? knownSelected;
      if (!selectedForAdjustment) return current;
      const transferGroupId = currentSelected?.transferGroupId ?? knownTransferGroupId ?? knownSelected?.transferGroupId;
      const currentRemoved = transferGroupId
        ? [...current.transactions, ...knownRows].filter((transaction, index, rows) => transaction.transferGroupId === transferGroupId && rows.findIndex((item) => item.id === transaction.id) === index)
        : [selectedForAdjustment];
      return {
        ...current,
        transactions: current.transactions.filter((transaction) => transaction.id !== id && (!transferGroupId || transaction.transferGroupId !== transferGroupId)),
        snapshot: adjustedSnapshot(current.snapshot, currentRemoved, -1),
        financialTargets: adjustedTargetProgress(current.financialTargets, currentRemoved, -1),
      };
    });
    return persist("transaction.delete", queueItemId);
  }, [commitLocalState, persist]);

  const upsertRecurringRule = useCallback(async (input: RecurringRuleInput) => {
    validateRecurringRule(input);
    assertFinanceAmount(input.amount, { label: "El monto programado" });
    assertOptionalText(input.merchant, "El comercio", 120);
    assertOptionalText(input.note, "La nota", 1000);
    const now = new Date().toISOString();
    const id = input.id ?? uid();
    const existing = stateRef.current.recurringRules.find((rule) => rule.id === id);
    const rule: RecurringRule = {
      ...input,
      id,
      description: cleanRequiredText(input.description, "La descripción", 200),
      merchant: input.merchant?.trim() || undefined,
      note: input.note?.trim() || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      nextRunOn: existing?.nextRunOn ?? input.startsOn,
      syncStatus: createClient() ? "pending" : "synced",
    };
    const { queueItemId } = await commitLocalState("recurring-rule.upsert", rule, (current, operationId) => {
      if (!current.accounts.some((account) => account.id === rule.accountId && !account.archived)) throw new Error("La cuenta ya no está disponible.");
      if (rule.destinationAccountId && !current.accounts.some((account) => account.id === rule.destinationAccountId && !account.archived)) throw new Error("La cuenta de destino ya no está disponible.");
      if (rule.categoryId && !current.categories.some((category) => category.id === rule.categoryId && !category.archived)) throw new Error("La subcategoría ya no está disponible.");
      const localRule = { ...rule, pendingOperationId: operationId };
      const rangeStart = isoDateOffset(currentMonthStart(new Date(), current.profile?.timezone), -45);
      const rangeEnd = isoDateOffset(currentMonthStart(new Date(), current.profile?.timezone), 430);
      const future = projectedOccurrences(localRule, rangeStart, rangeEnd);
      return {
        ...current,
        recurringRules: [...current.recurringRules.filter((candidate) => candidate.id !== id), localRule],
        recurringOccurrences: [
          ...current.recurringOccurrences.filter((occurrence) => occurrence.ruleId !== id || occurrence.status !== "planned"),
          ...future,
        ],
      };
    });
    const result = await persist("recurring-rule.upsert", queueItemId);
    if (result.status === "synced") await refreshRecurringRule(id);
    return result;
  }, [commitLocalState, persist, refreshRecurringRule]);

  const archiveRecurringRule = useCallback(async (id: string) => {
    const { queueItemId } = await commitLocalState("recurring-rule.archive", { id }, (current) => ({
      ...current,
      recurringRules: current.recurringRules.map((rule) => rule.id === id ? { ...rule, status: "archived", syncStatus: createClient() ? "pending" : "synced" } : rule),
      recurringOccurrences: current.recurringOccurrences.map((occurrence) => occurrence.ruleId === id && occurrence.status === "planned" ? { ...occurrence, status: "cancelled" } : occurrence),
    }));
    const result = await persist("recurring-rule.archive", queueItemId);
    if (result.status === "synced") await refreshRecurringRule(id);
    return result;
  }, [commitLocalState, persist, refreshRecurringRule]);

  const updateRecurringOccurrence = useCallback(async (id: string, status: "planned" | "skipped" | "cancelled") => {
    const occurrence = stateRef.current.recurringOccurrences.find((item) => item.id === id);
    if (!occurrence) throw new Error("No encontramos la ocurrencia programada.");
    if (occurrence.id.startsWith("projected:")) throw new Error("Espera a que la programación termine de sincronizarse.");
    if (occurrence.status === "posted") throw new Error("Un movimiento ya publicado se edita desde el historial.");
    const payload = { id, status };
    const { queueItemId } = await commitLocalState("recurring-occurrence.update", payload, (current) => ({
      ...current,
      recurringOccurrences: current.recurringOccurrences.map((item) => item.id === id ? { ...item, status } : item),
    }));
    const result = await persist("recurring-occurrence.update", queueItemId);
    if (result.status === "synced") await refreshRecurringRule(occurrence.ruleId);
    return result;
  }, [commitLocalState, persist, refreshRecurringRule]);

  const upsertFinancialTarget = useCallback(async (input: FinancialTargetInput) => {
    validateFinancialTargetWrite(input);
    const { debt: debtInput, ...targetInput } = input;
    const id = input.id ?? uid();
    const now = new Date().toISOString();
    const existing = stateRef.current.financialTargets.find((target) => target.id === id);
    const target: FinancialTarget = {
      ...targetInput,
      id,
      title: cleanRequiredText(input.title, "El nombre de la meta", 100),
      description: input.description?.trim() || undefined,
      progressAmount: existing?.progressAmount === undefined
        ? input.initialProgress
        : existing.progressAmount - existing.initialProgress + input.initialProgress,
      completedAt: input.status === "completed" ? existing?.completedAt ?? now : undefined,
      archivedAt: input.status === "archived" ? existing?.archivedAt ?? now : undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      syncStatus: createClient() ? "pending" : "synced",
    };
    const payload = { target, debt: debtInput };
    const { queueItemId } = await commitLocalState("financial-target.upsert", payload, (current, operationId) => {
      if (target.accountId && !current.accounts.some((account) => account.id === target.accountId && !account.archived)) throw new Error("La cuenta vinculada ya no está disponible.");
      if (target.categoryId && !current.categories.some((category) => category.id === target.categoryId && !category.archived)) throw new Error("La categoría vinculada ya no está disponible.");
      const localTarget = { ...target, pendingOperationId: operationId };
      const debt: FinancialTargetDebtDetails | null = target.kind === "debt" && debtInput ? { targetId: id, ...debtInput } : null;
      return {
        ...current,
        financialTargets: [...current.financialTargets.filter((candidate) => candidate.id !== id), localTarget],
        financialTargetDebts: debt
          ? [...current.financialTargetDebts.filter((candidate) => candidate.targetId !== id), debt]
          : current.financialTargetDebts.filter((candidate) => candidate.targetId !== id),
      };
    });
    const result = await persist("financial-target.upsert", queueItemId);
    if (result.status === "synced" || result.status === "local") {
      await cacheState((current) => ({ ...current, financialTargets: current.financialTargets.map((candidate) => candidate.id === id && candidate.pendingOperationId === queueItemId ? { ...candidate, syncStatus: "synced", pendingOperationId: undefined } : candidate) }));
    }
    return result;
  }, [cacheState, commitLocalState, persist]);

  const setFinancialTargetStatus = useCallback(async (id: string, status: FinancialTargetStatus) => {
    const now = new Date().toISOString();
    const payload = { id, status, completedAt: status === "completed" ? now : undefined, archivedAt: status === "archived" ? now : undefined };
    const { queueItemId } = await commitLocalState("financial-target.status", payload, (current, operationId) => ({
      ...current,
      financialTargets: current.financialTargets.map((target) => target.id === id ? {
        ...target, status, completedAt: status === "completed" ? now : undefined,
        archivedAt: status === "archived" ? now : undefined, updatedAt: now,
        syncStatus: createClient() ? "pending" : "synced", pendingOperationId: operationId,
      } : target),
    }));
    const result = await persist("financial-target.status", queueItemId);
    if (result.status === "synced" || result.status === "local") await cacheState((current) => ({ ...current, financialTargets: current.financialTargets.map((target) => target.id === id && target.pendingOperationId === queueItemId ? { ...target, syncStatus: "synced", pendingOperationId: undefined } : target) }));
    return result;
  }, [cacheState, commitLocalState, persist]);

  const upsertFinancialTargetEntry = useCallback(async (input: FinancialTargetEntryInput) => {
    assertFinanceAmount(input.amount, { label: "El monto del avance" });
    assertOptionalText(input.note, "La nota", 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) throw new Error("La fecha del avance no es válida.");
    const id = input.id ?? uid();
    const existing = stateRef.current.financialTargetEntries.find((entry) => entry.id === id);
    const entry: FinancialTargetEntry = {
      ...input, id, note: input.note?.trim() || undefined, createdAt: existing?.createdAt ?? new Date().toISOString(),
      syncStatus: createClient() ? "pending" : "synced",
    };
    const { queueItemId } = await commitLocalState("financial-target-entry.upsert", entry, (current, operationId) => {
      if (!current.financialTargets.some((target) => target.id === entry.targetId && target.status !== "archived")) throw new Error("La meta ya no está disponible.");
      const localEntry = { ...entry, pendingOperationId: operationId };
      const withoutExisting = existing
        ? adjustedTargetProgress(current.financialTargets, [{ financialTargetId: existing.targetId, financialTargetEffect: existing.effect, amount: existing.amount }], -1)
        : current.financialTargets;
      return {
        ...current,
        financialTargets: adjustedTargetProgress(withoutExisting, [{ financialTargetId: entry.targetId, financialTargetEffect: entry.effect, amount: entry.amount }], 1),
        financialTargetEntries: [...current.financialTargetEntries.filter((candidate) => candidate.id !== id), localEntry],
      };
    });
    const result = await persist("financial-target-entry.upsert", queueItemId);
    if (result.status === "synced" || result.status === "local") await cacheState((current) => ({ ...current, financialTargetEntries: current.financialTargetEntries.map((candidate) => candidate.id === id && candidate.pendingOperationId === queueItemId ? { ...candidate, syncStatus: "synced", pendingOperationId: undefined } : candidate) }));
    return result;
  }, [cacheState, commitLocalState, persist]);

  const deleteFinancialTargetEntry = useCallback(async (id: string) => {
    const existing = stateRef.current.financialTargetEntries.find((entry) => entry.id === id);
    if (!existing) throw new Error("No encontramos ese avance.");
    const { queueItemId } = await commitLocalState("financial-target-entry.delete", { id }, (current) => ({
      ...current,
      financialTargets: adjustedTargetProgress(current.financialTargets, [{ financialTargetId: existing.targetId, financialTargetEffect: existing.effect, amount: existing.amount }], -1),
      financialTargetEntries: current.financialTargetEntries.filter((entry) => entry.id !== id),
    }));
    return persist("financial-target-entry.delete", queueItemId);
  }, [commitLocalState, persist]);

  const loadFinancialTargetEntries = useCallback(async (targetId: string) => {
    const localEntries = stateRef.current.financialTargetEntries.filter((entry) => entry.targetId === targetId);
    const client = createClient();
    if (!client || !userId || userId === "demo" || !navigator.onLine) return localEntries;
    const { data, error } = await client.from("financial_target_entries")
      .select("id,target_id,kind,effect,amount,occurred_on,note,created_at")
      .eq("target_id", targetId)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const entries = (data as FinancialTargetEntryRow[]).map(financialTargetEntryFromRow);
    await cacheState((current) => ({
      ...current,
      financialTargetEntries: uniqueBy([
        ...current.financialTargetEntries.filter((entry) => entry.targetId !== targetId || entry.syncStatus === "pending"),
        ...entries,
      ], (entry) => entry.id),
    }));
    return entries;
  }, [cacheState, userId]);

  const uploadFinancialTargetCover = useCallback(async (targetId: string, file: File) => {
    const client = createClient();
    if (!client || !userId || userId === "demo") throw new Error("Las portadas solo se guardan al iniciar sesión.");
    if (!navigator.onLine) throw new Error("Conéctate para subir la portada; el resto de la meta sí puede guardarse sin conexión.");
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) throw new Error("Usa una imagen JPG, PNG o WebP.");
    if (file.size > 5 * 1024 * 1024) throw new Error("La portada debe pesar menos de 5 MB.");
    const path = `${userId}/${targetId}/cover`;
    const previousPath = stateRef.current.financialTargets.find((target) => target.id === targetId)?.coverPath;
    const bucket = client.storage.from("financial-target-covers");
    const { error } = await bucket.upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type });
    if (error) throw error;
    if (previousPath && previousPath !== path && previousPath.startsWith(`${userId}/${targetId}/`)) {
      const { error: cleanupError } = await bucket.remove([previousPath]);
      if (cleanupError) console.warn("No se pudo retirar la portada anterior.", cleanupError.message);
    }
    return path;
  }, [userId]);

  const getFinancialTargetCoverUrl = useCallback(async (path: string) => {
    const client = createClient();
    if (!client || !userId || userId === "demo" || !navigator.onLine) return null;
    if (!path.startsWith(`${userId}/`)) return null;
    const { data, error } = await client.storage.from("financial-target-covers").createSignedUrl(path, 600);
    return error ? null : data.signedUrl;
  }, [userId]);

  const addAccount = useCallback(async (account: Omit<Account, "id">) => {
    const name = cleanRequiredText(account.name, "El nombre de la cuenta", 100);
    assertFinanceAmount(account.initialBalance, { allowZero: true, allowNegative: true, label: "El saldo inicial" });
    const currencyCode = account.currencyCode ?? "COP";
    if (!new Set(["COP", "USD"]).has(currencyCode)) throw new Error("Por ahora Moneva admite cuentas en COP o USD.");
    if (currencyCode === "USD" && (!account.openingExchangeRate || account.openingExchangeRate <= 0)) throw new Error("Necesitamos una tasa válida para valorar el saldo inicial en dólares.");
    const created = { ...account, currencyCode, openingBalanceDate: account.openingBalanceDate ?? new Date().toISOString().slice(0, 10), openingExchangeRate: currencyCode === "COP" ? 1 : account.openingExchangeRate, name, id: uid(), version: 1 };
    const { queueItemId } = await commitLocalState("account.create", created, (current) => ({
      ...current,
      accounts: [...current.accounts, created],
      snapshot: current.snapshot ? {
        ...current.snapshot,
        accountBalances: { ...current.snapshot.accountBalances, [created.id]: created.initialBalance },
        accountBalancesBase: { ...current.snapshot.accountBalancesBase, [created.id]: created.initialBalance * (created.openingExchangeRate ?? 1) },
        netWorth: (current.snapshot.netWorth ?? Object.values(current.snapshot.accountBalancesBase ?? current.snapshot.accountBalances).reduce((sum, value) => sum + value, 0)) + created.initialBalance * (created.openingExchangeRate ?? 1),
      } : current.snapshot,
    }));
    return persist("account.create", queueItemId);
  }, [commitLocalState, persist]);

  const updateAccount = useCallback(async (input: AccountUpdateInput) => {
    const account = input.account;
    const name = cleanRequiredText(account.name, "El nombre de la cuenta", 100);
    if (!account.version) throw new Error("La cuenta todavía no tiene una versión sincronizada.");
    if (input.targetBalance !== undefined) assertFinanceAmount(input.targetBalance, { allowZero: true, allowNegative: true, label: "El saldo conciliado" });
    if (account.currencyCode === "USD" && input.targetBalance !== undefined && (!input.exchangeRate || input.exchangeRate <= 0)) throw new Error("Escribe una tasa válida para conciliar esta cuenta en dólares.");
    const payload: AccountUpdateInput = { ...input, account: { ...account, name } };
    const { queueItemId } = await commitLocalState("account.update", payload, (current) => {
      const previousAccount = current.accounts.find((item) => item.id === account.id) ?? account;
      const previousNative = current.snapshot?.accountBalances[account.id] ?? accountBalance(previousAccount, current.transactions);
      const previousRate = previousAccount.currencyCode === "USD" ? previousAccount.openingExchangeRate ?? 1 : 1;
      const currencyChanged = previousAccount.currencyCode !== account.currencyCode;
      const nextRate = account.currencyCode === "USD" ? input.exchangeRate ?? previousRate : 1;
      const previousBase = current.snapshot?.accountBalancesBase?.[account.id] ?? previousNative * previousRate;
      const nextNative = input.targetBalance ?? previousNative;
      const nextBase = currencyChanged ? nextNative * nextRate : previousBase + (nextNative - previousNative) * nextRate;
      const baseDelta = nextBase - previousBase;
      const nextAccount = {
        ...account,
        name,
        initialBalance: current.snapshot ? account.initialBalance : account.initialBalance + (nextNative - previousNative),
        openingBalanceDate: currencyChanged ? input.adjustmentDate : account.openingBalanceDate,
        openingExchangeRate: nextRate,
        version: (account.version ?? 1) + 1,
      };
      return {
        ...current,
        accounts: current.accounts.map((item) => item.id === account.id ? nextAccount : item),
        snapshot: current.snapshot ? {
          ...current.snapshot,
          accountBalances: { ...current.snapshot.accountBalances, [account.id]: nextNative },
          accountBalancesBase: { ...current.snapshot.accountBalancesBase, [account.id]: nextBase },
          netWorth: (current.snapshot.netWorth ?? Object.values(current.snapshot.accountBalancesBase ?? current.snapshot.accountBalances).reduce((sum, value) => sum + value, 0)) + baseDelta,
        } : current.snapshot,
      };
    });
    return persist("account.update", queueItemId);
  }, [commitLocalState, persist]);

  const addCategory = useCallback(async (category: Omit<Category, "id">) => {
    const created = { ...category, name: cleanRequiredText(category.name, "El nombre de la categoría", 100), id: uid() };
    const { queueItemId } = await commitLocalState("category.create", created, (current) => ({ ...current, categories: [...current.categories, created] }));
    return persist("category.create", queueItemId);
  }, [commitLocalState, persist]);

  const importCategories = useCallback(async (categories: CategoryInput[]) => {
    if (!categories.length) throw new Error("No hay categorías nuevas para importar.");
    if (categories.length > 200) throw new Error("Cada importación admite máximo 200 categorías.");
    const ids = new Set<string>();
    const normalized = categories.map((category) => {
      const id = cleanRequiredText(category.id, "El identificador de la categoría", 100);
      if (ids.has(id)) throw new Error("La importación contiene categorías repetidas.");
      ids.add(id);
      return {
        ...category,
        id,
        name: cleanRequiredText(category.name, "El nombre de la categoría", 100),
        group: cleanRequiredText(category.group, "El identificador de la categoría principal", 64),
      };
    });
    const { queueItemId } = await commitLocalState("category.import", normalized, (current) => {
      const activeGroups = new Set(current.groupAllocations.filter((group) => !group.archived).map((group) => group.group));
      if (normalized.some((category) => !activeGroups.has(category.group))) throw new Error("Una categoría nueva apunta a una categoría principal que ya no está disponible.");
      const importedNames = normalized.map((category) => category.name.trim().toLocaleLowerCase("es"));
      if (new Set(importedNames).size !== importedNames.length) throw new Error("La importación contiene categorías con el mismo nombre.");
      const activeNames = new Set(current.categories.filter((category) => category.kind === "expense" && !category.archived && !ids.has(category.id)).map((category) => category.name.trim().toLocaleLowerCase("es")));
      if (importedNames.some((name) => activeNames.has(name))) throw new Error("Una categoría nueva ya existe. Elige la categoría actual en la equivalencia.");
      const importedIds = new Set(normalized.map((category) => category.id));
      const imported: Category[] = normalized.map((category) => ({ ...category, kind: "expense", isDefault: false, archived: false }));
      return { ...current, categories: [...current.categories.filter((category) => !importedIds.has(category.id)), ...imported] };
    });
    return persist("category.import", queueItemId);
  }, [commitLocalState, persist]);

  const upsertCategory = useCallback(async (category: CategoryInput) => {
    cleanRequiredText(category.name, "El nombre de la categoría", 100);
    cleanRequiredText(category.group, "El identificador de la categoría principal", 64);
    const { queueItemId } = await commitLocalState("category.upsert", category, (current) => {
      const existing = current.categories.some((item) => item.id === category.id);
      const next: Category = { ...category, kind: "expense", isDefault: existing ? current.categories.find((item) => item.id === category.id)?.isDefault : false, archived: false };
      return { ...current, categories: existing ? current.categories.map((item) => item.id === category.id ? next : item) : [...current.categories, next] };
    });
    return persist("category.upsert", queueItemId);
  }, [commitLocalState, persist]);

  const archiveCategory = useCallback(async (id: string) => {
    const payload = { id };
    const { queueItemId } = await commitLocalState("category.archive", payload, (current) => ({ ...current, categories: current.categories.map((category) => category.id === id ? { ...category, archived: true } : category) }));
    return persist("category.archive", queueItemId);
  }, [commitLocalState, persist]);

  const upsertIncomeType = useCallback(async (incomeType: IncomeTypeInput) => {
    cleanRequiredText(incomeType.name, "El nombre del tipo de ingreso", 100);
    const { queueItemId } = await commitLocalState("income-type.upsert", incomeType, (current) => ({ ...current, categories: upsertIncomeTypeInCategories(current.categories, incomeType) }));
    return persist("income-type.upsert", queueItemId);
  }, [commitLocalState, persist]);

  const importIncomeTypes = useCallback(async (incomeTypes: IncomeTypeInput[]) => {
    if (!incomeTypes.length) throw new Error("No hay tipos de ingreso nuevos para importar.");
    if (incomeTypes.length > 100) throw new Error("Cada importación admite máximo 100 tipos de ingreso.");
    const ids = new Set<string>();
    const normalized = incomeTypes.map((incomeType) => {
      const id = cleanRequiredText(incomeType.id, "El identificador del tipo de ingreso", 100);
      if (ids.has(id)) throw new Error("La importación contiene tipos de ingreso repetidos.");
      ids.add(id);
      return { ...incomeType, id, name: cleanRequiredText(incomeType.name, "El nombre del tipo de ingreso", 100) };
    });
    const { queueItemId } = await commitLocalState("income-type.import", normalized, (current) => {
      const importedNames = normalized.map((incomeType) => incomeType.name.trim().toLocaleLowerCase("es"));
      if (new Set(importedNames).size !== importedNames.length) throw new Error("La importación contiene tipos de ingreso con el mismo nombre.");
      const activeNames = new Set(current.categories.filter((category) => category.kind === "income" && !category.archived && !ids.has(category.id)).map((category) => category.name.trim().toLocaleLowerCase("es")));
      if (importedNames.some((name) => activeNames.has(name))) throw new Error("Un tipo de ingreso nuevo ya existe. Elige el tipo actual en la equivalencia.");
      return { ...current, categories: normalized.reduce((categories, incomeType) => upsertIncomeTypeInCategories(categories, incomeType), current.categories) };
    });
    return persist("income-type.import", queueItemId);
  }, [commitLocalState, persist]);

  const archiveIncomeType = useCallback(async (id: string) => {
    const payload = { id };
    const { queueItemId } = await commitLocalState("income-type.archive", payload, (current) => ({ ...current, categories: archiveIncomeTypeInCategories(current.categories, id) }));
    return persist("income-type.archive", queueItemId);
  }, [commitLocalState, persist]);

  const upsertFinanceGroup = useCallback(async (group: FinanceGroupInput) => {
    cleanRequiredText(group.name, "El nombre de la categoría principal", 60);
    cleanRequiredText(group.group, "El identificador de la categoría principal", 64);
    const { queueItemId } = await commitLocalState("finance-group.upsert", group, (current) => {
      const existing = current.groupAllocations.find((item) => item.id === group.id);
      const next: GroupAllocation = existing
        ? { ...existing, ...group, archived: false }
        : { ...group, targetPercent: 0, includedInPlan: false, archived: false, isDefault: false };
      return { ...current, groupAllocations: existing ? current.groupAllocations.map((item) => item.id === group.id ? next : item) : [...current.groupAllocations, next] };
    });
    return persist("finance-group.upsert", queueItemId);
  }, [commitLocalState, persist]);

  const archiveFinanceGroup = useCallback(async (input: ArchiveFinanceGroupInput) => {
    validateArchiveFinanceGroupWrite(input, stateRef.current);
    const { queueItemId } = await commitLocalState("finance-group.archive", input, (current) => {
      validateArchiveFinanceGroupWrite(input, current);
      return applyFinanceGroupArchive(current, input);
    });
    return persist("finance-group.archive", queueItemId);
  }, [commitLocalState, persist]);

  const updateBudget = useCallback(async (categoryId: string, amount: number) => {
    assertFinanceAmount(amount, { allowZero: true, label: "El presupuesto" });
    const month = currentMonthStart(new Date(), stateRef.current.profile?.timezone);
    const budgetId = stateRef.current.budgets.find((budget) => budget.categoryId === categoryId && budget.month === month)?.id ?? uid();
    const payload = { id: budgetId, categoryId, amount, month };
    const { queueItemId } = await commitLocalState("budget.upsert", payload, (current) => {
      const existing = current.budgets.find((budget) => budget.categoryId === categoryId && budget.month === month);
      const next: Budget = { id: existing?.id ?? budgetId, categoryId, month, amount };
      return { ...current, budgets: existing ? current.budgets.map((budget) => budget.id === existing.id ? next : budget) : [...current.budgets, next] };
    });
    return persist("budget.upsert", queueItemId);
  }, [commitLocalState, persist]);

  const setMonthlyBudgetPlan = useCallback(async (input: MonthlyBudgetPlanInput) => {
    if (!/^\d{4}-\d{2}-01$/.test(input.month)) throw new Error("El mes del presupuesto no es válido.");
    assertFinanceAmount(input.incomeTarget, { allowZero: true, label: "El ingreso esperado" });
    if (!["manual", "current_income", "previous_month", "historical", "imported"].includes(input.source)) {
      throw new Error("El origen del presupuesto no es válido.");
    }
    if (input.budgets.length > 500) throw new Error("El presupuesto admite máximo 500 subcategorías.");
    const categoryIds = new Set<string>();
    const normalized = input.budgets.map((budget) => {
      const id = cleanRequiredText(budget.id, "El identificador del presupuesto", 100);
      const categoryId = cleanRequiredText(budget.categoryId, "La subcategoría", 100);
      if (categoryIds.has(categoryId)) throw new Error("Cada subcategoría debe aparecer una sola vez en el presupuesto.");
      categoryIds.add(categoryId);
      assertFinanceAmount(budget.amount, { allowZero: true, label: "Cada presupuesto" });
      return { id, categoryId, amount: budget.amount };
    });
    const payload: MonthlyBudgetPlanInput = { ...input, budgets: normalized };
    const { queueItemId } = await commitLocalState("budget-plan.set", payload, (current) => {
      const activeExpenseIds = new Set(current.categories.filter((category) => category.kind === "expense" && !category.archived).map((category) => category.id));
      if (normalized.some((budget) => !activeExpenseIds.has(budget.categoryId))) {
        throw new Error("Una subcategoría del presupuesto ya no está disponible.");
      }
      const replacement: Budget[] = normalized
        .filter((budget) => budget.amount > 0)
        .map((budget) => ({ ...budget, month: input.month }));
      const plan: MonthlyBudgetPlan = { month: input.month, incomeTarget: input.incomeTarget, source: input.source };
      return {
        ...current,
        budgets: [...current.budgets.filter((budget) => budget.month !== input.month), ...replacement],
        monthlyBudgetPlans: [...current.monthlyBudgetPlans.filter((candidate) => candidate.month !== input.month), plan],
        budgetMonthsLoaded: Array.from(new Set([...current.budgetMonthsLoaded, input.month])),
      };
    });
    return persist("budget-plan.set", queueItemId);
  }, [commitLocalState, persist]);

  const updateCategoryOrder = useCallback(async (groupKey: string, positions: CategoryOrderWrite[]) => {
    const cleanGroupKey = cleanRequiredText(groupKey, "La categoría principal", 64);
    if (!positions.length) throw new Error("No hay subcategorías para ordenar.");
    const ids = new Set<string>();
    for (const position of positions) {
      cleanRequiredText(position.id, "La subcategoría", 100);
      if (ids.has(position.id)) throw new Error("Cada subcategoría debe aparecer una sola vez en el orden.");
      ids.add(position.id);
      if (!Number.isInteger(position.sortOrder) || position.sortOrder < 0 || position.sortOrder > 1000) {
        throw new Error("El orden de las subcategorías no es válido.");
      }
    }
    const payload = { groupKey: cleanGroupKey, positions };
    const { queueItemId } = await commitLocalState("category.order", payload, (current) => {
      const active = current.categories.filter((category) => category.kind === "expense" && !category.archived && category.group === cleanGroupKey);
      if (active.length !== positions.length || active.some((category) => !ids.has(category.id))) {
        throw new Error("El orden debe incluir todas las subcategorías activas de esta categoría principal.");
      }
      const nextOrder = new Map(positions.map((position) => [position.id, position.sortOrder]));
      return { ...current, categories: current.categories.map((category) => nextOrder.has(category.id) ? { ...category, sortOrder: nextOrder.get(category.id)! } : category) };
    });
    return persist("category.order", queueItemId);
  }, [commitLocalState, persist]);

  const updateProfile = useCallback(async (profile: ProfileInput) => {
    cleanRequiredText(profile.displayName, "El nombre", 80, 2);
    cleanRequiredText(profile.timezone, "La zona horaria", 100);
    const customThemeColor = normalizeHexColor(profile.customThemeColor);
    if (!customThemeColor) throw new Error("El color personalizado debe usar un código HEX válido.");
    const normalizedProfile = { ...profile, customThemeColor };
    const { queueItemId } = await commitLocalState("profile.update", normalizedProfile, (current) => ({ ...current, profile: current.profile ? { ...current.profile, ...normalizedProfile } : current.profile }));
    return persist("profile.update", queueItemId);
  }, [commitLocalState, persist]);

  const updateGroupAllocations = useCallback(async (allocations: GroupAllocationWrite[]) => {
    validateAllocationsWrite(allocations);
    const { queueItemId } = await commitLocalState("allocation.set", allocations, (current) => ({
      ...current,
      groupAllocations: current.groupAllocations.map((group) => {
        const allocation = allocations.find((item) => item.group === group.group);
        return allocation ? { ...group, ...allocation } : group;
      }),
    }));
    return persist("allocation.set", queueItemId);
  }, [commitLocalState, persist]);

  const listTransactions = useCallback(async ({ limit = 20, cursor = null, filter = "all", query = "", monthStart, dateFrom, dateTo, accountId, categoryId }: TransactionQueryOptions = {}): Promise<TransactionPage> => {
    const safeLimit = Math.min(100, Math.max(1, Math.round(limit)));
    const period = dateFrom || dateTo ? transactionDateBounds(dateFrom, dateTo) : transactionMonthBounds(monthStart);
    const client = createClient();
    if (!client || !userId || userId === "demo" || !navigator.onLine) {
      return localTransactionPage(stateRef.current, { limit: safeLimit, cursor, filter, query, period, accountId, categoryId });
    }

    if (pendingTransactionCount > 0) {
      const pendingItems = (await readQueue(userId)).filter(isTransactionQueueItem);
      const expandedLimit = Math.min(100, safeLimit + pendingItems.length * 2 + 1);
      const remotePage = await remoteTransactionPage(client, { limit: expandedLimit, cursor, filter, query, period, accountId, categoryId });
      const combined = applyPendingTransactionQueue([...remotePage.items, ...remotePage.related], pendingItems)
        .filter((transaction) => transactionMatches(transaction, stateRef.current.categories, filter, query))
        .filter((transaction) => transactionIsInDateRange(transaction, period))
        .filter((transaction) => transactionMatchesScope(transaction, stateRef.current, accountId, categoryId))
        .filter((transaction) => isAfterCursor(transaction, cursor))
        .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      const items = combined.filter((transaction) => transaction.kind !== "transfer_in").slice(0, safeLimit);
      const transferGroups = new Set(items.map((transaction) => transaction.transferGroupId).filter(Boolean));
      const related = combined.filter((transaction) => transaction.kind === "transfer_in" && transaction.transferGroupId && transferGroups.has(transaction.transferGroupId));
      const last = items.at(-1);
      return {
        items,
        related,
        hasMore: remotePage.hasMore || combined.filter((transaction) => transaction.kind !== "transfer_in").length > safeLimit,
        nextCursor: last ? { occurredOn: last.occurredOn, createdAt: last.createdAt, id: last.id } : null,
        source: "local",
      };
    }

    const expectedRevision = await readLocalRevision(userId);
    const page = await remoteTransactionPage(client, { limit: safeLimit, cursor, filter, query, period, accountId, categoryId });
    const incoming = [...page.items, ...page.related];
    await cacheState(
      (current) => ({ ...current, transactions: mergeTransactions(current.transactions, incoming) }),
      {
        expectedRevision,
        staleUpdater: (current) => {
          const existingIds = new Set(current.transactions.map((transaction) => transaction.id));
          return { ...current, transactions: [...current.transactions, ...incoming.filter((transaction) => !existingIds.has(transaction.id))] };
        },
      },
    );
    return page;
  }, [cacheState, pendingTransactionCount, userId]);

  const exportTransactions = useCallback(async ({ filter = "all", query = "", monthStart, dateFrom, dateTo, accountId, categoryId }: Omit<TransactionQueryOptions, "limit" | "cursor"> = {}) => {
    const client = createClient();
    const requiresRemoteExport = Boolean(client && userId && userId !== "demo");
    if (requiresRemoteExport && (!navigator.onLine || pendingTransactionCount > 0)) {
      throw new Error("Conéctate y sincroniza los movimientos pendientes antes de crear una exportación completa.");
    }
    const period = dateFrom || dateTo ? transactionDateBounds(dateFrom, dateTo) : transactionMonthBounds(monthStart);
    const exported: Transaction[] = [];
    const seen = new Set<string>();
    let cursor: TransactionCursor | null = null;
    let complete = false;
    for (let pageNumber = 0; pageNumber < 10000; pageNumber += 1) {
      const page: TransactionPage = requiresRemoteExport
        ? await remoteTransactionPage(client!, { limit: 100, cursor, filter, query, period, accountId, categoryId })
        : localTransactionPage(stateRef.current, { limit: 100, cursor, filter, query, period, accountId, categoryId });
      for (const transaction of [...page.items, ...page.related]) {
        if (!seen.has(transaction.id)) {
          seen.add(transaction.id);
          exported.push(transaction);
        }
      }
      if (!page.hasMore || !page.nextCursor) {
        complete = true;
        break;
      }
      cursor = page.nextCursor;
    }
    if (!complete) throw new Error("La exportación superó el límite de seguridad y no se generó para evitar un archivo incompleto.");
    return exported.sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }, [pendingTransactionCount, userId]);

  const getFinanceReport = useCallback(async (requestedEndMonth?: string, months = 12): Promise<FinanceReport> => {
    const endMonth = requestedEndMonth ?? currentMonthStart(new Date(), stateRef.current.profile?.timezone);
    const client = createClient();
    if (!client || !userId || userId === "demo" || !navigator.onLine) {
      return fallbackReport(stateRef.current, endMonth, months, localReportCoverage(userId));
    }
    const { data, error } = await client.rpc("get_finance_report", { p_end_month: endMonth, p_months: months });
    if (error) throw error;
    const report = data as ReportRow;
    const base: FinanceReport = {
      startMonth: report.startMonth,
      endMonth: report.endMonth,
      months: (report.months ?? []).map((month) => ({ month: month.month, income: Number(month.income), expense: Number(month.expense), balance: Number(month.balance) })),
      groups: (report.groups ?? []).map((group) => ({ group: group.group, name: group.name, color: group.color, expense: Number(group.expense), targetPercent: Number(group.targetPercent), includedInPlan: group.includedInPlan, archived: group.archived })),
      source: "remote",
      coverage: "complete",
    };
    if (pendingTransactionCount === 0) return base;
    const pendingItems = (await readQueue(userId)).filter(isTransactionQueueItem);
    if (!pendingItems.length) return base;
    const remoteAffected = await fetchRemoteTransactionsForPending(client, pendingItems);
    return overlayPendingTransactionsOnReport(base, stateRef.current, remoteAffected, pendingItems);
  }, [pendingTransactionCount, userId]);

  const getDetailedFinanceReport = useCallback(async (input: ReportQuery): Promise<DetailedFinanceReport> => {
    const query = normalizeReportQuery(input);
    const client = createClient();
    if (!client || !userId || userId === "demo" || !navigator.onLine) {
      return buildDetailedFinanceReport(stateRef.current, query, localReportCoverage(userId));
    }
    if (pendingTransactionCount > 0) {
      throw new Error("Sincroniza tus movimientos pendientes para calcular un reporte exacto.");
    }
    const comparison = reportComparisonRange(query);
    const { data, error } = await client.rpc("get_detailed_finance_report_v3", {
      p_start_date: query.startDate,
      p_end_date: query.endDate,
      p_months: query.preset === "months" ? query.selectedMonths.map((month) => `${month}-01`) : undefined,
      p_granularity: query.granularity,
      p_kind: query.kind,
      p_group_keys: query.groupKeys.length ? query.groupKeys : undefined,
      p_category_ids: query.categoryIds.length ? query.categoryIds : undefined,
      p_income_type_ids: query.incomeTypeIds.length ? query.incomeTypeIds : undefined,
      p_account_ids: query.accountIds.length ? query.accountIds : undefined,
      p_query: query.search,
      p_comparison_start: comparison?.startDate,
      p_comparison_end: comparison?.endDate,
    });
    if (error) throw error;
    return detailedFinanceReportFromRpc(data);
  }, [pendingTransactionCount, userId]);

  const exportReportTransactions = useCallback(async (input: ReportQuery) => {
    const query = normalizeReportQuery(input);
    const client = createClient();
    const remote = Boolean(client && userId && userId !== "demo");
    if (remote && (!navigator.onLine || pendingTransactionCount > 0)) {
      throw new Error("Conéctate y sincroniza tus movimientos antes de crear un Excel completo.");
    }
    if (!remote) {
      return stateRef.current.transactions
        .filter((item) => item.kind !== "transfer_in" && transactionMatchesReportQuery(item, stateRef.current, query))
        .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    }
    const rows: Transaction[] = [];
    const seen = new Set<string>();
    let cursor: TransactionCursor | null = null;
    let complete = false;
    const exclusiveEnd = new Date(`${query.endDate}T00:00:00Z`);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    for (let pageNumber = 0; pageNumber < 10_000; pageNumber += 1) {
      const page = await remoteTransactionPage(client!, {
        limit: 100,
        cursor,
        filter: query.kind,
        query: query.search,
        period: { start: query.startDate, end: exclusiveEnd.toISOString().slice(0, 10), key: `${query.startDate}:${query.endDate}` },
      });
      for (const transaction of [...page.items, ...page.related]) {
        if (transaction.kind !== "transfer_in" && !seen.has(transaction.id) && transactionMatchesReportQuery(transaction, stateRef.current, query)) {
          seen.add(transaction.id);
          rows.push(transaction);
        }
      }
      if (!page.hasMore || !page.nextCursor) { complete = true; break; }
      cursor = page.nextCursor;
    }
    if (!complete) throw new Error("El reporte superó el límite de seguridad y no se exportó para evitar un archivo incompleto.");
    return rows.sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }, [pendingTransactionCount, userId]);

  const getMonthlyBudgetPlan = useCallback(async (month: string): Promise<MonthlyBudgetPlanData> => {
    if (!/^\d{4}-\d{2}-01$/.test(month)) throw new Error("El mes del presupuesto no es válido.");
    const current = stateRef.current;
    if (current.budgetMonthsLoaded.includes(month)) return localMonthlyBudgetPlan(current, month, "complete");
    const client = createClient();
    if (!client || !userId || userId === "demo" || !navigator.onLine) {
      return localMonthlyBudgetPlan(current, month, userId === "demo" ? "complete" : "partial");
    }
    const { data, error } = await client.rpc("get_monthly_budget_plan", { p_month: month });
    if (error) throw error;
    const payload = (data ?? {}) as {
      plan?: { month?: string; incomeTarget?: number | string; source?: BudgetPlanSource } | null;
      budgets?: Array<{ id: string; categoryId: string; month: string; amount: number | string }>;
    };
    const plan = payload.plan?.month && payload.plan.source
      ? { month: payload.plan.month, incomeTarget: Number(payload.plan.incomeTarget ?? 0), source: payload.plan.source } satisfies MonthlyBudgetPlan
      : null;
    const budgets = (payload.budgets ?? []).map((budget) => ({ id: budget.id, categoryId: budget.categoryId, month: budget.month, amount: Number(budget.amount) }));
    await cacheState((state) => ({
      ...state,
      budgets: [...state.budgets.filter((budget) => budget.month !== month), ...budgets],
      monthlyBudgetPlans: [...state.monthlyBudgetPlans.filter((candidate) => candidate.month !== month), ...(plan ? [plan] : [])],
      budgetMonthsLoaded: Array.from(new Set([...state.budgetMonthsLoaded, month])),
    }));
    return { plan, budgets, coverage: "complete", source: "remote" };
  }, [cacheState, userId]);

  const getPlanSimulationSeed = useCallback(async (month: string): Promise<PlanSimulationSeed> => {
    if (!/^\d{4}-\d{2}-01$/.test(month)) throw new Error("El mes de la simulación no es válido.");
    const client = createClient();
    if (!client || !userId || userId === "demo" || !navigator.onLine) {
      return localPlanSimulationSeed(stateRef.current, month, userId === "demo" ? "complete" : "partial");
    }
    const { data, error } = await client.rpc("get_plan_simulation_seed", { p_month: month });
    if (error) throw error;
    const payload = (data ?? {}) as {
      month?: string;
      incomeTarget?: number | string;
      actualIncome?: number | string;
      mainCategories?: Array<{
        id: string; group: string; name: string; color: string; icon: string; targetPercent: number | string;
        includedInPlan: boolean; sortOrder: number; archived?: boolean; isDefault?: boolean;
      }>;
      categories?: Array<{
        id: string; name: string; group: string; color: string; icon: string; sortOrder: number;
        archived?: boolean; budget: number | string; spent: number | string;
      }>;
    };
    const remoteSeed: PlanSimulationSeed = {
      month: payload.month ?? month,
      incomeTarget: Number(payload.incomeTarget ?? 0),
      actualIncome: Number(payload.actualIncome ?? 0),
      mainCategories: (payload.mainCategories ?? []).map((category) => ({ ...category, targetPercent: Number(category.targetPercent) })),
      categories: (payload.categories ?? []).map((category) => ({ ...category, budget: Number(category.budget), spent: Number(category.spent) })),
      source: "remote",
      coverage: "complete",
    };
    if (!stateRef.current.budgetMonthsLoaded.includes(month)) return remoteSeed;
    const local = localPlanSimulationSeed(stateRef.current, month, "complete");
    const localBudget = new Map(local.categories.map((category) => [category.id, category.budget]));
    return {
      ...remoteSeed,
      incomeTarget: local.incomeTarget,
      categories: remoteSeed.categories.map((category) => ({ ...category, budget: localBudget.get(category.id) ?? category.budget })),
      source: "local",
    };
  }, [userId]);

  const mutate = useMemo<FinanceMutationApi>(() => ({
    addTransaction,
    importTransactions,
    importPlanner,
    updateTransaction,
    deleteTransaction,
    upsertRecurringRule,
    archiveRecurringRule,
    updateRecurringOccurrence,
    upsertFinancialTarget,
    setFinancialTargetStatus,
    upsertFinancialTargetEntry,
    deleteFinancialTargetEntry,
    addAccount,
    updateAccount,
    addCategory,
    importCategories,
    importIncomeTypes,
    upsertCategory,
    archiveCategory,
    upsertIncomeType,
    archiveIncomeType,
    upsertFinanceGroup,
    archiveFinanceGroup,
    updateBudget,
    setMonthlyBudgetPlan,
    updateCategoryOrder,
    updateProfile,
    updateGroupAllocations,
  }), [addTransaction, importTransactions, importPlanner, updateTransaction, deleteTransaction, upsertRecurringRule, archiveRecurringRule, updateRecurringOccurrence, upsertFinancialTarget, setFinancialTargetStatus, upsertFinancialTargetEntry, deleteFinancialTargetEntry, addAccount, updateAccount, addCategory, importCategories, importIncomeTypes, upsertCategory, archiveCategory, upsertIncomeType, archiveIncomeType, upsertFinanceGroup, archiveFinanceGroup, updateBudget, setMonthlyBudgetPlan, updateCategoryOrder, updateProfile, updateGroupAllocations]);

  const compatibleMutations = useMemo(() => ({
    addTransaction: async (input: TransactionInput) => { await mutate.addTransaction(input); },
    updateTransaction: async (id: string, input: TransactionInput) => { await mutate.updateTransaction(id, input); },
    deleteTransaction: async (id: string, transferGroupId?: string, knownRows?: Transaction[]) => { await mutate.deleteTransaction(id, transferGroupId, knownRows); },
    addAccount: async (account: Omit<Account, "id">) => { await mutate.addAccount(account); },
    updateAccount: async (input: AccountUpdateInput) => { await mutate.updateAccount(input); },
    addCategory: async (category: Omit<Category, "id">) => { await mutate.addCategory(category); },
    upsertCategory: async (category: CategoryInput) => { await mutate.upsertCategory(category); },
    archiveCategory: async (id: string) => { await mutate.archiveCategory(id); },
    upsertIncomeType: async (incomeType: IncomeTypeInput) => { await mutate.upsertIncomeType(incomeType); },
    archiveIncomeType: async (id: string) => { await mutate.archiveIncomeType(id); },
    upsertFinanceGroup: async (group: FinanceGroupInput) => { await mutate.upsertFinanceGroup(group); },
    archiveFinanceGroup: async (input: ArchiveFinanceGroupInput) => { await mutate.archiveFinanceGroup(input); },
    updateBudget: async (categoryId: string, amount: number) => { await mutate.updateBudget(categoryId, amount); },
    setMonthlyBudgetPlan: async (input: MonthlyBudgetPlanInput) => { await mutate.setMonthlyBudgetPlan(input); },
    updateCategoryOrder: async (groupKey: string, positions: CategoryOrderWrite[]) => { await mutate.updateCategoryOrder(groupKey, positions); },
    updateProfile: async (profile: ProfileInput) => { await mutate.updateProfile(profile); },
    updateGroupAllocations: async (allocations: GroupAllocationWrite[]) => { await mutate.updateGroupAllocations(allocations); },
  }), [mutate]);

  const value = useMemo(() => ({
    ...state,
    hydrated,
    dataStatus,
    dataSource,
    online,
    syncing,
    pendingCount,
    syncError,
    currentMonth: currentMonthStart(new Date(), state.profile?.timezone),
    mutate,
    ...compatibleMutations,
    listTransactions,
    exportTransactions,
    getFinanceReport,
    getDetailedFinanceReport,
    exportReportTransactions,
    getMonthlyBudgetPlan,
    getPlanSimulationSeed,
    loadFinancialTargetEntries,
    uploadFinancialTargetCover,
    getFinancialTargetCoverUrl,
    syncNow,
    prepareSignOut,
    cancelPreparedSignOut,
    completeSignOut,
  }), [state, hydrated, dataStatus, dataSource, online, syncing, pendingCount, syncError, mutate, compatibleMutations, listTransactions, exportTransactions, getFinanceReport, getDetailedFinanceReport, exportReportTransactions, getMonthlyBudgetPlan, getPlanSimulationSeed, loadFinancialTargetEntries, uploadFinancialTargetCover, getFinancialTargetCoverUrl, syncNow, prepareSignOut, cancelPreparedSignOut, completeSignOut]);

  return <FinanceContext.Provider value={value}>
    {dataStatus === "ready" ? children : null}
    {startupGateVisible ? <FinanceDataGate status={dataStatus === "ready" ? "loading" : dataStatus} error={bootstrapError} exiting={dataStatus === "ready"} onExitComplete={() => setStartupGateVisible(false)} /> : null}
  </FinanceContext.Provider>;
}

function FinanceDataGate({ status, error, exiting, onExitComplete }: { status: Exclude<FinanceDataStatus, "ready">; error: string | null; exiting: boolean; onExitComplete: () => void }) {
  const unavailable = status === "unavailable";
  return <AppStartupScreen state={unavailable ? "unavailable" : "loading"} error={error} onRetry={unavailable ? () => window.location.reload() : undefined} exiting={exiting} onExitComplete={onExitComplete} />;
}

function identityFromUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): FinanceIdentity {
  const email = user.email ?? "";
  const metadata = user.user_metadata ?? {};
  const text = (value: unknown) => typeof value === "string" ? value : "";
  return {
    id: user.id,
    email,
    displayName: text(metadata.full_name) || text(metadata.name) || email.split("@")[0] || "Usuario",
    avatarUrl: text(metadata.avatar_url) || text(metadata.picture) || undefined,
  };
}

function buildTransactions(input: TransactionInput, accounts: Account[], reportingCurrency = "COP"): Transaction[] {
  const now = new Date().toISOString();
  const status: Transaction["syncStatus"] = createClient() ? "pending" : "synced";
  const sourceAccount = accounts.find((account) => account.id === input.accountId);
  if (!sourceAccount) throw new Error("La cuenta seleccionada ya no está disponible.");
  const sourceCurrency = sourceAccount.currencyCode ?? reportingCurrency;
  const rateFor = (currency: string) => {
    if (currency === reportingCurrency) return 1;
    if (!input.exchangeRate || input.exchangeRate <= 0) throw new Error("Necesitamos una tasa de cambio válida para este movimiento.");
    return input.exchangeRate;
  };
  const sourceRate = rateFor(sourceCurrency);
  const commonFx = (currency: string, amount: number) => ({
    nativeCurrencyCode: currency,
    baseCurrencyCode: reportingCurrency,
    baseAmount: amount * rateFor(currency),
    exchangeRate: rateFor(currency),
    exchangeRateDate: input.exchangeRateDate ?? input.occurredOn,
    exchangeRateSource: currency === reportingCurrency ? "same_currency" as const : input.exchangeRateSource ?? "manual" as const,
    referenceExchangeRate: input.referenceExchangeRate,
    referenceRateSource: input.referenceRateSource,
  });
  if (input.type === "transfer" && input.destinationAccountId) {
    const destinationAccount = accounts.find((account) => account.id === input.destinationAccountId);
    if (!destinationAccount) throw new Error("La cuenta de destino ya no está disponible.");
    const destinationCurrency = destinationAccount.currencyCode ?? reportingCurrency;
    const destinationRate = rateFor(destinationCurrency);
    const destinationAmount = sourceCurrency === destinationCurrency
      ? input.amount
      : input.destinationAmount ?? (input.amount * sourceRate) / destinationRate;
    const groupId = uid();
    const transferRows: Transaction[] = [
      { id: uid(), kind: "transfer_out", amount: input.amount, accountId: input.accountId, transferGroupId: groupId, description: input.description || "Transferencia", merchant: input.merchant, note: input.note, icon: input.icon ?? "transfer", occurredOn: input.occurredOn, createdAt: now, syncStatus: status, ...commonFx(sourceCurrency, input.amount) },
      { id: uid(), kind: "transfer_in", amount: destinationAmount, accountId: input.destinationAccountId, transferGroupId: groupId, financialTargetId: input.financialTargetId, financialTargetEffect: input.financialTargetEffect, description: input.description || "Transferencia", merchant: input.merchant, note: input.note, icon: input.icon ?? "transfer", occurredOn: input.occurredOn, createdAt: now, syncStatus: status, ...commonFx(destinationCurrency, destinationAmount) },
    ];
    if (input.feeAmount && input.feeAmount > 0) transferRows.push({
      id: uid(), kind: "expense", amount: input.feeAmount, accountId: input.accountId,
      description: "Comisión de cambio", note: input.description || "Transferencia entre monedas",
      icon: "receipt", occurredOn: input.occurredOn, createdAt: now, syncStatus: status,
      ...commonFx(sourceCurrency, input.feeAmount),
    });
    return transferRows;
  }
  return [{
    id: uid(),
    kind: input.type === "income" ? "income" : "expense",
    amount: input.amount,
    accountId: input.accountId,
    categoryId: input.categoryId,
    financialTargetId: input.financialTargetId,
    financialTargetEffect: input.financialTargetEffect,
    description: input.description || (input.type === "income" ? "Ingreso" : "Gasto"),
    merchant: input.merchant,
    note: input.note,
    icon: input.icon,
    occurredOn: input.occurredOn,
    createdAt: now,
    syncStatus: status,
    ...commonFx(sourceCurrency, input.amount),
  }];
}

function buildUpdatedTransfer(existing: Transaction[], input: TransactionInput, accounts: Account[], reportingCurrency = "COP"): Transaction[] {
  const outgoing = existing.find((transaction) => transaction.kind === "transfer_out");
  const incoming = existing.find((transaction) => transaction.kind === "transfer_in");
  if (!outgoing || !incoming || !input.destinationAccountId) throw new Error("La transferencia está incompleta.");
  const [nextOutgoing, nextIncoming] = buildTransactions(input, accounts, reportingCurrency);
  return [
    { ...outgoing, ...nextOutgoing, id: outgoing.id, transferGroupId: outgoing.transferGroupId, ledgerEventId: outgoing.ledgerEventId },
    { ...incoming, ...nextIncoming, id: incoming.id, transferGroupId: incoming.transferGroupId, ledgerEventId: incoming.ledgerEventId },
  ];
}

function validateTransactionWrite(input: TransactionInput) {
  assertFinanceAmount(input.amount);
  cleanRequiredText(input.description, "La descripción", 200);
  assertOptionalText(input.merchant, "El comercio", 120);
  assertOptionalText(input.note, "La nota", 1000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) throw new Error("La fecha del movimiento no es válida.");
  if (input.type === "transfer" && (!input.destinationAccountId || input.destinationAccountId === input.accountId)) {
    throw new Error("Selecciona dos cuentas diferentes para la transferencia.");
  }
  if (input.type !== "transfer" && !input.categoryId) throw new Error("Selecciona una categoría.");
  if (Boolean(input.financialTargetId) !== Boolean(input.financialTargetEffect)) throw new Error("La relación con la meta está incompleta.");
}

function validateFinancialTargetWrite(input: FinancialTargetInput) {
  cleanRequiredText(input.title, "El nombre de la meta", 100);
  assertOptionalText(input.description, "La descripción", 600);
  assertFinanceAmount(input.targetAmount, { label: "El monto objetivo" });
  assertFinanceAmount(input.initialProgress, { allowZero: true, label: "El avance inicial" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startsOn)) throw new Error("La fecha de inicio no es válida.");
  if (input.targetDate && (!/^\d{4}-\d{2}-\d{2}$/.test(input.targetDate) || input.targetDate < input.startsOn)) throw new Error("La fecha objetivo debe ser posterior al inicio.");
  if (!Number.isInteger(input.priority) || input.priority < 1 || input.priority > 5) throw new Error("La prioridad debe estar entre 1 y 5.");
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) throw new Error("El color de la meta no es válido.");
  if (!/^(brand:|bank:)?[a-z0-9-]{1,80}$/.test(input.icon)) throw new Error("El ícono de la meta no es válido.");
  if ((input.kind === "debt") !== (input.mode === "pay_down")) throw new Error("Las deudas deben usar el modo de pago; las demás metas acumulan ahorro.");
  if (input.kind === "debt" && input.debt) {
    assertOptionalText(input.debt.creditor, "El acreedor", 120);
    if (input.debt.annualInterestRate !== undefined && (!Number.isFinite(input.debt.annualInterestRate) || input.debt.annualInterestRate < 0 || input.debt.annualInterestRate > 1000)) throw new Error("La tasa anual no es válida.");
    if (input.debt.minimumPayment !== undefined) assertFinanceAmount(input.debt.minimumPayment, { allowZero: true, label: "El pago mínimo" });
    if (input.debt.dueDay !== undefined && (!Number.isInteger(input.debt.dueDay) || input.debt.dueDay < 1 || input.debt.dueDay > 31)) throw new Error("El día de pago no es válido.");
  }
}

export function validateAllocationsWrite(allocations: GroupAllocationWrite[]) {
  const groups = new Set<string>();
  for (const allocation of allocations) {
    cleanRequiredText(allocation.group, "El identificador de la categoría principal", 64);
    if (groups.has(allocation.group)) throw new Error("Cada categoría principal debe aparecer una sola vez en el plan.");
    groups.add(allocation.group);
    if (!Number.isFinite(allocation.targetPercent) || allocation.targetPercent < 0 || allocation.targetPercent > 100) throw new Error("Cada porcentaje debe estar entre 0 y 100.");
    if (Math.round(allocation.targetPercent * 100) !== allocation.targetPercent * 100) throw new Error("Los porcentajes admiten máximo dos decimales.");
    if (!Number.isInteger(allocation.sortOrder) || allocation.sortOrder < 0 || allocation.sortOrder > 1000) throw new Error("El orden de la categoría principal no es válido.");
    if (!allocation.includedInPlan && allocation.targetPercent !== 0) throw new Error("Las categorías principales excluidas deben quedar en 0%.");
  }
  const included = allocations.filter((allocation) => allocation.includedInPlan);
  const total = included.reduce((sum, allocation) => sum + allocation.targetPercent, 0);
  if (included.length === 0 && total !== 0) throw new Error("Un plan sin categorías principales incluidas debe sumar 0%.");
  if (included.length > 0 && Math.abs(total - 100) > 0.001) throw new Error("Las categorías principales incluidas deben sumar exactamente 100%.");
}

export function validateArchiveFinanceGroupWrite(input: ArchiveFinanceGroupInput, state: FinanceState) {
  validateAllocationsWrite(input.allocations);
  const activeGroups = state.groupAllocations.filter((group) => !group.archived);
  const activeKeys = new Set(activeGroups.map((group) => group.group));
  const allocationKeys = new Set(input.allocations.map((allocation) => allocation.group));

  if (!activeKeys.has(input.groupKey)) throw new Error("No encontramos la categoría principal que quieres archivar.");
  if (activeGroups.length <= 1) throw new Error("Tu estructura debe conservar al menos una categoría principal.");
  if (input.allocations.length !== activeGroups.length || activeGroups.some((group) => !allocationKeys.has(group.group))) {
    throw new Error("La redistribución debe incluir cada categoría principal activa exactamente una vez.");
  }

  const sourceAllocation = input.allocations.find((allocation) => allocation.group === input.groupKey);
  if (!sourceAllocation || sourceAllocation.includedInPlan || sourceAllocation.targetPercent !== 0) {
    throw new Error("La categoría principal archivada debe quedar fuera del reparto y en 0%.");
  }
  if (input.destinationGroupKey && input.archiveCategories) {
    throw new Error("Elige entre mover o archivar las subcategorías, no ambas acciones.");
  }
  if (input.destinationGroupKey && (input.destinationGroupKey === input.groupKey || !activeKeys.has(input.destinationGroupKey))) {
    throw new Error("La categoría principal de destino no está disponible.");
  }

  const hasActiveCategories = state.categories.some((category) => category.kind === "expense" && !category.archived && category.group === input.groupKey);
  if (hasActiveCategories && !input.destinationGroupKey && !input.archiveCategories) {
    throw new Error("Mueve o archiva las subcategorías antes de archivar esta categoría principal.");
  }
}

export function applyFinanceGroupArchive(state: FinanceState, input: ArchiveFinanceGroupInput): FinanceState {
  const allocationByGroup = new Map(input.allocations.map((allocation) => [allocation.group, allocation]));
  return {
    ...state,
    groupAllocations: state.groupAllocations.map((group) => {
      const allocation = allocationByGroup.get(group.group);
      if (group.group === input.groupKey) {
        return { ...group, ...allocation, archived: true, includedInPlan: false, targetPercent: 0 };
      }
      return allocation ? { ...group, ...allocation } : group;
    }),
    categories: state.categories.map((category) => {
      if (category.kind !== "expense" || category.group !== input.groupKey || category.archived) return category;
      if (input.destinationGroupKey) return { ...category, group: input.destinationGroupKey };
      return input.archiveCategories ? { ...category, archived: true } : category;
    }),
  };
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) throw new Error("useFinance debe usarse dentro de FinanceProvider");
  return context;
}
