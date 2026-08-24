"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useTheme } from "next-themes";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { demoFinanceState } from "@/lib/finance/demo-data";
import { currentMonthStart } from "@/lib/finance/calculations";
import type {
  Account,
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
  FinanceProfile,
  FinanceSnapshot,
  FinanceState,
  GroupAllocation,
  GroupAllocationWrite,
  IncomeTypeInput,
  MonthlyBudgetPlan,
  MonthlyBudgetPlanData,
  MonthlyBudgetPlanInput,
  PlanSimulationSeed,
  ProfileInput,
  QueueItem,
  RecurringOccurrence,
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
import { activateLocalFinanceData, readLocalRevision, readLocalState, readQueue, removeQueueItem, resumeLocalFinanceData, suspendLocalFinanceData, updateLocalState, updateQueueItem, withBrowserLock, writeLocalMutation, writeLocalState } from "@/lib/offline-db";
import { createClient } from "@/lib/supabase/client";

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

type ProfileRow = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  currency_code: string;
  timezone: string;
  week_starts_on: number;
  month_starts_on: number;
  theme_mode: FinanceProfile["themeMode"];
  color_theme: FinanceProfile["colorTheme"];
};
type AccountRow = { id: string; name: string; account_type: Account["type"]; initial_balance: number | string; color: string; icon: string; archived: boolean };
type CategoryRow = { id: string; name: string; category_group: Category["group"]; transaction_kind: Category["kind"]; color: string; icon: string; is_default: boolean; archived: boolean; sort_order: number };
type BudgetRow = { id: string; category_id: string; month: string; amount: number | string };
type MonthlyBudgetPlanRow = { month: string; income_target: number | string; source: BudgetPlanSource };
type AllocationRow = { id: string; group_key: GroupAllocation["group"]; name: string; color: string; icon: string; target_percent: number | string; included_in_plan: boolean; sort_order: number; archived: boolean; is_default: boolean };
type TransactionRow = { id: string; kind: Transaction["kind"]; amount: number | string; account_id: string; category_id: string | null; transfer_group_id: string | null; recurring_occurrence_id: string | null; financial_target_id: string | null; financial_target_effect: Transaction["financialTargetEffect"] | null; description: string; merchant: string | null; note: string | null; icon: string | null; occurred_on: string; created_at: string };
type RecurringRuleRow = {
  id: string; kind: RecurringRule["kind"]; amount: number | string; account_id: string; destination_account_id: string | null;
  category_id: string | null; financial_target_id: string | null; financial_target_effect: RecurringRule["financialTargetEffect"] | null; description: string; merchant: string | null; note: string | null; icon: string | null;
  cadence: RecurringRule["cadence"]; interval_count: number; starts_on: string; ends_on: string | null;
  anchor_day: number | null; weekday: number | null; posting_policy: RecurringRule["postingPolicy"]; timezone: string;
  auto_post: boolean; include_in_budget: boolean; include_in_income_target: boolean; status: RecurringRule["status"];
  next_run_on: string | null; created_at: string; updated_at: string;
};
type RecurringOccurrenceRow = {
  id: string; rule_id: string; kind: RecurringOccurrence["kind"]; scheduled_on: string; effective_on: string;
  amount: number | string; account_id: string; destination_account_id: string | null; category_id: string | null; financial_target_id: string | null; financial_target_effect: RecurringOccurrence["financialTargetEffect"] | null;
  description: string; merchant: string | null; note: string | null; icon: string | null;
  status: RecurringOccurrence["status"]; transaction_id: string | null; transfer_group_id: string | null;
  failure_reason: string | null; posted_at: string | null; created_at: string;
};
type FinancialTargetRow = {
  id: string; mode: FinancialTarget["mode"]; kind: FinancialTarget["kind"]; status: FinancialTarget["status"];
  title: string; description: string | null; target_amount: number | string; initial_progress: number | string;
  progress_amount: number | string; starts_on: string; target_date: string | null; priority: number; color: string;
  icon: string; cover_path: string | null; account_id: string | null; category_id: string | null;
  tracking_mode: FinancialTarget["trackingMode"]; created_at: string; updated_at: string;
  completed_at: string | null; archived_at: string | null;
};
type FinancialTargetEntryRow = {
  id: string; target_id: string; kind: FinancialTargetEntry["kind"]; effect: FinancialTargetEntry["effect"];
  amount: number | string; occurred_on: string; note: string | null; created_at: string;
};
type FinancialTargetDebtRow = {
  target_id: string; creditor: string | null; annual_interest_rate: number | string | null;
  minimum_payment: number | string | null; due_day: number | null;
};
type SnapshotRow = { month: string; income: number | string; expense: number | string; accountBalances: Record<string, number | string>; categorySpending: Record<string, number | string> };
type TransactionPageRow = TransactionRow & { transfer_pair?: TransactionRow | null };
type TransactionPageRowResult = { items?: TransactionPageRow[]; hasMore?: boolean; nextCursor?: TransactionCursor | null };
type ReportRow = {
  startMonth: string;
  endMonth: string;
  months: Array<{ month: string; income: number | string; expense: number | string; balance: number | string }>;
  groups: Array<{ group: string; name: string; color: string; expense: number | string; targetPercent: number | string; includedInPlan: boolean; archived: boolean }>;
};
type TransactionPayload = { transactions: Transaction[]; input: TransactionInput };
type TransactionImportPayload = { transactions: Transaction[] };

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  return Array.from(new Map(items.map((item) => [key(item), item])).values());
}

function normalizeFinanceState(state: FinanceState): FinanceState {
  return {
    ...state,
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

function profileFromRow(row: ProfileRow): FinanceProfile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name?.trim() || row.email.split("@")[0] || "Usuario",
    avatarUrl: row.avatar_url ?? undefined,
    currencyCode: row.currency_code,
    timezone: row.timezone,
    weekStartsOn: row.week_starts_on,
    monthStartsOn: row.month_starts_on,
    themeMode: row.theme_mode,
    colorTheme: row.color_theme,
  };
}

function transactionFromRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    kind: row.kind,
    amount: Number(row.amount),
    accountId: row.account_id,
    categoryId: row.category_id ?? undefined,
    transferGroupId: row.transfer_group_id ?? undefined,
    recurringOccurrenceId: row.recurring_occurrence_id ?? undefined,
    financialTargetId: row.financial_target_id ?? undefined,
    financialTargetEffect: row.financial_target_effect ?? undefined,
    description: row.description,
    merchant: row.merchant ?? undefined,
    note: row.note ?? undefined,
    icon: row.icon ?? undefined,
    occurredOn: row.occurred_on,
    createdAt: row.created_at,
    syncStatus: "synced",
  };
}

