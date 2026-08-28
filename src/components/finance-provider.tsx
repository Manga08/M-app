"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useTheme } from "next-themes";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { demoFinanceState } from "@/lib/finance/demo-data";
import { accountBalance, currentMonthStart } from "@/lib/finance/calculations";
import type {
  Account,
  AccountEntityInput,
  AccountUpdateInput,
  ArchiveFinanceGroupInput,
  Budget,
  BudgetPlanSource,
  Category,
  CategoryInput,
  CategoryOrderWrite,
  CreditCardInput,
  CreditCardPurchaseInput,
  CreditCardPurchasePlan,
  CreditCardStatementInput,
  DetailedFinanceReport,
  FinanceReport,
  FinanceReportGroup,
  FinanceReportMonth,
  FinanceGroupInput,
  FinancialTarget,
  FinancialTargetDebtDetails,
  FinancialTargetDebtInput,
  FinancialTargetEntry,
  FinancialTargetEntryInput,
  FinancialTargetInput,
  FinancialTargetStatus,
  FinanceSnapshot,
  FinanceState,
  GroupAllocation,
  GroupAllocationWrite,
  IncomeTypeInput,
  LiabilityArchiveInput,
  LiabilityCalendarRange,
  LiabilityInput,
  LiabilityObligation,
  LiabilityObligationWriteInput,
  LiabilityPaymentInput,
  LiabilityPaymentRule,
  LiabilityPaymentRuleInput,
  LiabilityRatePeriod,
  LiabilityReconciliationPreview,
  LiabilityReconciliationInput,
  LiabilityTerms,
  LiabilityTermsInput,
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
  FinanceMutationError,
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
import { creditCardStatementToLiabilityWrite, executeFinanceQueueItem } from "@/lib/finance/remote-mutations";
import { financialTargetEntryFromRow, isoDateOffset, loadRemoteCreditCardHistoryRange, loadRemoteFinancialResetGeneration, loadRemoteFinanceState, loadRemoteLiabilityCalendar, loadRemoteTransactionLiabilityRoles, mergeRemoteCreditCardHistoryRange, previewRemoteLiabilityReconciliation, recurringOccurrenceFromRow, recurringRuleFromRow, transactionFromRow, type FinancialTargetEntryRow, type RecurringOccurrenceRow, type RecurringRuleRow, type TransactionPageRowResult, type TransactionRow } from "@/lib/finance/remote-state";
import { userFacingSyncErrorMessage } from "@/lib/finance/sync-error";
import { accountCurrencyIsLocked } from "@/lib/finance/account-currency";
import { REPORTING_CURRENCY_CODE, assertSupportedAccountCurrency, transactionReportingAmount } from "@/lib/finance/currency";
import { buildTransactions, buildUpdatedTransfer, validateTransactionWrite } from "@/lib/finance/transaction-postings";
import { buildInstallmentSchedule, prepareCreditCardStatementSave, previewLocalCreditCardReconciliation } from "@/lib/finance/credit-cards";
import { liabilityPaymentBreakdown, recalculateFixedLiabilityPrepayment } from "@/lib/finance/liabilities";

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
  upsertCreditCard: (input: CreditCardInput) => Promise<FinanceMutationResult>;
  addCreditCardPurchase: (input: CreditCardPurchaseInput) => Promise<FinanceMutationResult>;
  upsertCreditCardStatement: (input: CreditCardStatementInput) => Promise<FinanceMutationResult>;
  upsertLiability: (input: LiabilityInput) => Promise<FinanceMutationResult>;
  upsertLiabilityTerms: (input: LiabilityTermsInput) => Promise<FinanceMutationResult>;
  upsertLiabilityObligation: (input: LiabilityObligationWriteInput) => Promise<FinanceMutationResult>;
  reconcileLiabilityObligation: (input: LiabilityReconciliationInput) => Promise<FinanceMutationResult>;
  upsertLiabilityPaymentRule: (input: LiabilityPaymentRuleInput) => Promise<FinanceMutationResult>;
  recordLiabilityPayment: (input: LiabilityPaymentInput) => Promise<FinanceMutationResult>;
  archiveLiability: (input: LiabilityArchiveInput) => Promise<FinanceMutationResult>;
  addAccount: (account: Omit<Account, "id">) => Promise<FinanceMutationResult>;
  updateAccount: (input: AccountUpdateInput) => Promise<FinanceMutationResult>;
  archiveAccount: (id: string) => Promise<FinanceMutationResult>;
  upsertAccountEntity: (entity: AccountEntityInput) => Promise<FinanceMutationResult>;
  archiveAccountEntity: (id: string) => Promise<FinanceMutationResult>;
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
  loadLiabilityCalendar: (dateFrom: string, dateTo: string) => Promise<LiabilityCalendarRange>;
  previewLiabilityReconciliation: (
    accountId: string,
    cutoffOn: string,
    statementTotal: number,
    statement?: { id?: string; periodStart: string; interest: number; fees: number },
  ) => Promise<LiabilityReconciliationPreview>;
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

async function applyServerFinancialResetGeneration(client: FinanceSupabaseClient, userId: string) {
  const generation = await loadRemoteFinancialResetGeneration(client, userId);
  return applyLocalFinanceResetGeneration(userId, generation);
}

const emptyFinanceState: FinanceState = {
  profile: null,
  accountEntities: [],
  accounts: [],
  creditCards: [],
  creditCardStatements: [],
  creditCardPurchasePlans: [],
  creditCardInstallments: [],
  liabilities: [],
  liabilityTerms: [],
  liabilityRatePeriods: [],
  liabilityObligations: [],
  liabilityPaymentRules: [],
  liabilityPaymentIntents: [],
  liabilityOverview: {
    asOf: "",
    reportingCurrencyCode: REPORTING_CURRENCY_CODE,
    totalReportingDebt: 0,
    items: [],
    coverage: "partial",
  },
  liabilityCalendar: [],
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
      currencyCode: REPORTING_CURRENCY_CODE,
      customThemeColor: normalizeHexColor(state.profile.customThemeColor) ?? DEFAULT_CUSTOM_THEME_COLOR,
    } : null,
    categories: (state.categories ?? []).map((category, index) => ({ ...category, sortOrder: category.sortOrder ?? index })),
    accountEntities: (state.accountEntities ?? []).map((entity, index) => ({ ...entity, sortOrder: entity.sortOrder ?? index })),
    creditCards: state.creditCards ?? [],
    creditCardStatements: state.creditCardStatements ?? [],
    creditCardPurchasePlans: state.creditCardPurchasePlans ?? [],
    creditCardInstallments: state.creditCardInstallments ?? [],
    liabilities: state.liabilities ?? [],
    liabilityTerms: state.liabilityTerms ?? [],
    liabilityRatePeriods: state.liabilityRatePeriods ?? [],
    liabilityObligations: state.liabilityObligations ?? [],
    liabilityPaymentRules: state.liabilityPaymentRules ?? [],
    liabilityPaymentIntents: state.liabilityPaymentIntents ?? [],
    liabilityOverview: state.liabilityOverview ?? {
      asOf: "",
      reportingCurrencyCode: REPORTING_CURRENCY_CODE,
      totalReportingDebt: 0,
      items: [],
      coverage: "partial",
    },
    liabilityCalendar: state.liabilityCalendar ?? [],
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

function localLiabilityOverview(state: FinanceState, accountId: string) {
  const account = state.accounts.find((candidate) => candidate.id === accountId);
  const liability = state.liabilities.find((candidate) => candidate.accountId === accountId);
  if (!account || !liability) return { ...state.liabilityOverview, coverage: "partial" as const };
  const nativeBalance = accountBalance(account, state.transactions, state.snapshot);
  const reportingBalance = state.snapshot?.accountBalancesBase?.[accountId]
    ?? nativeBalance * (account.currencyCode === "USD" ? account.openingExchangeRate ?? 1 : 1);
  const currentTerms = state.liabilityTerms
    .filter((term) => term.accountId === accountId)
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn) || b.id.localeCompare(a.id))[0];
  const currentRates = state.liabilityRatePeriods.filter((rate) => rate.accountId === accountId);
  const paymentRule = state.liabilityPaymentRules.find((rule) => rule.accountId === accountId && rule.active)
    ?? state.liabilityPaymentRules.find((rule) => rule.accountId === accountId);
  const card = state.creditCards.find((candidate) => candidate.accountId === accountId);
  const previous = state.liabilityOverview.items.find((item) => item.accountId === accountId);
  const accountObligations = state.liabilityObligations.filter((obligation) => obligation.accountId === accountId);
  const nextDue = accountObligations
    .filter((obligation) => ["projected", "open", "due", "partial", "overdue"].includes(obligation.status))
    .toSorted((left, right) => left.dueOn.localeCompare(right.dueOn) || (left.sequenceNumber ?? 0) - (right.sequenceNumber ?? 0))[0];
  const nextCalendar = nextDue ? state.liabilityCalendar.find((entry) => entry.type === "obligation" && entry.id === nextDue.id) : undefined;
  const nextObligation = nextDue ? {
    id: nextDue.id,
    kind: nextDue.kind,
    sequenceNumber: nextDue.sequenceNumber,
    dueOn: nextDue.dueOn,
    principalDue: nextDue.principalDue,
    interestDue: nextDue.interestDue,
    feeDue: nextDue.feeDue,
    minimumDue: nextDue.minimumDue,
    totalDue: nextDue.totalDue,
    allocated: nextCalendar ? Math.max(nextCalendar.amount - nextCalendar.remaining, 0) : 0,
    remaining: nextCalendar?.remaining ?? nextDue.totalDue,
    status: nextDue.status,
    version: nextDue.version,
  } : accountObligations.length ? undefined : previous?.nextObligation;
  const nativeDebt = Math.max(-nativeBalance, 0);
  const reportingDebt = Math.max(-reportingBalance, 0);
  const item = {
    liability,
    accountId,
    accountVersion: account.version ?? previous?.accountVersion ?? 0,
    liabilityVersion: liability.version,
    name: account.name,
    accountName: account.name,
    kind: liability.kind,
    status: liability.status,
    creditorName: liability.creditorName,
    currencyCode: (account.currencyCode === "USD" ? "USD" : "COP") as "COP" | "USD",
    color: account.color,
    accountColor: account.color,
    icon: account.icon,
    accountIcon: account.icon,
    entityId: account.entityId,
    originalPrincipal: liability.originalPrincipal,
    originatedOn: liability.originatedOn,
    maturityOn: liability.maturityOn,
    legacyTargetId: liability.legacyTargetId,
    migrationStatus: liability.migrationStatus,
    nativeBalance,
    nativeDebt,
    reportingBalance,
    reportingDebt,
    reportingApproximate: account.currencyCode === "USD",
    currentTerms,
    currentRates,
    rates: currentRates,
    nextObligation,
    paymentRule,
    card: card ? { ...card, availableCredit: Math.max(card.creditLimit - nativeDebt, 0) } : undefined,
  };
  const items = [...state.liabilityOverview.items.filter((candidate) => candidate.accountId !== accountId), item]
    .sort((a, b) => a.name.localeCompare(b.name, "es") || a.accountId.localeCompare(b.accountId));
  return {
    ...state.liabilityOverview,
    items,
    totalReportingDebt: items.reduce((sum, candidate) => sum + candidate.reportingDebt, 0),
    coverage: "partial" as const,
  };
}

/**
 * Mirrors the atomic debt-target RPC in the local cache so a newly created
 * debt never points at a missing account while its WAL item is pending.
 */
export function normalizeExistingDebtOpeningState(
  debt: FinancialTargetDebtInput | undefined,
  existing: {
    accountId: string;
    currencyCode: "COP" | "USD";
    currentPrincipal: number;
    openingExchangeRate?: number;
  },
): FinancialTargetDebtInput {
  if (debt?.liabilityAccountId && debt.liabilityAccountId !== existing.accountId) {
    throw new Error("La cuenta contable de una deuda existente no se puede reemplazar.");
  }
  if (debt?.currencyCode && debt.currencyCode !== existing.currencyCode) {
    throw new Error("La moneda de una deuda existente no se puede cambiar. Crea otra deuda para usar una moneda diferente.");
  }
  if (debt?.principal !== undefined && Math.abs(debt.principal - existing.currentPrincipal) > 0.01) {
    throw new Error("El saldo pendiente se calcula con los movimientos y pagos. Registra una conciliación para corregirlo.");
  }
  return {
    ...(debt ?? {}),
    liabilityAccountId: existing.accountId,
    currencyCode: existing.currencyCode,
    principal: existing.currentPrincipal,
    openingExchangeRate: existing.openingExchangeRate,
  };
}