function recurringRuleFromRow(row: RecurringRuleRow): RecurringRule {
  return {
    id: row.id, kind: row.kind, amount: Number(row.amount), accountId: row.account_id,
    destinationAccountId: row.destination_account_id ?? undefined, categoryId: row.category_id ?? undefined,
    financialTargetId: row.financial_target_id ?? undefined, financialTargetEffect: row.financial_target_effect ?? undefined,
    description: row.description, merchant: row.merchant ?? undefined, note: row.note ?? undefined, icon: row.icon ?? undefined,
    cadence: row.cadence, intervalCount: row.interval_count, startsOn: row.starts_on, endsOn: row.ends_on ?? undefined,
    anchorDay: row.anchor_day ?? undefined, weekday: row.weekday ?? undefined, postingPolicy: row.posting_policy,
    timezone: row.timezone, autoPost: row.auto_post, includeInBudget: row.include_in_budget,
    includeInIncomeTarget: row.include_in_income_target, status: row.status, nextRunOn: row.next_run_on ?? undefined,
    createdAt: row.created_at, updatedAt: row.updated_at, syncStatus: "synced",
  };
}

function recurringOccurrenceFromRow(row: RecurringOccurrenceRow): RecurringOccurrence {
  return {
    id: row.id, ruleId: row.rule_id, kind: row.kind, scheduledOn: row.scheduled_on, effectiveOn: row.effective_on,
    amount: Number(row.amount), accountId: row.account_id, destinationAccountId: row.destination_account_id ?? undefined,
    categoryId: row.category_id ?? undefined, description: row.description, merchant: row.merchant ?? undefined,
    financialTargetId: row.financial_target_id ?? undefined, financialTargetEffect: row.financial_target_effect ?? undefined,
    note: row.note ?? undefined, icon: row.icon ?? undefined, status: row.status,
    transactionId: row.transaction_id ?? undefined, transferGroupId: row.transfer_group_id ?? undefined,
    failureReason: row.failure_reason ?? undefined, postedAt: row.posted_at ?? undefined, createdAt: row.created_at,
  };
}

function financialTargetFromRow(row: FinancialTargetRow): FinancialTarget {
  return {
    id: row.id, mode: row.mode, kind: row.kind, status: row.status, title: row.title,
    description: row.description ?? undefined, targetAmount: Number(row.target_amount),
    initialProgress: Number(row.initial_progress), progressAmount: Number(row.progress_amount),
    startsOn: row.starts_on, targetDate: row.target_date ?? undefined, priority: row.priority,
    color: row.color, icon: row.icon, coverPath: row.cover_path ?? undefined,
    accountId: row.account_id ?? undefined, categoryId: row.category_id ?? undefined,
    trackingMode: row.tracking_mode, createdAt: row.created_at, updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined, archivedAt: row.archived_at ?? undefined,
    syncStatus: "synced",
  };
}

function financialTargetEntryFromRow(row: FinancialTargetEntryRow): FinancialTargetEntry {
  return {
    id: row.id, targetId: row.target_id, kind: row.kind, effect: row.effect, amount: Number(row.amount),
    occurredOn: row.occurred_on, note: row.note ?? undefined, createdAt: row.created_at, syncStatus: "synced",
  };
}

function financialTargetDebtFromRow(row: FinancialTargetDebtRow): FinancialTargetDebtDetails {
  return {
    targetId: row.target_id, creditor: row.creditor ?? undefined,
    annualInterestRate: row.annual_interest_rate === null ? undefined : Number(row.annual_interest_rate),
    minimumPayment: row.minimum_payment === null ? undefined : Number(row.minimum_payment),
    dueDay: row.due_day ?? undefined,
  };
}

function recurringRuleToRow(userId: string, rule: RecurringRule) {
  return {
    id: rule.id, user_id: userId, account_id: rule.accountId, destination_account_id: rule.destinationAccountId ?? null,
    category_id: rule.categoryId ?? null, financial_target_id: rule.financialTargetId ?? null,
    financial_target_effect: rule.financialTargetEffect ?? null, kind: rule.kind, amount: rule.amount, description: rule.description,
    merchant: rule.merchant ?? null, note: rule.note ?? null, icon: rule.icon ?? null, cadence: rule.cadence,
    interval_count: rule.intervalCount, starts_on: rule.startsOn, ends_on: rule.endsOn ?? null,
    anchor_day: rule.anchorDay ?? null, weekday: rule.weekday ?? null, posting_policy: rule.postingPolicy,
    timezone: rule.timezone, auto_post: rule.autoPost, include_in_budget: rule.includeInBudget,
    include_in_income_target: rule.includeInIncomeTarget, status: rule.status, active: rule.status === "active",
    next_run_on: rule.nextRunOn ?? rule.startsOn,
  };
}

function snapshotFromRow(row: SnapshotRow): FinanceSnapshot {
  return {
    month: row.month,
    income: Number(row.income),
    expense: Number(row.expense),
    accountBalances: Object.fromEntries(Object.entries(row.accountBalances ?? {}).map(([id, value]) => [id, Number(value)])),
    categorySpending: Object.fromEntries(Object.entries(row.categorySpending ?? {}).map(([id, value]) => [id, Number(value)])),
  };
}

function isoDateOffset(value: string, days: number) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function loadRemoteState(client: SupabaseClient): Promise<FinanceState> {
  const month = currentMonthStart();
  const scheduleStart = isoDateOffset(month, -45);
  const scheduleEnd = isoDateOffset(month, 430);
  const [profileResult, accountResult, categoryResult, initialBudgetResult, initialBudgetPlanResult, transactionResult, allocationResult, initialSnapshotResult, recurringRuleResult, recurringOccurrenceResult, financialTargetResult, financialTargetEntryResult, financialTargetDebtResult] = await Promise.all([
    client.from("profiles").select("id,email,display_name,avatar_url,currency_code,timezone,week_starts_on,month_starts_on,theme_mode,color_theme").maybeSingle(),
    client.from("accounts").select("id,name,account_type,initial_balance,color,icon,archived").eq("archived", false).order("created_at"),
    client.from("categories").select("id,name,category_group,transaction_kind,color,icon,is_default,archived,sort_order").order("archived").order("category_group").order("sort_order"),
    client.from("budgets").select("id,category_id,month,amount").eq("month", month).order("month"),
    client.from("monthly_budget_plans").select("month,income_target,source").eq("month", month).maybeSingle(),
    client.rpc("get_transactions_page", { p_limit: 50, p_cursor_occurred_on: null, p_cursor_created_at: null, p_cursor_id: null, p_kind: "all", p_query: "" }),
    client.from("group_allocations").select("id,group_key,name,color,icon,target_percent,included_in_plan,sort_order,archived,is_default").order("archived").order("sort_order"),
    client.rpc("get_finance_snapshot", { p_month: month }),
    client.from("recurring_rules").select("id,kind,amount,account_id,destination_account_id,category_id,financial_target_id,financial_target_effect,description,merchant,note,icon,cadence,interval_count,starts_on,ends_on,anchor_day,weekday,posting_policy,timezone,auto_post,include_in_budget,include_in_income_target,status,next_run_on,created_at,updated_at").neq("status", "archived").order("next_run_on"),
    client.from("recurring_occurrences").select("id,rule_id,kind,scheduled_on,effective_on,amount,account_id,destination_account_id,category_id,financial_target_id,financial_target_effect,description,merchant,note,icon,status,transaction_id,transfer_group_id,failure_reason,posted_at,created_at").gte("effective_on", scheduleStart).lte("effective_on", scheduleEnd).order("effective_on").order("id"),
    client.from("financial_target_overview").select("id,mode,kind,status,title,description,target_amount,initial_progress,progress_amount,starts_on,target_date,priority,color,icon,cover_path,account_id,category_id,tracking_mode,created_at,updated_at,completed_at,archived_at").order("status").order("priority").order("updated_at", { ascending: false }),
    client.from("financial_target_entries").select("id,target_id,kind,effect,amount,occurred_on,note,created_at").order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(500),
    client.from("financial_target_debt_details").select("target_id,creditor,annual_interest_rate,minimum_payment,due_day"),
  ]);
  const error = profileResult.error || accountResult.error || categoryResult.error || initialBudgetResult.error || initialBudgetPlanResult.error || transactionResult.error || allocationResult.error || initialSnapshotResult.error || recurringRuleResult.error || recurringOccurrenceResult.error || financialTargetResult.error || financialTargetEntryResult.error || financialTargetDebtResult.error;
  if (error) throw error;
  if (!profileResult.data) throw new Error("El perfil todavía no está disponible.");
  const profile = profileFromRow(profileResult.data as ProfileRow);
  const profileMonth = currentMonthStart(new Date(), profile.timezone);
  let budgetRows = initialBudgetResult.data;
  let budgetPlanRow = initialBudgetPlanResult.data;
  let snapshotRow = initialSnapshotResult.data;
  if (profileMonth !== month) {
    const [budgetResult, budgetPlanResult, snapshotResult] = await Promise.all([
      client.from("budgets").select("id,category_id,month,amount").eq("month", profileMonth).order("month"),
      client.from("monthly_budget_plans").select("month,income_target,source").eq("month", profileMonth).maybeSingle(),
      client.rpc("get_finance_snapshot", { p_month: profileMonth }),
    ]);
    if (budgetResult.error || budgetPlanResult.error || snapshotResult.error) throw budgetResult.error ?? budgetPlanResult.error ?? snapshotResult.error;
    budgetRows = budgetResult.data;
    budgetPlanRow = budgetPlanResult.data;
    snapshotRow = snapshotResult.data;
  }

  const transactionPayload = (transactionResult.data ?? {}) as TransactionPageRowResult;
  const transactionRows = transactionPayload.items ?? [];
  const relatedRows = transactionRows.flatMap((row) => row.transfer_pair ? [row.transfer_pair] : []);

  return {
    profile,
    accounts: ((accountResult.data ?? []) as AccountRow[]).map((row) => ({ id: row.id, name: row.name, type: row.account_type, initialBalance: Number(row.initial_balance), color: row.color, icon: row.icon, archived: row.archived })),
    categories: ((categoryResult.data ?? []) as CategoryRow[]).map((row) => ({ id: row.id, name: row.name, group: row.category_group, color: row.color, icon: row.icon, kind: row.transaction_kind, isDefault: row.is_default, archived: row.archived, sortOrder: row.sort_order })),
    budgets: ((budgetRows ?? []) as BudgetRow[]).map((row) => ({ id: row.id, categoryId: row.category_id, month: row.month, amount: Number(row.amount) })),
    monthlyBudgetPlans: budgetPlanRow ? [{ month: (budgetPlanRow as MonthlyBudgetPlanRow).month, incomeTarget: Number((budgetPlanRow as MonthlyBudgetPlanRow).income_target), source: (budgetPlanRow as MonthlyBudgetPlanRow).source }] : [],
    budgetMonthsLoaded: [profileMonth],
    groupAllocations: ((allocationResult.data ?? []) as AllocationRow[]).map((row) => ({ id: row.id, group: row.group_key, name: row.name, color: row.color, icon: row.icon, targetPercent: Number(row.target_percent), includedInPlan: row.included_in_plan, sortOrder: row.sort_order, archived: row.archived, isDefault: row.is_default })),
    transactions: [...transactionRows, ...relatedRows].map(transactionFromRow),
    recurringRules: ((recurringRuleResult.data ?? []) as RecurringRuleRow[]).map(recurringRuleFromRow),
    recurringOccurrences: ((recurringOccurrenceResult.data ?? []) as RecurringOccurrenceRow[]).map(recurringOccurrenceFromRow),
    financialTargets: ((financialTargetResult.data ?? []) as FinancialTargetRow[]).map(financialTargetFromRow),
    financialTargetEntries: ((financialTargetEntryResult.data ?? []) as FinancialTargetEntryRow[]).map(financialTargetEntryFromRow),
    financialTargetDebts: ((financialTargetDebtResult.data ?? []) as FinancialTargetDebtRow[]).map(financialTargetDebtFromRow),
    snapshot: snapshotFromRow(snapshotRow as SnapshotRow),
  };
}