export function applyFinancialTargetLiabilityDraft(state: FinanceState, target: FinancialTarget, debt: FinancialTargetDebtInput | undefined) {
  if (target.kind !== "debt" || !debt?.liabilityAccountId) return state;
  const accountId = debt.liabilityAccountId;
  const existingAccount = state.accounts.find((account) => account.id === accountId);
  if (existingAccount && existingAccount.type !== "credit") throw new Error("La cuenta vinculada no es una obligación.");
  const protectedDebt = existingAccount ? normalizeExistingDebtOpeningState(debt, {
    accountId,
    currencyCode: existingAccount.currencyCode === "USD" ? "USD" : "COP",
    currentPrincipal: Math.max(-accountBalance(existingAccount, state.transactions, state.snapshot), 0),
    openingExchangeRate: existingAccount.openingExchangeRate,
  }) : debt;
  const currencyCode: "COP" | "USD" = protectedDebt.currencyCode === "USD" ? "USD" : "COP";
  const principal = protectedDebt.principal ?? Math.max(target.targetAmount - target.initialProgress, 0);
  const exchangeRate = currencyCode === "COP" ? 1 : protectedDebt.openingExchangeRate;
  if (!exchangeRate || exchangeRate <= 0) throw new Error("La deuda en dólares necesita una tasa inicial válida.");
  const account: Account = existingAccount ?? {
    id: accountId,
    name: target.title,
    type: "credit",
    initialBalance: -principal,
    color: target.color,
    icon: target.icon,
    currencyCode,
    openingBalanceDate: target.startsOn,
    openingExchangeRate: exchangeRate,
    version: 1,
  };
  const existingLiability = state.liabilities.find((liability) => liability.accountId === accountId);
  const liability = {
    accountId,
    kind: protectedDebt.debtType ?? "personal_debt" as const,
    status: target.status === "archived" ? "archived" as const
      : target.status === "completed" ? "settled" as const
        : target.status === "paused" ? "paused" as const
          : "active" as const,
    creditorName: protectedDebt.creditor?.trim() || undefined,
    originalPrincipal: existingLiability?.originalPrincipal ?? principal,
    originatedOn: existingLiability?.originatedOn ?? target.startsOn,
    maturityOn: target.targetDate,
    legacyTargetId: target.id,
    migrationStatus: "native" as const,
    version: existingLiability?.version ?? 1,
  };
  const existingTerm = protectedDebt.termId ? state.liabilityTerms.find((term) => term.id === protectedDebt.termId) : undefined;
  const term: LiabilityTerms | undefined = protectedDebt.termId ? {
    id: protectedDebt.termId,
    accountId,
    startsOn: protectedDebt.termsStartOn ?? target.startsOn,
    endsOn: protectedDebt.termsEndOn,
    paymentFrequency: protectedDebt.paymentFrequency ?? "monthly",
    intervalCount: protectedDebt.intervalCount ?? 1,
    calculationMethod: protectedDebt.calculationMethod ?? "manual",
    amortizationMethod: protectedDebt.amortizationMethod ?? "manual",
    dueDay: protectedDebt.dueDay,
    firstDueOn: protectedDebt.firstDueOn,
    installmentCount: protectedDebt.installmentCount,
    scheduledPayment: protectedDebt.scheduledPayment,
    contractualMinimum: protectedDebt.minimumPayment,
    periodicFee: protectedDebt.periodicFee ?? 0,
    periodicInsurance: protectedDebt.periodicInsurance ?? 0,
    variableRate: protectedDebt.variableRate ?? false,
    indexName: protectedDebt.indexName,
    spreadRate: protectedDebt.spreadRate,
    prepaymentStrategy: protectedDebt.prepaymentStrategy ?? "manual",
    source: "manual",
    version: existingTerm?.version ?? 1,
  } : undefined;
  const rateValue = protectedDebt.rateValue ?? protectedDebt.effectiveAnnualRate;
  const rate: LiabilityRatePeriod | undefined = protectedDebt.rateId && rateValue !== undefined ? {
    id: protectedDebt.rateId,
    accountId,
    rateKind: "principal",
    rateBasis: protectedDebt.rateBasis ?? "effective_annual",
    reportedValue: rateValue,
    effectiveAnnualRate: protectedDebt.effectiveAnnualRate,
    startsOn: protectedDebt.termsStartOn ?? target.startsOn,
    endsOn: protectedDebt.termsEndOn,
    source: "manual",
  } : undefined;
  const obligations: LiabilityObligation[] = (protectedDebt.schedule ?? []).map((obligation) => ({
    ...obligation,
    accountId,
    version: state.liabilityObligations.find((candidate) => candidate.id === obligation.id)?.version ?? obligation.version ?? 1,
  }));
  const existingPaymentRule = state.liabilityPaymentRules.find((rule) => rule.accountId === accountId);
  const paymentRule: LiabilityPaymentRule | undefined = protectedDebt.fundingAccountId ? {
    id: existingPaymentRule?.id ?? crypto.randomUUID(),
    accountId,
    fundingAccountId: protectedDebt.fundingAccountId,
    strategy: existingPaymentRule?.strategy ?? "current_balance",
    fixedAmount: existingPaymentRule?.fixedAmount,
    maximumAmount: existingPaymentRule?.maximumAmount,
    daysBeforeDue: existingPaymentRule?.daysBeforeDue ?? 0,
    recordingMode: existingPaymentRule?.recordingMode ?? "manual",
    active: existingPaymentRule?.active ?? false,
    version: existingPaymentRule?.version ?? 1,
  } : undefined;
  const openingBase = -principal * exchangeRate;
  const next: FinanceState = {
    ...state,
    accounts: existingAccount ? state.accounts : [...state.accounts, account],
    liabilities: existingLiability
      ? state.liabilities.map((candidate) => candidate.accountId === accountId ? liability : candidate)
      : [...state.liabilities, liability],
    liabilityTerms: term
      ? [...state.liabilityTerms.filter((candidate) => candidate.id !== term.id), term]
      : state.liabilityTerms,
    liabilityRatePeriods: protectedDebt.clearRate
      ? state.liabilityRatePeriods.filter((candidate) => candidate.accountId !== accountId || candidate.source !== "manual" || candidate.startsOn < (protectedDebt.termsStartOn ?? target.startsOn))
      : rate
      ? [...state.liabilityRatePeriods.filter((candidate) => candidate.id !== rate.id), rate]
      : state.liabilityRatePeriods,
    liabilityObligations: protectedDebt.schedule !== undefined || protectedDebt.clearSchedule
      ? [...state.liabilityObligations.filter((candidate) => candidate.accountId !== accountId || candidate.source !== "contract" || !["projected", "open"].includes(candidate.status)), ...obligations]
      : state.liabilityObligations,
    liabilityPaymentRules: paymentRule
      ? [...state.liabilityPaymentRules.filter((candidate) => candidate.accountId !== accountId), paymentRule]
      : protectedDebt.clearFundingAccount
        ? state.liabilityPaymentRules.filter((candidate) => candidate.accountId !== accountId)
        : state.liabilityPaymentRules,
    snapshot: !existingAccount && state.snapshot ? {
      ...state.snapshot,
      accountBalances: { ...state.snapshot.accountBalances, [accountId]: -principal },
      accountBalancesBase: { ...state.snapshot.accountBalancesBase, [accountId]: openingBase },
      netWorth: (state.snapshot.netWorth ?? 0) + openingBase,
    } : state.snapshot,
    liabilityCalendar: protectedDebt.schedule !== undefined || protectedDebt.clearSchedule ? [
      ...state.liabilityCalendar.filter((item) => item.accountId !== accountId || item.type !== "obligation" || !["projected", "open"].includes(item.status)),
      ...obligations.map((obligation) => ({
        date: obligation.dueOn,
        type: "obligation" as const,
        id: obligation.id,
        accountId,
        accountName: account.name,
        currencyCode,
        liabilityKind: liability.kind,
        status: obligation.status,
        amount: obligation.totalDue,
        remaining: obligation.totalDue,
        minimumDue: obligation.minimumDue,
        sequenceNumber: obligation.sequenceNumber,
        version: obligation.version,
      })),
    ] : state.liabilityCalendar,
  };
  return { ...next, liabilityOverview: localLiabilityOverview(next, accountId) };
}

/** Mirrors the atomic target/lifecycle RPC while the durable queue is pending. */
export function applyFinancialTargetStatusDraft(
  state: FinanceState,
  targetId: string,
  status: FinancialTargetStatus,
  now: string,
  pendingOperationId?: string,
) {
  const target = state.financialTargets.find((candidate) => candidate.id === targetId);
  if (!target) throw new Error("La meta ya no está disponible.");
  const liabilityAccountId = target.kind === "debt"
    ? state.liabilities.find((liability) => liability.legacyTargetId === targetId || liability.accountId === target.accountId)?.accountId
    : undefined;
  const stopping = status !== "active";
  const closing = status === "completed" || status === "archived";
  const liabilityStatus = status === "active" ? "active" as const
    : status === "paused" ? "paused" as const
      : status === "completed" ? "settled" as const
        : "archived" as const;

  const recurringRules = state.recurringRules.map((rule) => {
    if (rule.financialTargetId !== targetId) return rule;
    if (stopping && rule.status === "active") return {
      ...rule,
      status: (status === "paused" ? "paused" : "archived") as RecurringRule["status"],
      suspendedByTarget: true,
    };
    if (status === "active" && rule.status === "paused" && rule.suspendedByTarget) return {
      ...rule, status: "active" as const, suspendedByTarget: false,
    };
    return rule;
  });
  const activeRuleIds = new Set(recurringRules
    .filter((rule) => rule.financialTargetId === targetId && rule.status === "active")
    .map((rule) => rule.id));
  const recurringOccurrences = state.recurringOccurrences.map((occurrence) => {
    if (occurrence.financialTargetId !== targetId && !activeRuleIds.has(occurrence.ruleId)) return occurrence;
    if (stopping && occurrence.status === "planned") return {
      ...occurrence, status: "cancelled" as const, suspendedByTarget: true, failureReason: undefined,
    };
    if (status === "active" && occurrence.status === "cancelled" && occurrence.suspendedByTarget) return {
      ...occurrence, status: "planned" as const, suspendedByTarget: false, failureReason: undefined,
    };
    return occurrence;
  });

  const liabilityPaymentRules = state.liabilityPaymentRules.map((rule) => {
    if (rule.accountId !== liabilityAccountId) return rule;
    if (stopping && rule.active) return { ...rule, active: false, suspendedByTarget: true, version: rule.version + 1 };
    if (status === "active" && rule.suspendedByTarget) return { ...rule, active: true, suspendedByTarget: false, version: rule.version + 1 };
    return rule;
  });
  const activePaymentRuleIds = new Set(liabilityPaymentRules
    .filter((rule) => rule.accountId === liabilityAccountId && rule.active)
    .map((rule) => rule.id));
  const liabilityPaymentIntents = state.liabilityPaymentIntents.map((intent) => {
    if (intent.accountId !== liabilityAccountId) return intent;
    if (stopping && ["planned", "needs_confirmation", "confirmed", "failed"].includes(intent.status)) return {
      ...intent, status: "cancelled" as const, suspendedByTarget: true, failureReason: undefined, version: intent.version + 1,
    };
    if (status === "active" && intent.status === "cancelled" && intent.suspendedByTarget
      && (!intent.ruleId || activePaymentRuleIds.has(intent.ruleId))) return {
      ...intent, status: "needs_confirmation" as const, suspendedByTarget: false, failureReason: undefined, version: intent.version + 1,
    };
    return intent;
  });
  const liabilityObligations = closing ? state.liabilityObligations.map((obligation) =>
    obligation.accountId === liabilityAccountId && ["projected", "open", "due", "partial", "overdue"].includes(obligation.status)
      ? { ...obligation, status: "cancelled" as const, version: obligation.version + 1 }
      : obligation
  ) : state.liabilityObligations;
  const accounts = status === "archived" && liabilityAccountId
    ? state.accounts.map((account) => account.id === liabilityAccountId
      ? { ...account, archived: true, archivedAt: now, version: (account.version ?? 0) + 1 }
      : account)
    : state.accounts;
  const liabilities = state.liabilities.map((liability) => liability.accountId === liabilityAccountId
    ? { ...liability, status: liabilityStatus, version: liability.version + (liability.status === liabilityStatus ? 0 : 1) }
    : liability);
  const financialTargets = state.financialTargets.map((candidate) => candidate.id === targetId ? {
    ...candidate,
    status,
    completedAt: status === "completed" ? candidate.completedAt ?? now : status === "archived" ? candidate.completedAt : undefined,
    archivedAt: status === "archived" ? candidate.archivedAt ?? now : undefined,
    updatedAt: now,
    syncStatus: createClient() ? "pending" as const : "synced" as const,
    pendingOperationId,
  } : candidate);
  const liabilityCalendar = status === "archived" && liabilityAccountId
    ? state.liabilityCalendar.filter((item) => item.accountId !== liabilityAccountId)
    : state.liabilityCalendar.map((item) => {
      if (item.accountId !== liabilityAccountId) return item;
      const obligation = liabilityObligations.find((candidate) => candidate.id === item.id);
      const intent = liabilityPaymentIntents.find((candidate) => candidate.id === item.id);
      return obligation ? { ...item, status: obligation.status, version: obligation.version }
        : intent ? { ...item, status: intent.status, version: intent.version }
          : item;
    });
  const overviewItems = status === "archived" && liabilityAccountId
    ? state.liabilityOverview.items.filter((item) => item.accountId !== liabilityAccountId)
    : state.liabilityOverview.items.map((item) => item.accountId === liabilityAccountId ? {
      ...item,
      status: liabilityStatus,
      liabilityVersion: liabilities.find((liability) => liability.accountId === liabilityAccountId)?.version ?? item.liabilityVersion,
      liability: liabilities.find((liability) => liability.accountId === liabilityAccountId) ?? item.liability,
      paymentRule: liabilityPaymentRules.find((rule) => rule.accountId === liabilityAccountId),
      nextObligation: liabilityObligations.find((obligation) => obligation.accountId === liabilityAccountId
        && ["projected", "open", "due", "partial", "overdue"].includes(obligation.status))
        ? item.nextObligation
        : undefined,
    } : item);

  return {
    ...state,
    accounts,
    liabilities,
    liabilityPaymentRules,
    liabilityPaymentIntents,
    liabilityObligations,
    liabilityCalendar,
    recurringRules,
    recurringOccurrences,
    financialTargets,
    liabilityOverview: {
      ...state.liabilityOverview,
      items: overviewItems,
      totalReportingDebt: overviewItems.reduce((sum, item) => sum + item.reportingDebt, 0),
      coverage: "partial" as const,
    },
  };
}