function adjustedSnapshot(snapshot: FinanceSnapshot | undefined, transactions: Transaction[], direction: 1 | -1) {
  if (!snapshot) return snapshot;
  const next: FinanceSnapshot = {
    ...snapshot,
    accountBalances: { ...snapshot.accountBalances },
    categorySpending: { ...snapshot.categorySpending },
  };
  for (const transaction of transactions) {
    const accountDirection = transaction.kind === "income" || transaction.kind === "transfer_in" ? 1 : -1;
    next.accountBalances[transaction.accountId] = (next.accountBalances[transaction.accountId] ?? 0) + direction * accountDirection * transaction.amount;
    if (transaction.occurredOn.slice(0, 7) !== snapshot.month.slice(0, 7)) continue;
    if (transaction.kind === "income") next.income += direction * transaction.amount;
    if (transaction.kind === "expense") {
      next.expense += direction * transaction.amount;
      if (transaction.categoryId) next.categorySpending[transaction.categoryId] = Math.max(0, (next.categorySpending[transaction.categoryId] ?? 0) + direction * transaction.amount);
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
  if (transaction.kind === "transfer_in") return false;
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

function adjustedTargetProgress(targets: FinancialTarget[], movements: Array<Pick<Transaction, "financialTargetId" | "financialTargetEffect" | "amount">>, direction: 1 | -1) {
  const deltas = new Map<string, number>();
  for (const movement of movements) {
    if (!movement.financialTargetId || !movement.financialTargetEffect) continue;
    const signed = movement.financialTargetEffect === "advance" ? movement.amount : -movement.amount;
    deltas.set(movement.financialTargetId, (deltas.get(movement.financialTargetId) ?? 0) + signed * direction);
  }
  if (!deltas.size) return targets;
  return targets.map((target) => {
    const delta = deltas.get(target.id);
    if (delta === undefined || target.progressAmount === undefined) return target;
    return { ...target, progressAmount: target.progressAmount + delta };
  });
}

function financialTargetToRow(userId: string, target: FinancialTarget) {
  return {
    id: target.id, user_id: userId, mode: target.mode, kind: target.kind, status: target.status,
    title: target.title, description: target.description ?? null, target_amount: target.targetAmount,
    initial_progress: target.initialProgress, starts_on: target.startsOn, target_date: target.targetDate ?? null,
    priority: target.priority, color: target.color, icon: target.icon, cover_path: target.coverPath ?? null,
    account_id: target.accountId ?? null, category_id: target.categoryId ?? null,
    tracking_mode: target.trackingMode, completed_at: target.completedAt ?? null, archived_at: target.archivedAt ?? null,
  };
}

function financialTargetEntryToRow(userId: string, entry: FinancialTargetEntry) {
  return {
    id: entry.id, user_id: userId, target_id: entry.targetId, kind: entry.kind, effect: entry.effect,
    amount: entry.amount, occurred_on: entry.occurredOn, note: entry.note ?? null,
  };
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
      if (transaction.kind === "income") sum.income += transaction.amount;
      if (transaction.kind === "expense") sum.expense += transaction.amount;
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
    const expense = state.transactions.filter((transaction) => transaction.kind === "expense" && transaction.categoryId && ids.has(transaction.categoryId) && transaction.occurredOn >= firstMonth && transaction.occurredOn < nextMonth).reduce((sum, transaction) => sum + transaction.amount, 0);
    return { group: group.group, name: group.name, color: group.color, expense, targetPercent: group.targetPercent, includedInPlan: group.includedInPlan, archived: Boolean(group.archived) };
  }).filter((group) => !group.archived || group.expense > 0);
  return { startMonth: firstMonth, endMonth, months, groups, source: "local", coverage };
}

async function writeTransactionPayload(client: SupabaseClient, userId: string, payload: TransactionPayload) {
  if (payload.input.type === "transfer") {
    const outgoing = payload.transactions.find((transaction) => transaction.kind === "transfer_out");
    const incoming = payload.transactions.find((transaction) => transaction.kind === "transfer_in");
    if (!outgoing || !incoming || !outgoing.transferGroupId) throw new Error("La transferencia local está incompleta.");
    const { error } = await client.rpc("upsert_transfer", {
      p_transfer_group_id: outgoing.transferGroupId,
      p_source_transaction_id: outgoing.id,
      p_destination_transaction_id: incoming.id,
      p_source_account_id: outgoing.accountId,
      p_destination_account_id: incoming.accountId,
      p_amount: outgoing.amount,
      p_description: outgoing.description,
      p_occurred_on: outgoing.occurredOn,
      p_note: outgoing.note ?? null,
    });
    if (error) throw error;
    const { error: targetError } = await client.from("transactions").update({
      financial_target_id: incoming.financialTargetId ?? null,
      financial_target_effect: incoming.financialTargetEffect ?? null,
    }).eq("id", incoming.id).eq("user_id", userId);
    if (targetError) throw targetError;
    return;
  }

  const transaction = payload.transactions[0];
  const { error } = await client.from("transactions").upsert({
    id: transaction.id,
    user_id: userId,
    kind: transaction.kind,
    amount: transaction.amount,
    account_id: transaction.accountId,
    category_id: transaction.categoryId ?? null,
    description: transaction.description,
    merchant: transaction.merchant ?? null,
    note: transaction.note ?? null,
    icon: transaction.icon ?? null,
    financial_target_id: transaction.financialTargetId ?? null,
    financial_target_effect: transaction.financialTargetEffect ?? null,
    occurred_on: transaction.occurredOn,
  }, { onConflict: "id" });
  if (error) throw error;
}

async function writeImportedTransactions(client: SupabaseClient, userId: string, payload: TransactionImportPayload) {
  const rows = payload.transactions.map((transaction) => ({
    id: transaction.id,
    user_id: userId,
    kind: transaction.kind,
    amount: transaction.amount,
    account_id: transaction.accountId,
    category_id: transaction.categoryId ?? null,
    description: transaction.description,
    merchant: transaction.merchant ?? null,
    note: transaction.note ?? null,
    icon: transaction.icon ?? null,
    financial_target_id: transaction.financialTargetId ?? null,
    financial_target_effect: transaction.financialTargetEffect ?? null,
    occurred_on: transaction.occurredOn,
  }));
  for (let index = 0; index < rows.length; index += 250) {
    const { error } = await client.from("transactions").upsert(rows.slice(index, index + 250), { onConflict: "id" });
    if (error) throw error;
  }
}

async function fetchRemoteTransactionsForPending(client: SupabaseClient, items: QueueItem[]) {
  const { ids, transferGroupIds } = pendingTransactionReferences(items);
  const columns = "id,kind,amount,account_id,category_id,transfer_group_id,recurring_occurrence_id,financial_target_id,financial_target_effect,description,merchant,note,icon,occurred_on,created_at";
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
    const month = monthByKey.get(`${transaction.occurredOn.slice(0, 7)}-01`);
    if (month) {
      if (transaction.kind === "income") month.income += transaction.amount * direction;
      if (transaction.kind === "expense") month.expense += transaction.amount * direction;
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
    group.expense += transaction.amount * direction;
  };

  remoteAffected.forEach((transaction) => apply(transaction, -1));
  finalAffected.forEach((transaction) => apply(transaction, 1));
  return { ...base, months, groups: groups.filter((group) => !group.archived || group.expense > 0), source: "local" as const };
}

function rpcGroupAllocations(allocations: GroupAllocationWrite[]) {
  return allocations.map((allocation) => ({
    group_key: allocation.group,
    percent: allocation.targetPercent,
    included: allocation.includedInPlan,
    sort_order: allocation.sortOrder,
  }));
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
    : monthTransactions.filter((transaction) => transaction.kind === "income").reduce((sum, transaction) => sum + transaction.amount, 0);
  const spending = isSnapshotMonth
    ? state.snapshot!.categorySpending
    : monthTransactions.reduce<Record<string, number>>((totals, transaction) => {
      if (transaction.kind === "expense" && transaction.categoryId) totals[transaction.categoryId] = (totals[transaction.categoryId] ?? 0) + transaction.amount;
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

async function executeQueueItem(client: SupabaseClient, userId: string, item: QueueItem) {
  if (item.operation === "transaction.create" || item.operation === "transaction.update") {
    await writeTransactionPayload(client, userId, item.payload as TransactionPayload);
    return;
  }
  if (item.operation === "transaction.import") {
    await writeImportedTransactions(client, userId, item.payload as TransactionImportPayload);
    return;
  }
  if (item.operation === "transaction.delete") {
    const payload = item.payload as { id: string; transferGroupId?: string };
    const query = client.from("transactions").delete();
    const { error } = payload.transferGroupId ? await query.eq("transfer_group_id", payload.transferGroupId) : await query.eq("id", payload.id);
    if (error) throw error;
    return;
  }
  if (item.operation === "recurring-rule.upsert") {
    const payload = item.payload as RecurringRule;
    const { error } = await client.from("recurring_rules").upsert(recurringRuleToRow(userId, payload), { onConflict: "id" });
    if (error) throw error;
    return;
  }
  if (item.operation === "recurring-rule.archive") {
    const payload = item.payload as { id: string };
    const { error } = await client.from("recurring_rules").update({ status: "archived", active: false, archived_at: new Date().toISOString() }).eq("id", payload.id).eq("user_id", userId);
    if (error) throw error;
    return;
  }
  if (item.operation === "recurring-occurrence.update") {
    const payload = item.payload as { id: string; status: "planned" | "skipped" | "cancelled" };
    const { error } = await client.from("recurring_occurrences").update({ status: payload.status, failure_reason: null }).eq("id", payload.id).eq("user_id", userId);
    if (error) throw error;
    return;
  }
  if (item.operation === "financial-target.upsert") {
    const payload = item.payload as { target: FinancialTarget; debt?: Omit<FinancialTargetDebtDetails, "targetId"> };
    const { error } = await client.from("financial_targets").upsert(financialTargetToRow(userId, payload.target), { onConflict: "id" });
    if (error) throw error;
    if (payload.target.kind === "debt" && payload.debt) {
      const { error: debtError } = await client.from("financial_target_debt_details").upsert({
        user_id: userId, target_id: payload.target.id, creditor: payload.debt.creditor ?? null,
        annual_interest_rate: payload.debt.annualInterestRate ?? null,
        minimum_payment: payload.debt.minimumPayment ?? null, due_day: payload.debt.dueDay ?? null,
      }, { onConflict: "target_id" });
      if (debtError) throw debtError;
    } else {
      const { error: debtError } = await client.from("financial_target_debt_details").delete().eq("target_id", payload.target.id).eq("user_id", userId);
      if (debtError) throw debtError;
    }
    return;
  }
  if (item.operation === "financial-target.status") {
    const payload = item.payload as { id: string; status: FinancialTargetStatus; completedAt?: string; archivedAt?: string };
    const { error } = await client.from("financial_targets").update({
      status: payload.status, completed_at: payload.completedAt ?? null, archived_at: payload.archivedAt ?? null,
    }).eq("id", payload.id).eq("user_id", userId);
    if (error) throw error;
    return;
  }
  if (item.operation === "financial-target-entry.upsert") {
    const entry = item.payload as FinancialTargetEntry;
    const { error } = await client.from("financial_target_entries").upsert(financialTargetEntryToRow(userId, entry), { onConflict: "id" });
    if (error) throw error;
    return;
  }
  if (item.operation === "financial-target-entry.delete") {
    const payload = item.payload as { id: string };
    const { error } = await client.from("financial_target_entries").delete().eq("id", payload.id).eq("user_id", userId);
    if (error) throw error;
    return;
  }
  if (item.operation === "account.create") {
    const payload = item.payload as Account;
    const { error } = await client.from("accounts").upsert({ id: payload.id, user_id: userId, name: payload.name, account_type: payload.type, initial_balance: payload.initialBalance, color: payload.color, icon: payload.icon }, { onConflict: "id" });
    if (error) throw error;
    return;
  }
  if (item.operation === "category.create") {
    const payload = item.payload as Category;
    const { error } = await client.rpc("upsert_finance_category", { p_id: payload.id, p_name: payload.name, p_group_key: payload.group, p_color: payload.color, p_icon: payload.icon });
    if (error) throw error;
    return;
  }
  if (item.operation === "category.upsert") {
    const payload = item.payload as CategoryInput;
    const { error } = await client.rpc("upsert_finance_category", { p_id: payload.id, p_name: payload.name, p_group_key: payload.group, p_color: payload.color, p_icon: payload.icon });
    if (error) throw error;
    return;
  }
  if (item.operation === "category.archive") {
    const { error } = await client.rpc("archive_finance_category", { p_id: (item.payload as { id: string }).id });
    if (error) throw error;
    return;
  }
  if (item.operation === "income-type.upsert") {
    const payload = item.payload as IncomeTypeInput;
    const { error } = await client.rpc("upsert_income_type", { p_id: payload.id, p_name: payload.name, p_color: payload.color, p_icon: payload.icon });
    if (error) throw error;
    return;
  }
  if (item.operation === "income-type.archive") {
    const { error } = await client.rpc("archive_income_type", { p_id: (item.payload as { id: string }).id });
    if (error) throw error;
    return;
  }
  if (item.operation === "finance-group.upsert") {
    const payload = item.payload as FinanceGroupInput;
    const { error } = await client.rpc("upsert_finance_group", { p_id: payload.id, p_group_key: payload.group, p_name: payload.name, p_color: payload.color, p_icon: payload.icon, p_sort_order: payload.sortOrder });
    if (error) throw error;
    return;
  }
  if (item.operation === "finance-group.archive") {
    const payload = item.payload as ArchiveFinanceGroupInput | { groupKey: string; destinationGroupKey?: string; archiveCategories?: boolean };
    const hasAtomicPayload = "allocations" in payload && Array.isArray(payload.allocations);
    const { error } = hasAtomicPayload
      ? await client.rpc("archive_finance_group_atomic", {
        p_group_key: payload.groupKey,
        p_allocations: rpcGroupAllocations(payload.allocations),
        p_destination_group_key: payload.destinationGroupKey ?? null,
        p_archive_categories: payload.archiveCategories ?? false,
      })
      : await client.rpc("archive_finance_group", {
        p_group_key: payload.groupKey,
        p_destination_group_key: payload.destinationGroupKey ?? null,
        p_archive_categories: payload.archiveCategories ?? false,
      });
    if (error) throw error;
    return;
  }
  if (item.operation === "budget.upsert") {
    const payload = item.payload as { id: string; categoryId: string; amount: number; month: string };
    const { error } = await client.from("budgets").upsert({ id: payload.id, user_id: userId, category_id: payload.categoryId, amount: payload.amount, month: payload.month }, { onConflict: "user_id,category_id,month" });
    if (error) throw error;
    return;
  }
  if (item.operation === "profile.update") {
    const payload = item.payload as ProfileInput;
    const { error } = await client.from("profiles").update({ display_name: payload.displayName, currency_code: payload.currencyCode, timezone: payload.timezone, week_starts_on: payload.weekStartsOn, month_starts_on: payload.monthStartsOn, theme_mode: payload.themeMode, color_theme: payload.colorTheme }).eq("id", userId);
    if (error) throw error;
    return;
  }
  if (item.operation === "allocation.set") {
    const payload = item.payload as GroupAllocationWrite[];
    const { error } = await client.rpc("set_group_allocations", { p_allocations: rpcGroupAllocations(payload) });
    if (error) throw error;
    return;
  }
  if (item.operation === "budget-plan.set") {
    const payload = item.payload as MonthlyBudgetPlanInput;
    const { error } = await client.rpc("set_monthly_budget_plan", {
      p_month: payload.month,
      p_income_target: payload.incomeTarget,
      p_source: payload.source,
      p_budgets: payload.budgets.map((budget) => ({ id: budget.id, category_id: budget.categoryId, amount: budget.amount })),
    });
    if (error) throw error;
    return;
  }
  if (item.operation === "category.order") {
    const payload = item.payload as { groupKey: string; positions: CategoryOrderWrite[] };
    const { error } = await client.rpc("set_finance_category_order", {
      p_group_key: payload.groupKey,
      p_positions: payload.positions.map((position) => ({ id: position.id, sort_order: position.sortOrder })),
    });
    if (error) throw error;
    return;
  }
  if (item.operation === "income-type.import") {
    const payload = item.payload as IncomeTypeInput[];
    for (const incomeType of payload) {
      const { error } = await client.rpc("upsert_income_type", { p_id: incomeType.id, p_name: incomeType.name, p_color: incomeType.color, p_icon: incomeType.icon });
      if (error) throw error;
    }
    return;
  }
  if (item.operation === "category.import") {
    const payload = item.payload as CategoryInput[];
    for (const category of payload) {
      const { error } = await client.rpc("upsert_finance_category", { p_id: category.id, p_name: category.name, p_group_key: category.group, p_color: category.color, p_icon: category.icon });
      if (error) throw error;
    }
    return;
  }
  throw new Error(`La operación offline “${String(item.operation)}” no está soportada por esta versión. Se conservará para no perder datos.`);
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

async function flushQueue(client: SupabaseClient, userId: string) {
  return withCrossTabLock(`moneva:queue:${userId}`, async () => {
    const items = await readQueue(userId);
    let lastError: string | null = null;
    let failedItemId: string | null = null;
    for (const item of items) {
      try {
        await executeQueueItem(client, userId, item);
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
  return item.operation.startsWith("transaction.");
}

async function remoteTransactionPage(client: SupabaseClient, options: { limit: number; cursor: TransactionCursor | null; filter: TransactionListFilter; query: string; period: TransactionDateBounds | null; accountId?: string; categoryId?: string }): Promise<TransactionPage> {
  const { data, error } = await client.rpc("get_transactions_page", {
    p_limit: options.limit,
    p_cursor_occurred_on: options.cursor?.occurredOn ?? null,
    p_cursor_created_at: options.cursor?.createdAt ?? null,
    p_cursor_id: options.cursor?.id ?? null,
    p_kind: options.filter,
    p_query: options.query,
    p_start_date: options.period?.start ?? null,
    p_end_date: options.period?.end ?? null,
    p_account_id: options.accountId || null,
    p_category_id: options.categoryId || null,
  });
  if (error) throw error;
  const payload = (data ?? {}) as TransactionPageRowResult;
  const pageRows = payload.items ?? [];
  const items = pageRows.map(transactionFromRow);
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

  const reconcileRemote = useCallback(async (client: SupabaseClient, id: string) => {
    let lastFlushed: Awaited<ReturnType<typeof flushQueue>> | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await localWriteChain.current;
      const stableRevision = mutationRevision.current;
      const stableLocalRevision = await readLocalRevision(id);
      const flushed = await flushQueue(client, id);
      lastFlushed = flushed;
      if (flushed.pending > 0) return { flushed, remote: undefined, stableRevision, unstable: false };
      const remote = await loadRemoteState(client);
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

  const persistTransactions = useCallback(async (operation: "transaction.create" | "transaction.update" | "transaction.import", queueItemId: string | undefined, ids: string[]) => {
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
    const created = buildTransactions(input);
    const payload = { transactions: created, input } satisfies TransactionPayload;
    const { queueItemId } = await commitLocalState("transaction.create", payload, (current, operationId) => {
      const localCreated = created.map((transaction) => ({ ...transaction, pendingOperationId: operationId }));
      return { ...current, transactions: mergeTransactions(current.transactions, localCreated), snapshot: adjustedSnapshot(current.snapshot, localCreated, 1), financialTargets: adjustedTargetProgress(current.financialTargets, localCreated, 1) };
    });
    return persistTransactions("transaction.create", queueItemId, created.map((transaction) => transaction.id));
  }, [commitLocalState, persistTransactions]);

  const importTransactions = useCallback(async (inputs: TransactionInput[]) => {
    if (!inputs.length) throw new Error("No hay movimientos nuevos para importar.");
    if (inputs.length > 5_000) throw new Error("Cada importación admite máximo 5.000 movimientos.");
    inputs.forEach(validateTransactionWrite);
    const created = inputs.flatMap(buildTransactions);
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

  const updateTransaction = useCallback(async (id: string, input: TransactionInput) => {
    validateTransactionWrite(input);
    const selected = stateRef.current.transactions.find((transaction) => transaction.id === id);
    if (!selected) throw new Error("No encontramos el movimiento que quieres editar.");
    const existing = selected.transferGroupId ? stateRef.current.transactions.filter((transaction) => transaction.transferGroupId === selected.transferGroupId) : [selected];
    if (selected.transferGroupId && input.type !== "transfer") throw new Error("Una transferencia debe seguir siendo una transferencia.");
    if (!selected.transferGroupId && input.type === "transfer") throw new Error("Crea una transferencia nueva para cambiar el tipo.");

    const updated = selected.transferGroupId ? buildUpdatedTransfer(existing, input) : [{
      ...selected,
      kind: input.type === "income" ? "income" as const : "expense" as const,
      amount: input.amount,
      accountId: input.accountId,
      categoryId: input.categoryId,
      financialTargetId: input.financialTargetId,
      financialTargetEffect: input.financialTargetEffect,
      description: input.description,
      merchant: input.merchant,
      note: input.note,
      icon: input.icon,
      occurredOn: input.occurredOn,
      syncStatus: createClient() ? "pending" as const : "synced" as const,
    }];
    const payload = { transactions: updated, input } satisfies TransactionPayload;
    const { queueItemId } = await commitLocalState("transaction.update", payload, (current, operationId) => {
      const currentSelected = current.transactions.find((transaction) => transaction.id === id);
      if (!currentSelected) throw new Error("No encontramos el movimiento que quieres editar.");
      const currentExisting = currentSelected.transferGroupId
        ? current.transactions.filter((transaction) => transaction.transferGroupId === currentSelected.transferGroupId)
        : [currentSelected];
      if (currentSelected.transferGroupId && input.type !== "transfer") throw new Error("Una transferencia debe seguir siendo una transferencia.");
      if (!currentSelected.transferGroupId && input.type === "transfer") throw new Error("Crea una transferencia nueva para cambiar el tipo.");
      const currentUpdated = (currentSelected.transferGroupId ? buildUpdatedTransfer(currentExisting, input) : [{
        ...currentSelected,
        kind: input.type === "income" ? "income" as const : "expense" as const,
        amount: input.amount,
        accountId: input.accountId,
        categoryId: input.categoryId,
        financialTargetId: input.financialTargetId,
        financialTargetEffect: input.financialTargetEffect,
        description: input.description,
        merchant: input.merchant,
        note: input.note,
        icon: input.icon,
        occurredOn: input.occurredOn,
        syncStatus: createClient() ? "pending" as const : "synced" as const,
      }]).map((transaction) => ({ ...transaction, pendingOperationId: operationId }));
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

  const uploadFinancialTargetCover = useCallback(async (targetId: string, file: File) => {
    const client = createClient();
    if (!client || !userId || userId === "demo") throw new Error("Las portadas solo se guardan al iniciar sesión.");
    if (!navigator.onLine) throw new Error("Conéctate para subir la portada; el resto de la meta sí puede guardarse sin conexión.");
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) throw new Error("Usa una imagen JPG, PNG o WebP.");
    if (file.size > 5 * 1024 * 1024) throw new Error("La portada debe pesar menos de 5 MB.");
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${userId}/${targetId}/${uid()}.${extension}`;
    const { error } = await client.storage.from("financial-target-covers").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (error) throw error;
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
    const created = { ...account, name, id: uid() };
    const { queueItemId } = await commitLocalState("account.create", created, (current) => ({
      ...current,
      accounts: [...current.accounts, created],
      snapshot: current.snapshot ? { ...current.snapshot, accountBalances: { ...current.snapshot.accountBalances, [created.id]: created.initialBalance } } : current.snapshot,
    }));
    return persist("account.create", queueItemId);
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
        group: cleanRequiredText(category.group, "El identificador del grupo", 64),
      };
    });
    const { queueItemId } = await commitLocalState("category.import", normalized, (current) => {
      const activeGroups = new Set(current.groupAllocations.filter((group) => !group.archived).map((group) => group.group));
      if (normalized.some((category) => !activeGroups.has(category.group))) throw new Error("Una categoría nueva apunta a un grupo que ya no está disponible.");
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
    cleanRequiredText(category.group, "El identificador del grupo", 64);
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
    cleanRequiredText(group.name, "El nombre del grupo", 60);
    cleanRequiredText(group.group, "El identificador del grupo", 64);
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
    const { queueItemId } = await commitLocalState("profile.update", profile, (current) => ({ ...current, profile: current.profile ? { ...current.profile, ...profile } : current.profile }));
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
    const { data, error } = await client.rpc("get_detailed_finance_report", {
      p_start_date: query.startDate,
      p_end_date: query.endDate,
      p_months: query.preset === "months" ? query.selectedMonths.map((month) => `${month}-01`) : null,
      p_granularity: query.granularity,
      p_kind: query.kind,
      p_group_keys: query.groupKeys.length ? query.groupKeys : null,
      p_category_ids: query.categoryIds.length ? query.categoryIds : null,
      p_income_type_ids: query.incomeTypeIds.length ? query.incomeTypeIds : null,
      p_account_ids: query.accountIds.length ? query.accountIds : null,
      p_query: query.search,
      p_comparison_start: comparison?.startDate ?? null,
      p_comparison_end: comparison?.endDate ?? null,
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
  }), [addTransaction, importTransactions, updateTransaction, deleteTransaction, upsertRecurringRule, archiveRecurringRule, updateRecurringOccurrence, upsertFinancialTarget, setFinancialTargetStatus, upsertFinancialTargetEntry, deleteFinancialTargetEntry, addAccount, addCategory, importCategories, importIncomeTypes, upsertCategory, archiveCategory, upsertIncomeType, archiveIncomeType, upsertFinanceGroup, archiveFinanceGroup, updateBudget, setMonthlyBudgetPlan, updateCategoryOrder, updateProfile, updateGroupAllocations]);

  const compatibleMutations = useMemo(() => ({
    addTransaction: async (input: TransactionInput) => { await mutate.addTransaction(input); },
    updateTransaction: async (id: string, input: TransactionInput) => { await mutate.updateTransaction(id, input); },
    deleteTransaction: async (id: string, transferGroupId?: string, knownRows?: Transaction[]) => { await mutate.deleteTransaction(id, transferGroupId, knownRows); },
    addAccount: async (account: Omit<Account, "id">) => { await mutate.addAccount(account); },
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
    uploadFinancialTargetCover,
    getFinancialTargetCoverUrl,
    syncNow,
    prepareSignOut,
    cancelPreparedSignOut,
    completeSignOut,
  }), [state, hydrated, dataStatus, dataSource, online, syncing, pendingCount, syncError, mutate, compatibleMutations, listTransactions, exportTransactions, getFinanceReport, getDetailedFinanceReport, exportReportTransactions, getMonthlyBudgetPlan, getPlanSimulationSeed, uploadFinancialTargetCover, getFinancialTargetCoverUrl, syncNow, prepareSignOut, cancelPreparedSignOut, completeSignOut]);

  return <FinanceContext.Provider value={value}>{dataStatus === "ready" ? children : <FinanceDataGate status={dataStatus} error={bootstrapError} />}</FinanceContext.Provider>;
}

function FinanceDataGate({ status, error }: { status: Exclude<FinanceDataStatus, "ready">; error: string | null }) {
  const unavailable = status === "unavailable";
  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 text-foreground">
      <div className="w-full max-w-sm border-y py-8 text-center" role="status" aria-live="polite" aria-busy={!unavailable}>
        <span className="mx-auto mb-5 grid size-12 place-items-center rounded-2xl bg-primary/12 text-xl font-semibold text-primary" aria-hidden="true">M</span>
        <h1 className="text-xl font-semibold tracking-[-.03em]">{unavailable ? "Tus datos están a salvo" : "Preparando tus finanzas"}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {unavailable ? error ?? "No pudimos abrir una copia confiable de tus datos." : "Estamos recuperando la copia más reciente antes de mostrar cualquier cifra."}
        </p>
        {unavailable ? <button type="button" className="mt-6 min-h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground" onClick={() => window.location.reload()}>Intentar de nuevo</button> : null}
      </div>
    </main>
  );
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

function buildTransactions(input: TransactionInput): Transaction[] {
  const now = new Date().toISOString();
  const status: Transaction["syncStatus"] = createClient() ? "pending" : "synced";
  if (input.type === "transfer" && input.destinationAccountId) {
    const groupId = uid();
    return [
      { id: uid(), kind: "transfer_out", amount: input.amount, accountId: input.accountId, transferGroupId: groupId, description: input.description || "Transferencia", note: input.note, occurredOn: input.occurredOn, createdAt: now, syncStatus: status },
      { id: uid(), kind: "transfer_in", amount: input.amount, accountId: input.destinationAccountId, transferGroupId: groupId, financialTargetId: input.financialTargetId, financialTargetEffect: input.financialTargetEffect, description: input.description || "Transferencia", note: input.note, occurredOn: input.occurredOn, createdAt: now, syncStatus: status },
    ];
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
  }];
}

function buildUpdatedTransfer(existing: Transaction[], input: TransactionInput): Transaction[] {
  const outgoing = existing.find((transaction) => transaction.kind === "transfer_out");
  const incoming = existing.find((transaction) => transaction.kind === "transfer_in");
  if (!outgoing || !incoming || !input.destinationAccountId) throw new Error("La transferencia está incompleta.");
  const common = { amount: input.amount, description: input.description || "Transferencia", note: input.note, occurredOn: input.occurredOn, syncStatus: createClient() ? "pending" as const : "synced" as const };
  return [
    { ...outgoing, ...common, accountId: input.accountId },
    { ...incoming, ...common, accountId: input.destinationAccountId, financialTargetId: input.financialTargetId, financialTargetEffect: input.financialTargetEffect },
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
    cleanRequiredText(allocation.group, "El identificador del grupo", 64);
    if (groups.has(allocation.group)) throw new Error("Cada grupo debe aparecer una sola vez en el plan.");
    groups.add(allocation.group);
    if (!Number.isFinite(allocation.targetPercent) || allocation.targetPercent < 0 || allocation.targetPercent > 100) throw new Error("Cada porcentaje debe estar entre 0 y 100.");
    if (Math.round(allocation.targetPercent * 100) !== allocation.targetPercent * 100) throw new Error("Los porcentajes admiten máximo dos decimales.");
    if (!Number.isInteger(allocation.sortOrder) || allocation.sortOrder < 0 || allocation.sortOrder > 1000) throw new Error("El orden del grupo no es válido.");
    if (!allocation.includedInPlan && allocation.targetPercent !== 0) throw new Error("Los grupos excluidos deben quedar en 0%.");
  }
  const included = allocations.filter((allocation) => allocation.includedInPlan);
  const total = included.reduce((sum, allocation) => sum + allocation.targetPercent, 0);
  if (included.length === 0 && total !== 0) throw new Error("Un plan sin grupos incluidos debe sumar 0%.");
  if (included.length > 0 && Math.abs(total - 100) > 0.001) throw new Error("Los grupos incluidos deben sumar exactamente 100%.");
}

export function validateArchiveFinanceGroupWrite(input: ArchiveFinanceGroupInput, state: FinanceState) {
  validateAllocationsWrite(input.allocations);
  const activeGroups = state.groupAllocations.filter((group) => !group.archived);
  const activeKeys = new Set(activeGroups.map((group) => group.group));
  const allocationKeys = new Set(input.allocations.map((allocation) => allocation.group));

  if (!activeKeys.has(input.groupKey)) throw new Error("No encontramos el grupo que quieres archivar.");
  if (activeGroups.length <= 1) throw new Error("Tu estructura debe conservar al menos un grupo principal.");
  if (input.allocations.length !== activeGroups.length || activeGroups.some((group) => !allocationKeys.has(group.group))) {
    throw new Error("La redistribución debe incluir cada grupo activo exactamente una vez.");
  }

  const sourceAllocation = input.allocations.find((allocation) => allocation.group === input.groupKey);
  if (!sourceAllocation || sourceAllocation.includedInPlan || sourceAllocation.targetPercent !== 0) {
    throw new Error("El grupo archivado debe quedar fuera del reparto y en 0%.");
  }
  if (input.destinationGroupKey && input.archiveCategories) {
    throw new Error("Elige entre mover o archivar las subcategorías, no ambas acciones.");
  }
  if (input.destinationGroupKey && (input.destinationGroupKey === input.groupKey || !activeKeys.has(input.destinationGroupKey))) {
    throw new Error("El grupo de destino no está disponible.");
  }

  const hasActiveCategories = state.categories.some((category) => category.kind === "expense" && !category.archived && category.group === input.groupKey);
  if (hasActiveCategories && !input.destinationGroupKey && !input.archiveCategories) {
    throw new Error("Mueve o archiva las subcategorías antes de archivar este grupo.");
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