function uid() {
  return crypto.randomUUID();
}

function transactionBuildContext() {
  return { syncStatus: (createClient() ? "pending" : "synced") as Transaction["syncStatus"] };
}

function errorMessage(error: unknown) {
  return userFacingSyncErrorMessage(error, "No fue posible sincronizar este cambio.");
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
    const reportAmount = transactionReportingAmount(transaction);
    const baseDelta = direction * accountDirection * reportAmount;
    next.accountBalancesBase![transaction.accountId] = (next.accountBalancesBase![transaction.accountId] ?? 0) + baseDelta;
    next.netWorth = (next.netWorth ?? 0) + baseDelta;
    if (transaction.occurredOn.slice(0, 7) !== snapshot.month.slice(0, 7)) continue;
    if (transaction.kind === "income") next.income += direction * reportAmount;
    if (transaction.kind === "expense") {
      next.expense += direction * reportAmount;
      if (transaction.categoryId) next.categorySpending[transaction.categoryId] = Math.max(0, (next.categorySpending[transaction.categoryId] ?? 0) + direction * reportAmount);
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

function adjustedTargetProgress(targets: FinancialTarget[], movements: Array<Pick<Transaction, "financialTargetId" | "financialTargetEffect" | "amount" | "baseAmount" | "exchangeRate">>, direction: 1 | -1) {
  const deltas = new Map<string, number>();
  for (const movement of movements) {
    if (!movement.financialTargetId || !movement.financialTargetEffect) continue;
    const reportAmount = transactionReportingAmount(movement);
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
      if (transaction.kind === "income") sum.income += transactionReportingAmount(transaction);
      if (transaction.kind === "expense") sum.expense += transactionReportingAmount(transaction);
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
    const expense = state.transactions.filter((transaction) => transaction.kind === "expense" && transaction.categoryId && ids.has(transaction.categoryId) && transaction.occurredOn >= firstMonth && transaction.occurredOn < nextMonth).reduce((sum, transaction) => sum + transactionReportingAmount(transaction), 0);
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
  const liabilityRoleByEvent = await loadRemoteTransactionLiabilityRoles(client, rows);
  return [...new Map(rows.map((row) => [row.id, transactionFromRow(row, row.ledger_event_id ? liabilityRoleByEvent.get(row.ledger_event_id) : undefined)])).values()];
}

function overlayPendingTransactionsOnReport(base: FinanceReport, state: FinanceState, remoteAffected: Transaction[], pendingItems: QueueItem[]) {
  const finalAffected = applyPendingTransactionQueue(remoteAffected, pendingItems);
  const months = base.months.map((month) => ({ ...month }));
  const monthByKey = new Map(months.map((month) => [month.month, month]));
  const groups = base.groups.map((group) => ({ ...group }));
  const groupByKey = new Map(groups.map((group) => [group.group, group]));

  const apply = (transaction: Transaction, direction: 1 | -1) => {
    const reportAmount = transactionReportingAmount(transaction);
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
    : monthTransactions.filter((transaction) => transaction.kind === "income").reduce((sum, transaction) => sum + transactionReportingAmount(transaction), 0);
  const spending = isSnapshotMonth
    ? state.snapshot!.categorySpending
    : monthTransactions.reduce<Record<string, number>>((totals, transaction) => {
      if (transaction.kind === "expense" && transaction.categoryId) totals[transaction.categoryId] = (totals[transaction.categoryId] ?? 0) + transactionReportingAmount(transaction);
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
  return item.operation.startsWith("transaction.")
    || item.operation === "planner.import"
    || item.operation === "credit-card.statement.upsert"
    || item.operation === "liability.obligation.upsert"
    || item.operation === "liability.payment.record";
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
  const relatedRows = pageRows.flatMap((row) => row.transfer_pair ? [row.transfer_pair] : []);
  const liabilityRoleByEvent = await loadRemoteTransactionLiabilityRoles(client, [...pageRows, ...relatedRows]);
  const toTransaction = (row: TransactionRow) => transactionFromRow(row, row.ledger_event_id ? liabilityRoleByEvent.get(row.ledger_event_id) : undefined);
  const items = pageRows.map(toTransaction).filter((transaction) => !transaction.kind.startsWith("adjustment"));
  const related = relatedRows.map(toTransaction);
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

  const reconcileRemote = useCallback(async (client: FinanceSupabaseClient, id: string, resetGenerationVerified = false) => {
    if (!resetGenerationVerified) await applyServerFinancialResetGeneration(client, id);
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
        const resetApplied = await applyServerFinancialResetGeneration(client, userId);
        if (resetApplied) applyPendingItems([]);
        if (options.flushOnly) {
          await localWriteChain.current;
          const flushed = await flushQueue(client, userId);
          applyPendingItems(flushed.pendingItems);
          setSyncError(flushed.error);
          if (flushed.pending > 0) return { status: "pending", pendingCount: flushed.pending, ...(flushed.error ? { error: flushed.error } : {}) };
          return { status: "synced", pendingCount: 0 };
        }
        const reconciliation = await reconcileRemote(client, userId, true);
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
        const resetGenerationVerified = navigator.onLine;
        if (resetGenerationVerified) await applyServerFinancialResetGeneration(client, identity.id);
        else await applyLocalFinanceResetGeneration(identity.id);
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

        const { flushed, remote, stableRevision, unstable } = await enqueueRemoteTask(() => reconcileRemote(client, identity.id, resetGenerationVerified));
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
      const flushed = await enqueueRemoteTask(async () => {
        const resetApplied = await applyServerFinancialResetGeneration(client, userId);
        if (resetApplied) {
          const remote = await loadRemoteFinanceState(client);
          await writeLocalState(userId, remote);
          replaceState(remote);
          applyPendingItems([]);
          broadcastFinanceChange(userId);
          setDataSource("remote");
          throw mutationFailure(operation, "La cuenta fue reiniciada mientras esta pantalla estaba abierta. Actualizamos sus datos; vuelve a registrar el cambio.", false);
        }
        return flushQueue(client, userId);
      });
      applyPendingItems(flushed.pendingItems);
      if (flushed.error) setSyncError(flushed.error);
      if (!flushed.pendingIds.has(queueItemId)) return syncedMutationResult(operation);
      return queuedMutationResult(operation, flushed.error ?? "Hay cambios anteriores pendientes; respetaremos su orden al reintentar.");
    } catch (error) {
      const message = errorMessage(error);
      setSyncError(message);
      if (error instanceof FinanceMutationError && !error.result.localSaved) throw error;
      await refreshPending(userId).catch(() => undefined);
      return queuedMutationResult(operation, message);
    }
  }, [applyPendingItems, enqueueRemoteTask, refreshPending, replaceState, userId]);

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
      client.from("recurring_rules").select("id,kind,amount,destination_amount,account_id,destination_account_id,category_id,financial_target_id,financial_target_effect,description,merchant,note,icon,exchange_rate,exchange_rate_date,exchange_rate_source,reference_exchange_rate,reference_rate_source,cadence,interval_count,starts_on,ends_on,anchor_day,second_anchor_day,weekday,posting_policy,timezone,auto_post,include_in_budget,include_in_income_target,status,suspended_by_target,next_run_on,created_at,updated_at").eq("id", ruleId).maybeSingle(),
      client.from("recurring_occurrences").select("id,rule_id,kind,scheduled_on,effective_on,amount,destination_amount,account_id,destination_account_id,category_id,financial_target_id,financial_target_effect,description,merchant,note,icon,exchange_rate,exchange_rate_date,exchange_rate_source,reference_exchange_rate,reference_rate_source,status,suspended_by_target,transaction_id,transfer_group_id,failure_reason,posted_at,created_at").eq("rule_id", ruleId).gte("effective_on", isoDateOffset(month, -45)).lte("effective_on", isoDateOffset(month, 430)).order("effective_on"),
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
    if (input.type === "transfer" && input.destinationAccountId
      && stateRef.current.liabilities.some((liability) => liability.accountId === input.destinationAccountId && liability.status !== "archived")) {
      throw new Error("Los abonos a deudas y tarjetas se registran desde su opción Pagar para aplicar correctamente capital, intereses y cargos.");
    }
    const sourceLiability = input.type === "transfer"
      ? stateRef.current.liabilities.find((liability) => liability.accountId === input.accountId && liability.status !== "archived")
      : undefined;
    const created = buildTransactions(input, stateRef.current.accounts, REPORTING_CURRENCY_CODE, transactionBuildContext())
      .map((transaction): Transaction => {
        if (!sourceLiability || transaction.accountId !== sourceLiability.accountId) return transaction;
        if (transaction.kind === "transfer_out" || (transaction.kind === "expense" && transaction.transferGroupId)) {
          return { ...transaction, liabilityRole: sourceLiability.kind === "credit_card" ? "cash_advance" : "drawdown" };
        }
        return transaction;
      });
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
    const created = inputs.flatMap((input) => buildTransactions(input, stateRef.current.accounts, REPORTING_CURRENCY_CODE, transactionBuildContext()));
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
    const created = input.transactions.flatMap((transaction) => buildTransactions(transaction, [...stateRef.current.accounts, account], REPORTING_CURRENCY_CODE, transactionBuildContext()));
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
    if (stateRef.current.creditCardPurchasePlans.some((plan) => plan.transactionId === id)) {
      throw new Error("Esta compra tiene cuotas vinculadas. Corrígela desde el detalle de la tarjeta para conservar el plan.");
    }
    if (selected.liabilityRole) throw new Error("Este movimiento pertenece a una deuda o tarjeta. Corrígelo desde su detalle para conservar el historial.");
    const existing = selected.transferGroupId ? stateRef.current.transactions.filter((transaction) => transaction.transferGroupId === selected.transferGroupId) : [selected];
    if (selected.transferGroupId && input.type !== "transfer") throw new Error("Una transferencia debe seguir siendo una transferencia.");
    if (!selected.transferGroupId && input.type === "transfer") throw new Error("Crea una transferencia nueva para cambiar el tipo.");

    const updated = selected.transferGroupId
      ? buildUpdatedTransfer(existing, input, stateRef.current.accounts, REPORTING_CURRENCY_CODE, transactionBuildContext())
      : [{ ...selected, ...buildTransactions(input, stateRef.current.accounts, REPORTING_CURRENCY_CODE, transactionBuildContext())[0], id: selected.id, ledgerEventId: selected.ledgerEventId }];
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
        ? buildUpdatedTransfer(currentExisting, input, current.accounts, REPORTING_CURRENCY_CODE, transactionBuildContext())
        : [{ ...currentSelected, ...buildTransactions(input, current.accounts, REPORTING_CURRENCY_CODE, transactionBuildContext())[0], id: currentSelected.id, ledgerEventId: currentSelected.ledgerEventId }])
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
    if (stateRef.current.creditCardPurchasePlans.some((plan) => plan.transactionId === id)) {
      throw new Error("Esta compra tiene cuotas vinculadas. Elimínala desde el detalle de la tarjeta para conservar el plan.");
    }
    if (selected?.liabilityRole || knownRows.some((transaction) => transaction.id === id && transaction.liabilityRole)) {
      throw new Error("Este movimiento pertenece a una deuda o tarjeta. Corrígelo desde su detalle para conservar el historial.");
    }
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
    const currentState = stateRef.current;
    const existing = currentState.financialTargets.find((target) => target.id === id);
    const existingLiability = existing?.kind === "debt"
      ? currentState.liabilities.find((liability) => liability.legacyTargetId === existing.id)
        ?? currentState.liabilities.find((liability) => liability.accountId === existing.accountId)
      : undefined;
    const existingLiabilityOverview = existing?.kind === "debt"
      ? currentState.liabilityOverview.items.find((item) => item.legacyTargetId === existing.id || item.accountId === existing.accountId)
      : undefined;
    const existingLiabilityAccountId = existingLiability?.accountId
      ?? existingLiabilityOverview?.accountId
      ?? (existing?.accountId && currentState.accounts.some((account) => account.id === existing.accountId && account.type === "credit") ? existing.accountId : undefined);
    const existingLiabilityAccount = currentState.accounts.find((account) => account.id === existingLiabilityAccountId);
    let protectedDebtInput = debtInput;
    if (existing?.kind === "debt" && existingLiabilityAccount && input.kind !== "debt") {
      throw new Error("Una deuda existente conserva su tipo contable. Puedes editar su nombre y plan, pero no convertirla en otra clase de meta.");
    }
    if (existing?.kind === "debt" && input.kind === "debt" && existingLiabilityAccount && existingLiabilityAccount.type === "credit") {
      if (Math.abs(input.targetAmount - existing.targetAmount) > 0.01) {
        throw new Error("El monto original de una deuda existente no se edita. El saldo cambia únicamente con movimientos, pagos o conciliaciones.");
      }
      protectedDebtInput = normalizeExistingDebtOpeningState(debtInput, {
        accountId: existingLiabilityAccount.id,
        currencyCode: existingLiabilityAccount.currencyCode === "USD" ? "USD" : "COP",
        currentPrincipal: existingLiabilityOverview?.nativeDebt
          ?? Math.max(-accountBalance(existingLiabilityAccount, currentState.transactions, currentState.snapshot), 0),
        openingExchangeRate: existingLiabilityAccount.openingExchangeRate,
      });
    }
    const normalizedDebt: FinancialTargetDebtInput | undefined = input.kind === "debt" ? {
      ...(protectedDebtInput ?? {}),
      liabilityAccountId: protectedDebtInput?.liabilityAccountId ?? existingLiabilityAccountId ?? uid(),
      principal: protectedDebtInput?.principal ?? Math.max(input.targetAmount - input.initialProgress, 0),
      currencyCode: protectedDebtInput?.currencyCode ?? "COP",
      termId: protectedDebtInput?.termId ?? uid(),
      rateId: protectedDebtInput?.rateValue !== undefined || protectedDebtInput?.effectiveAnnualRate !== undefined || protectedDebtInput?.annualInterestRate !== undefined
        ? protectedDebtInput.rateId ?? uid()
        : protectedDebtInput?.rateId,
      termsStartOn: protectedDebtInput?.termsStartOn ?? input.startsOn,
      paymentFrequency: protectedDebtInput?.paymentFrequency ?? "monthly",
      intervalCount: protectedDebtInput?.intervalCount ?? 1,
      calculationMethod: protectedDebtInput?.calculationMethod ?? "manual",
      amortizationMethod: protectedDebtInput?.amortizationMethod ?? "manual",
      periodicFee: protectedDebtInput?.periodicFee ?? 0,
      periodicInsurance: protectedDebtInput?.periodicInsurance ?? 0,
      variableRate: protectedDebtInput?.variableRate ?? false,
      prepaymentStrategy: protectedDebtInput?.prepaymentStrategy ?? "manual",
      rateBasis: protectedDebtInput?.rateBasis ?? "effective_annual",
      rateValue: protectedDebtInput?.rateValue ?? protectedDebtInput?.annualInterestRate,
      effectiveAnnualRate: protectedDebtInput?.effectiveAnnualRate ?? protectedDebtInput?.annualInterestRate,
    } : undefined;
    const targetAccountId = input.kind === "debt"
      ? normalizedDebt?.liabilityAccountId
      : targetInput.accountId;
    const target: FinancialTarget = {
      ...targetInput,
      accountId: targetAccountId,
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
    const payload = { target, debt: normalizedDebt };
    const { queueItemId } = await commitLocalState("financial-target.upsert", payload, (current, operationId) => {
      if (target.kind !== "debt" && target.accountId && !current.accounts.some((account) => account.id === target.accountId && !account.archived)) throw new Error("La cuenta vinculada ya no está disponible.");
      if (target.kind === "debt" && target.accountId && current.accounts.some((account) => account.id === target.accountId && (account.archived || account.type !== "credit"))) throw new Error("La obligación vinculada ya no está disponible.");
      if (target.kind === "debt" && normalizedDebt?.fundingAccountId && !current.accounts.some((account) => account.id === normalizedDebt.fundingAccountId && !account.archived && account.type !== "credit")) throw new Error("La cuenta desde la que pagarás ya no está disponible.");
      if (target.categoryId && !current.categories.some((category) => category.id === target.categoryId && !category.archived)) throw new Error("La categoría vinculada ya no está disponible.");
      const localTarget = { ...target, pendingOperationId: operationId };
      const debt: FinancialTargetDebtDetails | null = target.kind === "debt" && normalizedDebt ? {
        targetId: id,
        creditor: normalizedDebt.creditor,
        annualInterestRate: normalizedDebt.annualInterestRate ?? normalizedDebt.effectiveAnnualRate,
        minimumPayment: normalizedDebt.minimumPayment,
        dueDay: normalizedDebt.dueDay,
      } : null;
      const next: FinanceState = {
        ...current,
        financialTargets: [...current.financialTargets.filter((candidate) => candidate.id !== id), localTarget],
        financialTargetDebts: debt
          ? [...current.financialTargetDebts.filter((candidate) => candidate.targetId !== id), debt]
          : current.financialTargetDebts.filter((candidate) => candidate.targetId !== id),
      };
      return applyFinancialTargetLiabilityDraft(next, localTarget, normalizedDebt);
    });
    const result = await persist("financial-target.upsert", queueItemId);
    if (result.status === "synced" || result.status === "local") {
      await cacheState((current) => ({ ...current, financialTargets: current.financialTargets.map((candidate) => candidate.id === id && candidate.pendingOperationId === queueItemId ? { ...candidate, syncStatus: "synced", pendingOperationId: undefined } : candidate) }));
    }
    if (target.kind === "debt" && result.status === "synced") await syncNow();
    return result;
  }, [cacheState, commitLocalState, persist, syncNow]);

  const setFinancialTargetStatus = useCallback(async (id: string, status: FinancialTargetStatus) => {
    const now = new Date().toISOString();
    const current = stateRef.current;
    const target = current.financialTargets.find((candidate) => candidate.id === id);
    if (!target) throw new Error("La meta ya no está disponible.");
    if (target.status === "archived" && status !== "archived") throw new Error("Una meta archivada no se puede reabrir.");
    if (target.status === "completed" && status !== "archived" && status !== "completed") throw new Error("Una meta cumplida ya no se puede reanudar.");
    if (status === "active" && !["active", "paused"].includes(target.status)) throw new Error("Solo puedes reanudar una meta pausada.");
    if (target.kind === "debt" && ["completed", "archived"].includes(status)) {
      const liabilityAccountId = current.liabilities.find((liability) => liability.legacyTargetId === id || liability.accountId === target.accountId)?.accountId;
      const account = current.accounts.find((candidate) => candidate.id === liabilityAccountId);
      if (account && Math.abs(accountBalance(account, current.transactions, current.snapshot)) > 0.01) {
        throw new Error("Primero deja la deuda en cero. Así protegemos el saldo y el historial.");
      }
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: current.profile?.timezone ?? "America/Bogota" }).format(new Date());
      if (liabilityAccountId && current.transactions.some((movement) => movement.accountId === liabilityAccountId && movement.occurredOn > today)) {
        throw new Error("Hay movimientos futuros en esta deuda. Revísalos antes de cerrarla.");
      }
      if (liabilityAccountId && current.creditCardPurchasePlans.some((plan) => plan.accountId === liabilityAccountId && plan.status === "active")) {
        throw new Error("Todavía hay compras a cuotas activas. Termínalas antes de cerrar esta deuda.");
      }
    }
    const payload = { id, status };
    const { queueItemId } = await commitLocalState("financial-target.status", payload, (saved, operationId) =>
      applyFinancialTargetStatusDraft(saved, id, status, now, operationId)
    );
    const result = await persist("financial-target.status", queueItemId);
    if (result.status === "synced" || result.status === "local") await cacheState((current) => ({ ...current, financialTargets: current.financialTargets.map((target) => target.id === id && target.pendingOperationId === queueItemId ? { ...target, syncStatus: "synced", pendingOperationId: undefined } : target) }));
    if (target.kind === "debt" && result.status === "synced") await syncNow();
    return result;
  }, [cacheState, commitLocalState, persist, syncNow]);

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

  const addAccount = useCallback(async (account: Omit<Account, "id">) => {
    const name = cleanRequiredText(account.name, "El nombre de la cuenta", 100);
    assertFinanceAmount(account.initialBalance, { allowZero: true, allowNegative: true, label: "El saldo inicial" });
    const currencyCode = account.currencyCode ?? REPORTING_CURRENCY_CODE;
    assertSupportedAccountCurrency(currencyCode);
    if (currencyCode === "USD" && (!account.openingExchangeRate || account.openingExchangeRate <= 0)) throw new Error("Necesitamos una tasa válida para valorar el saldo inicial en dólares.");
    if (account.entityId && !stateRef.current.accountEntities.some((entity) => entity.id === account.entityId && !entity.archived)) throw new Error("La entidad elegida ya no está disponible.");
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

  const upsertCreditCard = useCallback(async (input: CreditCardInput) => {
    const name = cleanRequiredText(input.name, "El nombre de la tarjeta", 100);
    const accountId = input.accountId ?? uid();
    const existingAccount = stateRef.current.accounts.find((account) => account.id === accountId);
    const existingCard = stateRef.current.creditCards.find((card) => card.accountId === accountId);
    assertSupportedAccountCurrency(input.currencyCode);
    assertFinanceAmount(input.openingDebt, { allowZero: true, label: "La deuda inicial" });
    assertFinanceAmount(input.creditLimit, { allowZero: false, label: "El cupo" });
    if (input.openingDebt > input.creditLimit) throw new Error("La deuda inicial no puede superar el cupo de la tarjeta.");
    if (!Number.isInteger(input.cutoffDay) || input.cutoffDay < 1 || input.cutoffDay > 31) throw new Error("El día de corte debe estar entre 1 y 31.");
    if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 31) throw new Error("El día de pago debe estar entre 1 y 31.");
    if (input.lastFour && !/^\d{4}$/.test(input.lastFour)) throw new Error("Los últimos dígitos deben contener exactamente cuatro números.");
    if (existingAccount && existingAccount.type !== "credit") throw new Error("La cuenta elegida no es una tarjeta de crédito.");
    if (existingAccount && !input.accountVersion) throw new Error("La tarjeta todavía no tiene una versión sincronizada.");
    if (input.currencyCode === "USD" && !existingAccount && (!input.openingExchangeRate || input.openingExchangeRate <= 0)) throw new Error("Necesitamos una tasa válida para valorar la deuda inicial en dólares.");
    if (existingAccount && existingAccount.currencyCode !== input.currencyCode && accountCurrencyIsLocked(accountId, stateRef.current.snapshot, stateRef.current.transactions)) throw new Error("La moneda queda fija después del primer movimiento. Crea otra tarjeta para usar una divisa diferente.");
    if (input.entityId && !stateRef.current.accountEntities.some((entity) => entity.id === input.entityId && !entity.archived)) throw new Error("La entidad elegida ya no está disponible.");

    const payload = { ...input, accountId, name };
    const { queueItemId } = await commitLocalState("credit-card.upsert", payload, (current) => {
      const openingRate = input.currencyCode === "COP" ? 1 : input.openingExchangeRate ?? existingAccount?.openingExchangeRate ?? 1;
      const nextAccount: Account = existingAccount ? {
        ...existingAccount,
        name,
        color: input.color,
        icon: input.icon,
        entityId: input.entityId,
        currencyCode: input.currencyCode,
        version: (existingAccount.version ?? 1) + 1,
      } : {
        id: accountId,
        name,
        type: "credit",
        initialBalance: -input.openingDebt,
        color: input.color,
        icon: input.icon,
        currencyCode: input.currencyCode,
        entityId: input.entityId,
        openingBalanceDate: input.openingBalanceDate,
        openingExchangeRate: openingRate,
        version: 1,
      };
      const nextCard = {
        accountId,
        network: input.network,
        lastFour: input.lastFour,
        creditLimit: input.creditLimit,
        cutoffDay: input.cutoffDay,
        dueDay: input.dueDay,
        annualFee: input.annualFee,
        purchaseRateEa: input.purchaseRateEa,
        cashAdvanceRateEa: input.cashAdvanceRateEa,
        version: (existingCard?.version ?? 0) + 1,
      };
      const openingBase = -input.openingDebt * openingRate;
      return {
        ...current,
        accounts: existingAccount
          ? current.accounts.map((account) => account.id === accountId ? nextAccount : account)
          : [...current.accounts, nextAccount],
        creditCards: existingCard
          ? current.creditCards.map((card) => card.accountId === accountId ? nextCard : card)
          : [...current.creditCards, nextCard],
        snapshot: !existingAccount && current.snapshot ? {
          ...current.snapshot,
          accountBalances: { ...current.snapshot.accountBalances, [accountId]: -input.openingDebt },
          accountBalancesBase: { ...current.snapshot.accountBalancesBase, [accountId]: openingBase },
          netWorth: (current.snapshot.netWorth ?? Object.values(current.snapshot.accountBalancesBase ?? current.snapshot.accountBalances).reduce((sum, value) => sum + value, 0)) + openingBase,
        } : current.snapshot,
      };
    });
    return persist("credit-card.upsert", queueItemId);
  }, [commitLocalState, persist]);

  const addCreditCardPurchase = useCallback(async (input: CreditCardPurchaseInput) => {
    validateTransactionWrite(input.transaction);
    if (input.transaction.type !== "expense") throw new Error("Una compra con tarjeta debe registrarse como gasto.");
    if (!stateRef.current.creditCards.some((card) => card.accountId === input.transaction.accountId)) throw new Error("Selecciona una tarjeta de crédito configurada.");
    if (!Number.isInteger(input.installmentCount) || input.installmentCount < 1 || input.installmentCount > 120) throw new Error("El número de cuotas debe estar entre 1 y 120.");
    if (input.financingType === "known_rate" && !(input.annualEffectiveRate && input.annualEffectiveRate > 0)) throw new Error("Escribe la tasa efectiva anual de la compra.");
    const [preparedTransaction] = buildTransactions(input.transaction, stateRef.current.accounts, REPORTING_CURRENCY_CODE, transactionBuildContext());
    if (!preparedTransaction || preparedTransaction.kind !== "expense") throw new Error("No pudimos preparar la compra.");
    const transaction: Transaction = { ...preparedTransaction, liabilityRole: "purchase" };
    const planId = uid();
    const plan: CreditCardPurchasePlan = {
      id: planId,
      accountId: transaction.accountId,
      transactionId: transaction.id,
      installmentCount: input.installmentCount,
      financingType: input.financingType,
      annualEffectiveRate: input.annualEffectiveRate,
      firstDueOn: input.firstDueOn,
      status: "active",
    };
    const cardAccount = stateRef.current.accounts.find((account) => account.id === transaction.accountId);
    const installments = buildInstallmentSchedule({
      planId,
      amount: transaction.amount,
      installmentCount: input.installmentCount,
      firstDueOn: input.firstDueOn,
      financingType: input.financingType,
      annualEffectiveRate: input.annualEffectiveRate,
      currencyCode: cardAccount?.currencyCode === "USD" ? "USD" : "COP",
    });
    const payload = { transaction, plan, installments };
    const { queueItemId } = await commitLocalState("credit-card.purchase.create", payload, (current, operationId) => {
      const localTransaction = { ...transaction, pendingOperationId: operationId };
      return {
        ...current,
        transactions: mergeTransactions(current.transactions, [localTransaction]),
        creditCardPurchasePlans: [...current.creditCardPurchasePlans, plan],
        creditCardInstallments: [...current.creditCardInstallments, ...installments],
        snapshot: adjustedSnapshot(current.snapshot, [localTransaction], 1),
      };
    });
    const result = await persist("credit-card.purchase.create", queueItemId);
    if (result.status === "synced" || result.status === "local") {
      await cacheState((current) => ({
        ...current,
        transactions: current.transactions.map((item) => item.id === transaction.id && item.pendingOperationId === queueItemId ? { ...item, syncStatus: "synced", pendingOperationId: undefined } : item),
      }));
    }
    return result;
  }, [cacheState, commitLocalState, persist]);

  const previewLiabilityReconciliation = useCallback(async (
    accountId: string,
    cutoffOn: string,
    statementTotal: number,
    statement?: { id?: string; periodStart: string; interest: number; fees: number },
  ): Promise<LiabilityReconciliationPreview> => {
    const account = stateRef.current.accounts.find((candidate) => candidate.id === accountId);
    if (!account || account.type !== "credit") throw new Error("La obligación ya no está disponible.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoffOn)) throw new Error("La fecha de corte no es válida.");
    assertFinanceAmount(statementTotal, { allowZero: true, label: "El total del extracto" });
    const client = createClient();
    if (!client || !userId || userId === "demo") {
      return previewLocalCreditCardReconciliation(account, stateRef.current.transactions, cutoffOn, statementTotal, statement);
    }
    if (!navigator.onLine) throw new Error("Conéctate para comparar el extracto con el libro completo antes de conciliarlo.");
    if (pendingTransactionCount > 0) throw new Error("Sincroniza los movimientos pendientes antes de conciliar el extracto.");
    return previewRemoteLiabilityReconciliation(client, accountId, cutoffOn, statementTotal, statement);
  }, [pendingTransactionCount, userId]);

  const upsertCreditCardStatement = useCallback(async (input: CreditCardStatementInput) => {
    if (!stateRef.current.creditCards.some((card) => card.accountId === input.accountId)) throw new Error("La tarjeta ya no está disponible.");
    if (input.periodStart > input.periodEnd || input.periodEnd > input.cutoffOn || input.cutoffOn > input.dueOn) throw new Error("Las fechas del extracto no mantienen el orden esperado.");
    for (const [label, amount] of [["total a pagar", input.totalDue], ["pago mínimo", input.minimumDue], ["compras", input.purchases], ["avances", input.advances], ["intereses", input.interest], ["cargos", input.fees], ["pagos", input.payments], ["devoluciones", input.refunds]] as const) {
      assertFinanceAmount(amount, { allowZero: true, label: `El ${label}` });
    }
    if (input.minimumDue > input.totalDue) throw new Error("El pago mínimo no puede superar el total del extracto.");
    const existing = stateRef.current.creditCardStatements.find((statement) => input.id
      ? statement.id === input.id
      : statement.accountId === input.accountId && statement.cutoffOn === input.cutoffOn);
    const reconciliation = input.saveMode === "reconcile"
      ? await previewLiabilityReconciliation(input.accountId, input.cutoffOn, input.totalDue, {
        id: input.id,
        periodStart: input.periodStart,
        interest: input.interest,
        fees: input.fees,
      })
      : undefined;
    if (reconciliation?.requiresExchangeRate) {
      const account = stateRef.current.accounts.find((candidate) => candidate.id === input.accountId);
      if (account?.currencyCode === "USD" && (!input.reconciliationExchangeRate || input.reconciliationExchangeRate <= 0)) {
        throw new Error("Escribe la tasa exacta usada para los movimientos del extracto en dólares.");
      }
    }
    const { statement, reconcileDifference } = prepareCreditCardStatementSave(input, {
      existing,
      generatedId: uid(),
      reconciledAt: new Date().toISOString(),
      preview: reconciliation,
    });
    const overviewObligation = stateRef.current.liabilityOverview.items.find((item) => item.accountId === statement.accountId)?.nextObligation;
    const expectedObligationVersion = stateRef.current.liabilityObligations.find((obligation) => obligation.id === statement.id)?.version
      ?? (overviewObligation?.id === statement.id ? overviewObligation.version : undefined);
    const write = { ...creditCardStatementToLiabilityWrite(statement), expectedVersion: expectedObligationVersion, reconcileDifference };
    const { queueItemId } = await commitLocalState("credit-card.statement.upsert", write, (current) => {
      const obligation: LiabilityObligation = { ...write.obligation, version: statement.version ?? 1 };
      const account = current.accounts.find((candidate) => candidate.id === statement.accountId);
      const liability = current.liabilities.find((candidate) => candidate.accountId === statement.accountId);
      const previousCalendar = current.liabilityCalendar.find((item) => item.type === "obligation" && item.id === obligation.id);
      const allocated = previousCalendar ? Math.max(previousCalendar.amount - previousCalendar.remaining, 0) : 0;
      const next: FinanceState = {
        ...current,
        creditCardStatements: current.creditCardStatements.some((item) => item.id === statement.id)
          ? current.creditCardStatements.map((item) => item.id === statement.id ? statement : item)
          : [statement, ...current.creditCardStatements],
        liabilityObligations: current.liabilityObligations.some((item) => item.id === obligation.id)
          ? current.liabilityObligations.map((item) => item.id === obligation.id ? obligation : item)
          : [...current.liabilityObligations, obligation],
        liabilityCalendar: account && liability ? [
          ...current.liabilityCalendar.filter((item) => item.type !== "obligation" || item.id !== obligation.id),
          {
            date: obligation.dueOn,
            type: "obligation",
            id: obligation.id,
            accountId: obligation.accountId,
            accountName: account.name,
            currencyCode: account.currencyCode === "USD" ? "USD" : "COP",
            liabilityKind: liability.kind,
            status: obligation.status,
            amount: obligation.totalDue,
            remaining: Math.max(obligation.totalDue - allocated, 0),
            minimumDue: obligation.minimumDue,
            sequenceNumber: obligation.sequenceNumber,
            version: obligation.version,
          },
        ] : current.liabilityCalendar,
      };
      return { ...next, liabilityOverview: localLiabilityOverview(next, input.accountId) };
    });
    const result = await persist("credit-card.statement.upsert", queueItemId);
    if (input.saveMode === "reconcile" && result.status === "synced") await syncNow();
    return result;
  }, [commitLocalState, persist, previewLiabilityReconciliation, syncNow]);

  const upsertLiability = useCallback(async (input: LiabilityInput) => {
    if (input.account.id !== input.liability.accountId) throw new Error("La cuenta y la obligación no coinciden.");
    const name = cleanRequiredText(input.account.name, "El nombre de la obligación", 100);
    assertFinanceAmount(input.account.openingDebt, { allowZero: true, label: "La deuda inicial" });
    assertSupportedAccountCurrency(input.account.currencyCode);
    if (input.account.currencyCode === "USD" && (!input.account.openingExchangeRate || input.account.openingExchangeRate <= 0)) {
      throw new Error("Necesitamos una tasa válida para valorar la deuda inicial en dólares.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.account.openingBalanceDate)) throw new Error("La fecha inicial de la obligación no es válida.");
    if (input.liability.originatedOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.liability.originatedOn)) throw new Error("La fecha de origen no es válida.");
    if (input.liability.maturityOn && (!/^\d{4}-\d{2}-\d{2}$/.test(input.liability.maturityOn) || (input.liability.originatedOn && input.liability.maturityOn < input.liability.originatedOn))) throw new Error("La fecha final de la obligación no es válida.");
    if (input.liability.originalPrincipal !== undefined) assertFinanceAmount(input.liability.originalPrincipal, { allowZero: true, label: "El capital original" });
    assertOptionalText(input.liability.creditorName, "El acreedor", 120);
    const existingAccount = stateRef.current.accounts.find((account) => account.id === input.account.id);
    if (existingAccount && existingAccount.type !== "credit") throw new Error("Una obligación solo puede usar una cuenta pasiva.");
    if (existingAccount && existingAccount.currencyCode !== input.account.currencyCode && accountCurrencyIsLocked(input.account.id, stateRef.current.snapshot, stateRef.current.transactions)) {
      throw new Error("La moneda de una obligación con movimientos no puede cambiarse.");
    }
    const payload: LiabilityInput = { ...input, account: { ...input.account, name } };
    const { queueItemId } = await commitLocalState("liability.upsert", payload, (current) => {
      if (input.account.entityId && !current.accountEntities.some((entity) => entity.id === input.account.entityId && !entity.archived)) throw new Error("La entidad elegida ya no está disponible.");
      const savedAccount = current.accounts.find((account) => account.id === input.account.id);
      const savedLiability = current.liabilities.find((liability) => liability.accountId === input.account.id);
      const openingRate = input.account.currencyCode === "COP" ? 1 : input.account.openingExchangeRate!;
      const nextAccount: Account = savedAccount ? {
        ...savedAccount,
        name,
        color: input.account.color,
        icon: input.account.icon,
        currencyCode: input.account.currencyCode,
        entityId: input.account.entityId,
        version: (savedAccount.version ?? input.account.version ?? 0) + 1,
      } : {
        id: input.account.id,
        name,
        type: "credit",
        initialBalance: -input.account.openingDebt,
        color: input.account.color,
        icon: input.account.icon,
        currencyCode: input.account.currencyCode,
        entityId: input.account.entityId,
        openingBalanceDate: input.account.openingBalanceDate,
        openingExchangeRate: openingRate,
        version: 1,
      };
      const nextLiability = {
        ...input.liability,
        creditorName: input.liability.creditorName?.trim() || undefined,
        migrationStatus: savedLiability?.migrationStatus ?? "native" as const,
        version: (savedLiability?.version ?? input.liability.version ?? 0) + 1,
      };
      const openingBase = -input.account.openingDebt * openingRate;
      const next: FinanceState = {
        ...current,
        accounts: savedAccount
          ? current.accounts.map((account) => account.id === input.account.id ? nextAccount : account)
          : [...current.accounts, nextAccount],
        liabilities: savedLiability
          ? current.liabilities.map((liability) => liability.accountId === input.account.id ? nextLiability : liability)
          : [...current.liabilities, nextLiability],
        snapshot: !savedAccount && current.snapshot ? {
          ...current.snapshot,
          accountBalances: { ...current.snapshot.accountBalances, [input.account.id]: -input.account.openingDebt },
          accountBalancesBase: { ...current.snapshot.accountBalancesBase, [input.account.id]: openingBase },
          netWorth: (current.snapshot.netWorth ?? 0) + openingBase,
        } : current.snapshot,
      };
      return { ...next, liabilityOverview: localLiabilityOverview(next, input.account.id) };
    });
    return persist("liability.upsert", queueItemId);
  }, [commitLocalState, persist]);

  const upsertLiabilityTerms = useCallback(async (input: LiabilityTermsInput) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startsOn) || (input.endsOn && input.endsOn < input.startsOn)) throw new Error("La vigencia de las condiciones no es válida.");
    if (!Number.isInteger(input.intervalCount) || input.intervalCount < 1 || input.intervalCount > 120) throw new Error("El intervalo de pago no es válido.");
    for (const [label, value] of [["cargo periódico", input.periodicFee], ["seguro periódico", input.periodicInsurance]] as const) {
      assertFinanceAmount(value, { allowZero: true, label: `El ${label}` });
    }
    if (input.rates.length > 20) throw new Error("Solo se admiten hasta 20 tasas por vigencia.");
    for (const rate of input.rates) {
      if (!Number.isFinite(rate.reportedValue) || rate.reportedValue < 0) throw new Error("La tasa no es válida.");
      if (rate.effectiveAnnualRate !== undefined && (!Number.isFinite(rate.effectiveAnnualRate) || rate.effectiveAnnualRate < 0)) throw new Error("La tasa efectiva anual no es válida.");
    }
    const { queueItemId } = await commitLocalState("liability.terms.upsert", input, (current) => {
      if (!current.liabilities.some((liability) => liability.accountId === input.accountId && liability.status !== "archived")) throw new Error("La obligación ya no está disponible.");
      const existing = current.liabilityTerms.find((term) => term.id === input.id);
      const { rates, ...termInput } = input;
      const term: LiabilityTerms = { ...termInput, version: (existing?.version ?? input.version ?? 0) + 1 };
      const nextRates: LiabilityRatePeriod[] = rates.map((rate) => ({ ...rate, accountId: input.accountId }));
      const rateIds = new Set(nextRates.map((rate) => rate.id));
      const next: FinanceState = {
        ...current,
        liabilityTerms: existing
          ? current.liabilityTerms.map((candidate) => candidate.id === input.id ? term : candidate)
          : [...current.liabilityTerms, term],
        liabilityRatePeriods: [
          ...current.liabilityRatePeriods.filter((rate) => rate.accountId !== input.accountId || !rateIds.has(rate.id)),
          ...nextRates,
        ],
      };
      return { ...next, liabilityOverview: localLiabilityOverview(next, input.accountId) };
    });
    return persist("liability.terms.upsert", queueItemId);
  }, [commitLocalState, persist]);

  const saveLiabilityObligation = useCallback(async (input: LiabilityObligationWriteInput) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.obligation.dueOn)) throw new Error("La fecha de la obligación no es válida.");
    for (const [label, amount] of [["capital", input.obligation.principalDue], ["interés", input.obligation.interestDue], ["cargos", input.obligation.feeDue], ["pago mínimo", input.obligation.minimumDue], ["total", input.obligation.totalDue]] as const) {
      assertFinanceAmount(amount, { allowZero: true, label: `El ${label}` });
    }
    if (input.obligation.minimumDue > input.obligation.totalDue) throw new Error("El pago mínimo no puede superar el total.");
    if ((input.adjustments?.length ?? 0) > 50) throw new Error("Solo se admiten hasta 50 ajustes por conciliación.");
    const { queueItemId } = await commitLocalState("liability.obligation.upsert", input, (current, operationId) => {
      const account = current.accounts.find((candidate) => candidate.id === input.obligation.accountId && !candidate.archived);
      if (!account || !current.liabilities.some((liability) => liability.accountId === account.id && liability.status !== "archived")) throw new Error("La obligación ya no está disponible.");
      const existing = current.liabilityObligations.find((obligation) => obligation.id === input.obligation.id);
      const obligation: LiabilityObligation = { ...input.obligation, version: (existing?.version ?? input.obligation.version ?? 0) + 1 };
      const liability = current.liabilities.find((candidate) => candidate.accountId === account.id)!;
      const previousCalendar = current.liabilityCalendar.find((item) => item.type === "obligation" && item.id === obligation.id);
      const allocated = previousCalendar ? Math.max(previousCalendar.amount - previousCalendar.remaining, 0) : 0;
      const now = new Date().toISOString();
      const localAdjustments: Transaction[] = (input.adjustments ?? []).map((adjustment) => {
        assertFinanceAmount(adjustment.amount, { label: "El ajuste" });
        const exchangeRate = account.currencyCode === "USD" ? adjustment.exchangeRate : 1;
        if (!exchangeRate || exchangeRate <= 0) throw new Error("El ajuste en dólares necesita una tasa exacta.");
        const occurredOn = adjustment.occurredOn ?? input.obligation.periodEnd ?? input.obligation.dueOn;
        return {
          id: adjustment.id,
          kind: adjustment.kind,
          amount: adjustment.amount,
          accountId: account.id,
          categoryId: adjustment.categoryId,
          description: adjustment.description?.trim() || "Conciliación de obligación",
          merchant: adjustment.merchant?.trim() || undefined,
          note: adjustment.note?.trim() || undefined,
          icon: adjustment.icon,
          occurredOn,
          createdAt: now,
          nativeCurrencyCode: account.currencyCode ?? "COP",
          baseCurrencyCode: REPORTING_CURRENCY_CODE,
          baseAmount: adjustment.amount * exchangeRate,
          exchangeRate,
          exchangeRateDate: adjustment.exchangeRateDate ?? occurredOn,
          exchangeRateSource: account.currencyCode === "USD" ? adjustment.exchangeRateSource ?? "manual" : "same_currency",
          referenceExchangeRate: adjustment.referenceExchangeRate,
          referenceRateSource: adjustment.referenceRateSource,
          syncStatus: createClient() ? "pending" : "synced",
          pendingOperationId: operationId,
        };
      });
      const next: FinanceState = {
        ...current,
        liabilityObligations: existing
          ? current.liabilityObligations.map((candidate) => candidate.id === obligation.id ? obligation : candidate)
          : [...current.liabilityObligations, obligation],
        creditCardStatements: input.statement
          ? current.creditCardStatements.some((statement) => statement.id === input.statement!.id)
            ? current.creditCardStatements.map((statement) => statement.id === input.statement!.id ? input.statement! : statement)
            : [input.statement, ...current.creditCardStatements]
          : current.creditCardStatements,
        transactions: mergeTransactions(current.transactions, localAdjustments),
        snapshot: adjustedSnapshot(current.snapshot, localAdjustments, 1),
        financialTargets: adjustedTargetProgress(current.financialTargets, localAdjustments, 1),
        liabilityCalendar: [
          ...current.liabilityCalendar.filter((item) => item.type !== "obligation" || item.id !== obligation.id),
          {
            date: obligation.dueOn,
            type: "obligation",
            id: obligation.id,
            accountId: obligation.accountId,
            accountName: account.name,
            currencyCode: account.currencyCode === "USD" ? "USD" : "COP",
            liabilityKind: liability.kind,
            status: obligation.status,
            amount: obligation.totalDue,
            remaining: Math.max(obligation.totalDue - allocated, 0),
            minimumDue: obligation.minimumDue,
            sequenceNumber: obligation.sequenceNumber,
            version: obligation.version,
          },
        ],
      };
      return { ...next, liabilityOverview: localLiabilityOverview(next, account.id) };
    });
    const result = await persist("liability.obligation.upsert", queueItemId);
    if (input.reconcileDifference && result.status === "synced") await syncNow();
    return result;
  }, [commitLocalState, persist, syncNow]);

  const upsertLiabilityObligation = useCallback((input: LiabilityObligationWriteInput) => saveLiabilityObligation(input), [saveLiabilityObligation]);
  const reconcileLiabilityObligation = useCallback((input: LiabilityReconciliationInput) => saveLiabilityObligation({ ...input, reconcileDifference: true }), [saveLiabilityObligation]);

  const upsertLiabilityPaymentRule = useCallback(async (input: LiabilityPaymentRuleInput) => {
    if (input.accountId === input.fundingAccountId) throw new Error("La cuenta de pago debe ser diferente de la obligación.");
    if (!Number.isInteger(input.daysBeforeDue) || input.daysBeforeDue < 0 || input.daysBeforeDue > 30) throw new Error("La anticipación del pago debe estar entre 0 y 30 días.");
    if (input.strategy === "fixed") assertFinanceAmount(input.fixedAmount ?? 0, { label: "El pago fijo" });
    if (input.maximumAmount !== undefined) assertFinanceAmount(input.maximumAmount, { label: "El pago máximo" });
    if (input.strategy === "fixed" && input.maximumAmount !== undefined && input.fixedAmount !== undefined && input.maximumAmount < input.fixedAmount) throw new Error("El pago máximo no puede ser menor que el pago fijo.");
    const { queueItemId } = await commitLocalState("liability.payment-rule.upsert", input, (current) => {
      if (!current.liabilities.some((liability) => liability.accountId === input.accountId && liability.status !== "archived")) throw new Error("La obligación ya no está disponible.");
      if (!current.accounts.some((account) => account.id === input.fundingAccountId && !account.archived && account.id !== input.accountId)) throw new Error("La cuenta de pago ya no está disponible.");
      const existing = current.liabilityPaymentRules.find((rule) => rule.id === input.id);
      const rule: LiabilityPaymentRule = { ...input, version: (existing?.version ?? input.version ?? 0) + 1 };
      const next: FinanceState = {
        ...current,
        liabilityPaymentRules: existing
          ? current.liabilityPaymentRules.map((candidate) => candidate.id === input.id ? rule : candidate)
          : [...current.liabilityPaymentRules, rule],
      };
      return { ...next, liabilityOverview: localLiabilityOverview(next, input.accountId) };
    });
    return persist("liability.payment-rule.upsert", queueItemId);
  }, [commitLocalState, persist]);

  const recordLiabilityPayment = useCallback(async (input: LiabilityPaymentInput) => {
    assertFinanceAmount(input.liabilityAmount, { label: "El pago de la obligación" });
    if (input.fundingAmount !== undefined) assertFinanceAmount(input.fundingAmount, { label: "El débito de la cuenta" });
    if (!(input.fundingExchangeRate > 0) || !(input.liabilityExchangeRate > 0)) throw new Error("Las tasas del pago deben ser positivas.");
    const current = stateRef.current;
    const fundingAccount = current.accounts.find((account) => account.id === input.fundingAccountId && !account.archived);
    const liabilityAccount = current.accounts.find((account) => account.id === input.accountId && !account.archived);
    const liability = current.liabilities.find((candidate) => candidate.accountId === input.accountId && candidate.status !== "archived");
    if (!fundingAccount || !liabilityAccount || !liability) throw new Error("Las cuentas del pago ya no están disponibles.");
    if (fundingAccount.id === liabilityAccount.id) throw new Error("La cuenta de pago debe ser diferente de la obligación.");
    const fundingRate = fundingAccount.currencyCode === "COP" ? 1 : input.fundingExchangeRate;
    const liabilityRate = liabilityAccount.currencyCode === "COP" ? 1 : input.liabilityExchangeRate;
    const fundingAmount = input.fundingAmount ?? (input.liabilityAmount * liabilityRate) / fundingRate;
    // The ledger reports in COP. Allow only the smallest reporting rounding
    // difference instead of comparing floating-point products bit for bit.
    if (Math.abs(fundingAmount * fundingRate - input.liabilityAmount * liabilityRate) > 0.01) throw new Error("Ambos lados del pago deben representar el mismo valor en pesos.");
    if ((input.allocations?.length ?? 0) > 200) throw new Error("Solo se admiten hasta 200 asignaciones por pago.");
    const allocationIds = new Set<string>();
    let allocatedTotal = 0;
    for (const allocation of input.allocations ?? []) {
      if (allocationIds.has(allocation.obligationId)) throw new Error("Cada cuota solo puede asignarse una vez dentro del pago.");
      allocationIds.add(allocation.obligationId);
      assertFinanceAmount(allocation.amount, { label: "La asignación del pago" });
      if (allocation.allocatedOn && !/^\d{4}-\d{2}-\d{2}$/.test(allocation.allocatedOn)) throw new Error("La fecha de asignación no es válida.");
      const known = current.liabilityObligations.find((obligation) => obligation.id === allocation.obligationId);
      if (known && known.accountId !== input.accountId) throw new Error("La cuota no pertenece a esta obligación.");
      allocatedTotal += allocation.amount;
    }
    if (allocatedTotal > input.liabilityAmount + 0.01) throw new Error("Las asignaciones superan el pago de la obligación.");
    const paymentCosts = (input.allocations ?? []).reduce((total, allocation) => {
      const known = current.liabilityObligations.find((obligation) => obligation.id === allocation.obligationId);
      const summary = current.liabilityOverview?.items.find((item) => item.accountId === input.accountId)?.nextObligation;
      const obligation = known ?? (summary?.id === allocation.obligationId ? summary : undefined);
      if (!obligation) return total;
      const calendar = current.liabilityCalendar.find((item) => item.type === "obligation" && item.id === allocation.obligationId);
      const allocated = calendar ? Math.max(calendar.amount - calendar.remaining, 0) : "allocated" in obligation ? obligation.allocated : 0;
      const split = liabilityPaymentBreakdown({
        amount: allocation.amount,
        allocated,
        interestDue: obligation.interestDue,
        feeDue: obligation.feeDue,
        includeContractCosts: liability.kind !== "credit_card",
      });
      return { interest: total.interest + split.interest, fee: total.fee + split.fee };
    }, { interest: 0, fee: 0 });
    const paymentDate = input.occurredOn ?? new Date().toISOString().slice(0, 10);
    const extraPrincipal = Math.max(input.liabilityAmount - allocatedTotal, 0);
    if (extraPrincipal > 0.01) {
      for (const allocation of input.allocations ?? []) {
        const known = current.liabilityObligations.find((obligation) => obligation.id === allocation.obligationId);
        const calendar = current.liabilityCalendar.find((item) => item.type === "obligation" && item.id === allocation.obligationId);
        const remaining = calendar?.remaining ?? known?.totalDue;
        if (remaining !== undefined && allocation.amount < remaining - 0.01) {
          throw new Error("Termina primero la cuota pendiente antes de enviar dinero extra a capital.");
        }
      }
    }
    const allocatedIds = new Set((input.allocations ?? []).map((allocation) => allocation.obligationId));
    const overviewItem = current.liabilityOverview.items.find((item) => item.accountId === input.accountId)
      ?? localLiabilityOverview(current, input.accountId).items[0];
    const currentDebt = Math.max(-accountBalance(liabilityAccount, current.transactions, current.snapshot), 0);
    const principalAfterPayment = Math.max(
      currentDebt - Math.max(input.liabilityAmount - paymentCosts.interest - paymentCosts.fee, 0),
      0,
    );
    const recalculatedFuture = input.futureObligations ?? (overviewItem
      ? recalculateFixedLiabilityPrepayment({
          item: overviewItem,
          obligations: current.liabilityObligations.filter((obligation) => !allocatedIds.has(obligation.id)),
          paidOn: paymentDate,
          principalAfterPayment,
          extraPrincipal,
        })
      : undefined);
    const normalized: LiabilityPaymentInput = {
      ...input,
      id: input.id ?? uid(),
      fundingAmount,
      occurredOn: paymentDate,
      description: input.description?.trim() || "Pago de obligación",
      transferGroupId: input.transferGroupId ?? uid(),
      fundingTransactionId: input.fundingTransactionId ?? uid(),
      liabilityTransactionId: input.liabilityTransactionId ?? uid(),
      interestTransactionId: paymentCosts.interest > 0 ? input.interestTransactionId ?? uid() : undefined,
      feeTransactionId: paymentCosts.fee > 0 ? input.feeTransactionId ?? uid() : undefined,
      futureObligations: recalculatedFuture,
    };
    const { queueItemId } = await commitLocalState("liability.payment.record", normalized, (saved, operationId) => {
      const transferGroupId = normalized.transferGroupId!;
      const createdAt = new Date().toISOString();
      const linkedTarget = saved.financialTargets.find((target) => target.kind === "debt" && target.accountId === normalized.accountId && target.status !== "archived");
      const chargeTransactions: Transaction[] = [];
      if (paymentCosts.interest > 0 && normalized.interestTransactionId) chargeTransactions.push({
          id: normalized.interestTransactionId,
          liabilityRole: "interest",
          kind: "expense",
          amount: paymentCosts.interest,
          accountId: normalized.accountId,
          categoryId: linkedTarget?.categoryId,
          description: "Intereses del pago de obligación",
          occurredOn: normalized.occurredOn!,
          createdAt,
          nativeCurrencyCode: liabilityAccount.currencyCode ?? "COP",
          baseCurrencyCode: REPORTING_CURRENCY_CODE,
          baseAmount: paymentCosts.interest * liabilityRate,
          exchangeRate: liabilityRate,
          exchangeRateDate: normalized.occurredOn,
          exchangeRateSource: liabilityAccount.currencyCode === "COP" ? "same_currency" : normalized.liabilityExchangeRateSource ?? "manual",
          syncStatus: createClient() ? "pending" : "synced",
          pendingOperationId: operationId,
        });
      if (paymentCosts.fee > 0 && normalized.feeTransactionId) chargeTransactions.push({
          id: normalized.feeTransactionId,
          liabilityRole: "fee",
          kind: "expense",
          amount: paymentCosts.fee,
          accountId: normalized.accountId,
          categoryId: linkedTarget?.categoryId,
          description: "Cargos del pago de obligación",
          occurredOn: normalized.occurredOn!,
          createdAt,
          nativeCurrencyCode: liabilityAccount.currencyCode ?? "COP",
          baseCurrencyCode: REPORTING_CURRENCY_CODE,
          baseAmount: paymentCosts.fee * liabilityRate,
          exchangeRate: liabilityRate,
          exchangeRateDate: normalized.occurredOn,
          exchangeRateSource: liabilityAccount.currencyCode === "COP" ? "same_currency" : normalized.liabilityExchangeRateSource ?? "manual",
          syncStatus: createClient() ? "pending" : "synced",
          pendingOperationId: operationId,
        });
      const transactions: Transaction[] = [
        ...chargeTransactions,
        {
          id: normalized.fundingTransactionId!, kind: "transfer_out", amount: fundingAmount,
          liabilityRole: "payment",
          accountId: normalized.fundingAccountId, transferGroupId, description: normalized.description!,
          occurredOn: normalized.occurredOn!, createdAt, nativeCurrencyCode: fundingAccount.currencyCode ?? "COP",
          baseCurrencyCode: REPORTING_CURRENCY_CODE, baseAmount: fundingAmount * fundingRate,
          exchangeRate: fundingRate, exchangeRateDate: normalized.occurredOn,
          exchangeRateSource: fundingAccount.currencyCode === "COP" ? "same_currency" : normalized.fundingExchangeRateSource ?? "manual",
          syncStatus: createClient() ? "pending" : "synced", pendingOperationId: operationId,
        },
        {
          id: normalized.liabilityTransactionId!, kind: "transfer_in", amount: normalized.liabilityAmount,
          liabilityRole: "payment",
          accountId: normalized.accountId, transferGroupId, description: normalized.description!,
          occurredOn: normalized.occurredOn!, createdAt, nativeCurrencyCode: liabilityAccount.currencyCode ?? "COP",
          baseCurrencyCode: REPORTING_CURRENCY_CODE, baseAmount: normalized.liabilityAmount * liabilityRate,
          exchangeRate: liabilityRate, exchangeRateDate: normalized.occurredOn,
          exchangeRateSource: liabilityAccount.currencyCode === "COP" ? "same_currency" : normalized.liabilityExchangeRateSource ?? "manual",
          syncStatus: createClient() ? "pending" : "synced", pendingOperationId: operationId,
        },
      ];
      const allocations = new Map((normalized.allocations ?? []).map((allocation) => [allocation.obligationId, allocation.amount]));
      let nextObligations = saved.liabilityObligations.map((obligation) => {
        const paid = allocations.get(obligation.id);
        if (!paid) return obligation;
        const calendar = saved.liabilityCalendar.find((item) => item.type === "obligation" && item.id === obligation.id);
        const previouslyPaid = calendar ? Math.max(calendar.amount - calendar.remaining, 0) : 0;
        return { ...obligation, status: previouslyPaid + paid >= obligation.totalDue - 0.01 ? "paid" as const : "partial" as const, version: obligation.version + 1 };
      });
      if (normalized.futureObligations) {
        const replacements = new Map(normalized.futureObligations.map((obligation) => [obligation.id, { ...obligation, version: (obligation.version ?? 0) + 1 }]));
        nextObligations = nextObligations.map((obligation) => {
          const replacement = replacements.get(obligation.id);
          if (replacement) return replacement;
          if (obligation.accountId === normalized.accountId && obligation.source === "contract"
            && ["projected", "open"].includes(obligation.status) && obligation.dueOn > normalized.occurredOn!) {
            return { ...obligation, status: "cancelled" as const, version: obligation.version + 1 };
          }
          return obligation;
        });
        for (const obligation of replacements.values()) {
          if (!nextObligations.some((candidate) => candidate.id === obligation.id)) nextObligations.push(obligation);
        }
      }
      let nextCalendar = saved.liabilityCalendar.map((item) => {
        if (item.type === "payment_intent" && item.id === normalized.intentId) return { ...item, status: "posted" as const, ledgerEventId: transferGroupId, version: item.version + 1 };
        if (item.type !== "obligation") return item;
        const paid = allocations.get(item.id);
        if (!paid) return item;
        const remaining = Math.max(item.remaining - paid, 0);
        return { ...item, remaining, status: remaining <= 0.01 ? "paid" as const : "partial" as const, version: item.version + 1 };
      });
      if (normalized.futureObligations) {
        nextCalendar = [
          ...nextCalendar.filter((item) => item.type !== "obligation" || item.accountId !== normalized.accountId
            || item.date <= normalized.occurredOn! || !["projected", "open"].includes(item.status)),
          ...normalized.futureObligations.map((obligation) => ({
            date: obligation.dueOn,
            type: "obligation" as const,
            id: obligation.id,
            accountId: normalized.accountId,
            accountName: liabilityAccount.name,
            currencyCode: liabilityAccount.currencyCode === "USD" ? "USD" as const : "COP" as const,
            liabilityKind: liability.kind,
            amount: obligation.totalDue,
            remaining: obligation.totalDue,
            minimumDue: obligation.minimumDue,
            sequenceNumber: obligation.sequenceNumber,
            status: obligation.status,
            version: (obligation.version ?? 0) + 1,
          })),
        ];
      }
      const next: FinanceState = {
        ...saved,
        transactions: mergeTransactions(saved.transactions, transactions),
        snapshot: adjustedSnapshot(saved.snapshot, transactions, 1),
        financialTargets: adjustedTargetProgress(saved.financialTargets, transactions, 1),
        liabilityObligations: nextObligations,
        liabilityPaymentIntents: normalized.intentId
          ? saved.liabilityPaymentIntents.map((intent) => intent.id === normalized.intentId ? { ...intent, status: "posted", ledgerEventId: transferGroupId, version: intent.version + 1 } : intent)
          : saved.liabilityPaymentIntents,
        liabilityCalendar: nextCalendar,
      };
      return { ...next, liabilityOverview: localLiabilityOverview(next, normalized.accountId) };
    });
    const result = await persist("liability.payment.record", queueItemId);
    if (result.status === "synced" || result.status === "local") {
      const ids = new Set([
        normalized.fundingTransactionId!,
        normalized.liabilityTransactionId!,
        ...(normalized.interestTransactionId ? [normalized.interestTransactionId] : []),
        ...(normalized.feeTransactionId ? [normalized.feeTransactionId] : []),
      ]);
      await cacheState((saved) => ({
        ...saved,
        transactions: saved.transactions.map((transaction) => ids.has(transaction.id) && transaction.pendingOperationId === queueItemId
          ? { ...transaction, syncStatus: "synced", pendingOperationId: undefined }
          : transaction),
      }));
    }
    return result;
  }, [cacheState, commitLocalState, persist]);

  const archiveLiability = useCallback(async (input: LiabilityArchiveInput) => {
    const current = stateRef.current;
    const account = current.accounts.find((candidate) => candidate.id === input.accountId && !candidate.archived);
    const liability = current.liabilities.find((candidate) => candidate.accountId === input.accountId && candidate.status !== "archived");
    if (!account || !liability) throw new Error("La obligación ya no está disponible.");
    if (Math.abs(accountBalance(account, current.transactions, current.snapshot)) > 0.01) throw new Error("Deja la obligación en cero antes de archivarla.");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: current.profile?.timezone ?? "America/Bogota" }).format(new Date());
    if (current.transactions.some((movement) => movement.accountId === input.accountId && movement.occurredOn > today)) throw new Error("Hay movimientos futuros en esta deuda. Revísalos antes de archivarla.");
    if (current.creditCardPurchasePlans.some((plan) => plan.accountId === input.accountId && plan.status === "active")) throw new Error("Todavía hay compras a cuotas activas. Termínalas antes de archivar esta deuda.");
    const { queueItemId } = await commitLocalState("liability.archive", input, (saved) => {
      const linkedTarget = saved.financialTargets.find((target) => target.kind === "debt"
        && (target.id === liability.legacyTargetId || target.accountId === input.accountId));
      if (linkedTarget) return applyFinancialTargetStatusDraft(saved, linkedTarget.id, "archived", new Date().toISOString());
      const items = saved.liabilityOverview.items.filter((item) => item.accountId !== input.accountId);
      return {
        ...saved,
        accounts: saved.accounts.map((candidate) => candidate.id === input.accountId ? { ...candidate, archived: true, archivedAt: new Date().toISOString(), version: (candidate.version ?? 0) + 1 } : candidate),
        liabilities: saved.liabilities.map((candidate) => candidate.accountId === input.accountId ? { ...candidate, status: "archived" } : candidate),
        liabilityPaymentRules: saved.liabilityPaymentRules.map((rule) => rule.accountId === input.accountId && rule.active ? { ...rule, active: false, suspendedByTarget: true, version: rule.version + 1 } : rule),
        liabilityPaymentIntents: saved.liabilityPaymentIntents.map((intent) => intent.accountId === input.accountId && ["planned", "needs_confirmation", "confirmed", "failed"].includes(intent.status) ? { ...intent, status: "cancelled", suspendedByTarget: true, version: intent.version + 1 } : intent),
        liabilityObligations: saved.liabilityObligations.map((obligation) => obligation.accountId === input.accountId && ["projected", "open", "due", "partial", "overdue"].includes(obligation.status) ? { ...obligation, status: "cancelled", version: obligation.version + 1 } : obligation),
        liabilityCalendar: saved.liabilityCalendar.filter((item) => item.accountId !== input.accountId),
        liabilityOverview: { ...saved.liabilityOverview, items, totalReportingDebt: items.reduce((sum, item) => sum + item.reportingDebt, 0), coverage: "partial" },
      };
    });
    return persist("liability.archive", queueItemId);
  }, [commitLocalState, persist]);

  const updateAccount = useCallback(async (input: AccountUpdateInput) => {
    const account = input.account;
    const savedAccount = stateRef.current.accounts.find((candidate) => candidate.id === account.id);
    const name = cleanRequiredText(account.name, "El nombre de la cuenta", 100);
    if (!savedAccount) throw new Error("La cuenta ya no está disponible.");
    if (!account.version) throw new Error("La cuenta todavía no tiene una versión sincronizada.");
    if (account.currencyCode !== savedAccount.currencyCode && accountCurrencyIsLocked(account.id, stateRef.current.snapshot, stateRef.current.transactions)) {
      throw new Error("La moneda queda fija después del primer movimiento para proteger el historial. Crea otra cuenta si necesitas usar una divisa diferente.");
    }
    if (input.targetBalance !== undefined) assertFinanceAmount(input.targetBalance, { allowZero: true, allowNegative: true, label: "El saldo conciliado" });
    if (account.currencyCode === "USD" && input.targetBalance !== undefined && (!input.exchangeRate || input.exchangeRate <= 0)) throw new Error("Escribe una tasa válida para conciliar esta cuenta en dólares.");
    if (account.entityId && !stateRef.current.accountEntities.some((entity) => entity.id === account.entityId && !entity.archived)) throw new Error("La entidad elegida ya no está disponible.");
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

  const archiveAccount = useCallback(async (id: string) => {
    const current = stateRef.current;
    const account = current.accounts.find((item) => item.id === id && !item.archived);
    if (!account) throw new Error("La cuenta ya no está disponible.");
    if (!account.version) throw new Error("La cuenta todavía no tiene una versión sincronizada.");

    const balance = accountBalance(account, current.transactions, current.snapshot);
    if (Math.abs(balance) >= 0.005) throw new Error("Para archivar una cuenta, primero deja su saldo en cero mediante una transferencia o conciliación.");

    const linkedRules = current.recurringRules.filter((rule) => rule.status !== "archived" && (rule.accountId === id || rule.destinationAccountId === id));
    if (linkedRules.length) throw new Error(`Archiva o mueve ${linkedRules.length === 1 ? "el movimiento programado vinculado" : `los ${linkedRules.length} movimientos programados vinculados`} antes de cerrar esta cuenta.`);

    const linkedTargets = current.financialTargets.filter((target) => (target.status === "active" || target.status === "paused") && target.accountId === id);
    if (linkedTargets.length) throw new Error(`Desvincula ${linkedTargets.length === 1 ? "la meta o deuda activa" : `las ${linkedTargets.length} metas o deudas activas`} antes de cerrar esta cuenta.`);

    const payload = { id, version: account.version };
    const archivedAt = new Date().toISOString();
    const { queueItemId } = await commitLocalState("account.archive", payload, (local) => ({
      ...local,
      accounts: local.accounts.map((item) => item.id === id ? { ...item, archived: true, archivedAt, version: (item.version ?? 1) + 1 } : item),
    }));
    return persist("account.archive", queueItemId);
  }, [commitLocalState, persist]);

  const upsertAccountEntity = useCallback(async (input: AccountEntityInput) => {
    const name = cleanRequiredText(input.name, "El nombre de la entidad", 100);
    const existing = stateRef.current.accountEntities.find((entity) => entity.id === input.id);
    const payload = {
      ...input,
      name,
      sortOrder: Number.isFinite(input.sortOrder) ? Math.max(0, Math.trunc(input.sortOrder)) : stateRef.current.accountEntities.length,
      version: existing?.version,
    };
    const { queueItemId } = await commitLocalState("account-entity.upsert", payload, (current) => ({
      ...current,
      accountEntities: current.accountEntities.some((entity) => entity.id === payload.id)
        ? current.accountEntities.map((entity) => entity.id === payload.id ? { ...entity, ...payload, version: (entity.version ?? 1) + 1 } : entity)
        : [...current.accountEntities, { ...payload, version: 1 }],
    }));
    return persist("account-entity.upsert", queueItemId);
  }, [commitLocalState, persist]);

  const archiveAccountEntity = useCallback(async (id: string) => {
    const entity = stateRef.current.accountEntities.find((item) => item.id === id && !item.archived);
    if (!entity) throw new Error("La entidad ya no está disponible.");
    const payload = { id, version: entity.version ?? 1 };
    const { queueItemId } = await commitLocalState("account-entity.archive", payload, (current) => ({
      ...current,
      accountEntities: current.accountEntities.map((item) => item.id === id ? { ...item, archived: true, version: (item.version ?? 1) + 1 } : item),
      accounts: current.accounts.map((account) => account.entityId === id ? { ...account, entityId: undefined } : account),
    }));
    return persist("account-entity.archive", queueItemId);
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
    const normalizedProfile = { ...profile, currencyCode: REPORTING_CURRENCY_CODE, customThemeColor };
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
    const [reportResult, creditCardHistory] = await Promise.all([
      client.rpc("get_detailed_finance_report_v4", {
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
      }),
      loadRemoteCreditCardHistoryRange(client, query.startDate, query.endDate),
    ]);
    const { data, error } = reportResult;
    if (error) throw error;
    await cacheState((current) => ({
      ...current,
      ...mergeRemoteCreditCardHistoryRange(current, creditCardHistory, query.startDate, query.endDate),
    }));
    return detailedFinanceReportFromRpc(data);
  }, [cacheState, pendingTransactionCount, userId]);

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

  const loadLiabilityCalendar = useCallback(async (dateFrom: string, dateTo: string): Promise<LiabilityCalendarRange> => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateTo < dateFrom) throw new Error("El rango del calendario no es válido.");
    const localItems = stateRef.current.liabilityCalendar
      .filter((item) => item.date >= dateFrom && item.date <= dateTo)
      .sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
    const client = createClient();
    if (!client || !userId || userId === "demo" || !navigator.onLine) {
      return { startDate: dateFrom, endDate: dateTo, items: localItems, coverage: userId === "demo" ? "complete" : "partial" };
    }
    const remote = await loadRemoteLiabilityCalendar(client, dateFrom, dateTo, 2000);
    await cacheState((current) => ({
      ...current,
      liabilityCalendar: [
        ...current.liabilityCalendar.filter((item) => item.date < dateFrom || item.date > dateTo),
        ...remote.items,
      ].sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id)),
    }));
    return remote;
  }, [cacheState, userId]);

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
    upsertCreditCard,
    addCreditCardPurchase,
    upsertCreditCardStatement,
    upsertLiability,
    upsertLiabilityTerms,
    upsertLiabilityObligation,
    reconcileLiabilityObligation,
    upsertLiabilityPaymentRule,
    recordLiabilityPayment,
    archiveLiability,
    upsertAccountEntity,
    archiveAccountEntity,
    addAccount,
    updateAccount,
    archiveAccount,
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
  }), [addTransaction, importTransactions, importPlanner, updateTransaction, deleteTransaction, upsertRecurringRule, archiveRecurringRule, updateRecurringOccurrence, upsertFinancialTarget, setFinancialTargetStatus, upsertFinancialTargetEntry, deleteFinancialTargetEntry, upsertCreditCard, addCreditCardPurchase, upsertCreditCardStatement, upsertLiability, upsertLiabilityTerms, upsertLiabilityObligation, reconcileLiabilityObligation, upsertLiabilityPaymentRule, recordLiabilityPayment, archiveLiability, upsertAccountEntity, archiveAccountEntity, addAccount, updateAccount, archiveAccount, addCategory, importCategories, importIncomeTypes, upsertCategory, archiveCategory, upsertIncomeType, archiveIncomeType, upsertFinanceGroup, archiveFinanceGroup, updateBudget, setMonthlyBudgetPlan, updateCategoryOrder, updateProfile, updateGroupAllocations]);

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
    loadLiabilityCalendar,
    previewLiabilityReconciliation,
    syncNow,
    prepareSignOut,
    cancelPreparedSignOut,
    completeSignOut,
  }), [state, hydrated, dataStatus, dataSource, online, syncing, pendingCount, syncError, mutate, compatibleMutations, listTransactions, exportTransactions, getFinanceReport, getDetailedFinanceReport, exportReportTransactions, getMonthlyBudgetPlan, getPlanSimulationSeed, loadFinancialTargetEntries, loadLiabilityCalendar, previewLiabilityReconciliation, syncNow, prepareSignOut, cancelPreparedSignOut, completeSignOut]);

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
