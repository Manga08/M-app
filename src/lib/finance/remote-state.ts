import type { SupabaseClient } from "@supabase/supabase-js";
import { currentMonthStart } from "@/lib/finance/calculations";
import type {
  Account,
  AccountEntity,
  BudgetPlanSource,
  Category,
  CreditCardInstallment,
  CreditCardProfile,
  CreditCardPurchasePlan,
  CreditCardStatement,
  FinanceProfile,
  FinanceSnapshot,
  FinanceState,
  FinancialTarget,
  FinancialTargetDebtDetails,
  FinancialTargetEntry,
  GroupAllocation,
  Liability,
  LiabilityCalendarItem,
  LiabilityCalendarRange,
  LiabilityObligation,
  LiabilityObligationKind,
  LiabilityObligationStatus,
  LiabilityOverview,
  LiabilityOverviewItem,
  LiabilityPaymentIntent,
  LiabilityPaymentIntentStatus,
  LiabilityPaymentRule,
  LiabilityRatePeriod,
  LiabilityReconciliationPreview,
  LiabilityTerms,
  RecurringOccurrence,
  RecurringRule,
  Transaction,
  TransactionCursor,
} from "@/lib/finance/types";
import type { Database } from "@/lib/supabase/database.types";
import { DEFAULT_CUSTOM_THEME_COLOR, normalizeHexColor } from "@/lib/custom-theme";
import { REPORTING_CURRENCY_CODE } from "@/lib/finance/currency";

type FinanceSupabaseClient = SupabaseClient<Database>;
type ProfileRow = { id: string; email: string; display_name: string | null; avatar_url: string | null; currency_code: string; timezone: string; week_starts_on: number; month_starts_on: number; theme_mode: FinanceProfile["themeMode"]; color_theme: FinanceProfile["colorTheme"]; custom_theme_color: string; schema_version?: number };
type AccountRow = { id: string; name: string; account_type: Account["type"]; initial_balance: number | string; color: string; icon: string; archived: boolean; archived_at?: string | null; currency_code?: string; expected_annual_return?: number | string | null; opening_balance_date?: string; opening_exchange_rate?: number | string; version?: number | string };
type AccountEntityRow = { id: string; name: string; color: string; icon: string; sort_order: number; archived: boolean; version: number | string };
type CreditCardProfileRow = { account_id: string; network: CreditCardProfile["network"]; last_four: string | null; credit_limit: number | string; cutoff_day: number; due_day: number; annual_fee: number | string; purchase_rate_ea: number | string | null; cash_advance_rate_ea: number | string | null; version: number | string };
type CreditCardStatementRow = { id: string; account_id: string; period_start: string; period_end: string; cutoff_on: string; due_on: string; total_due: number | string; minimum_due: number | string; purchases: number | string; advances: number | string; interest: number | string; fees: number | string; payments: number | string; refunds: number | string; status: CreditCardStatement["status"]; reconciled_at: string | null; version: number | string };
type CreditCardPurchasePlanRow = { id: string; account_id: string; transaction_id: string; installment_count: number; financing_type: CreditCardPurchasePlan["financingType"]; annual_effective_rate: number | string | null; first_due_on: string; status: CreditCardPurchasePlan["status"] };
type CreditCardInstallmentRow = { id: string; plan_id: string; installment_number: number; due_on: string; principal: number | string; estimated_interest: number | string; estimated_fee: number | string; status: CreditCardInstallment["status"]; statement_id: string | null };
type CategoryRow = { id: string; name: string; category_group: Category["group"]; transaction_kind: Category["kind"]; color: string; icon: string; is_default: boolean; archived: boolean; sort_order: number; main_category_id?: string | null };
type BudgetRow = { id: string; category_id: string; month: string; amount: number | string };
type MonthlyBudgetPlanRow = { month: string; income_target: number | string; source: BudgetPlanSource };
type AllocationRow = { id: string; key: GroupAllocation["group"]; name: string; color: string; icon: string; target_percent: number | string; included_in_plan: boolean; sort_order: number; archived: boolean; is_default: boolean };
export type TransactionRow = { id: string; kind: Transaction["kind"]; amount: number | string; account_id: string; category_id: string | null; transfer_group_id: string | null; recurring_occurrence_id: string | null; financial_target_id: string | null; financial_target_effect: Transaction["financialTargetEffect"] | null; description: string; merchant: string | null; note: string | null; icon: string | null; occurred_on: string; created_at: string; ledger_event_id?: string; native_currency_code?: string; base_currency_code?: string; base_amount?: number | string; exchange_rate?: number | string; exchange_rate_date?: string; exchange_rate_source?: Transaction["exchangeRateSource"]; reference_exchange_rate?: number | string; reference_rate_source?: Transaction["referenceRateSource"]; version?: number | string };
export type RecurringRuleRow = { id: string; kind: RecurringRule["kind"]; amount: number | string; destination_amount: number | string | null; account_id: string; destination_account_id: string | null; category_id: string | null; financial_target_id: string | null; financial_target_effect: RecurringRule["financialTargetEffect"] | null; description: string; merchant: string | null; note: string | null; icon: string | null; exchange_rate: number | string; exchange_rate_date: string; exchange_rate_source: RecurringRule["exchangeRateSource"]; reference_exchange_rate: number | string | null; reference_rate_source: RecurringRule["referenceRateSource"] | null; cadence: RecurringRule["cadence"]; interval_count: number; starts_on: string; ends_on: string | null; anchor_day: number | null; second_anchor_day?: number | null; weekday: number | null; posting_policy: RecurringRule["postingPolicy"]; timezone: string; auto_post: boolean; include_in_budget: boolean; include_in_income_target: boolean; status: RecurringRule["status"]; suspended_by_target?: boolean; next_run_on: string | null; created_at: string; updated_at: string };
export type RecurringOccurrenceRow = { id: string; rule_id: string; kind: RecurringOccurrence["kind"]; scheduled_on: string; effective_on: string; amount: number | string; destination_amount: number | string | null; account_id: string; destination_account_id: string | null; category_id: string | null; financial_target_id: string | null; financial_target_effect: RecurringOccurrence["financialTargetEffect"] | null; description: string; merchant: string | null; note: string | null; icon: string | null; exchange_rate: number | string; exchange_rate_date: string; exchange_rate_source: RecurringOccurrence["exchangeRateSource"]; reference_exchange_rate: number | string | null; reference_rate_source: RecurringOccurrence["referenceRateSource"] | null; status: RecurringOccurrence["status"]; suspended_by_target?: boolean; transaction_id: string | null; transfer_group_id: string | null; failure_reason: string | null; posted_at: string | null; created_at: string };
type FinancialTargetRow = { id: string; mode: FinancialTarget["mode"]; kind: FinancialTarget["kind"]; status: FinancialTarget["status"]; title: string; description: string | null; target_amount: number | string; initial_progress: number | string; progress_amount: number | string; starts_on: string; target_date: string | null; priority: number; color: string; icon: string; account_id: string | null; category_id: string | null; tracking_mode: FinancialTarget["trackingMode"]; created_at: string; updated_at: string; completed_at: string | null; archived_at: string | null };
export type FinancialTargetEntryRow = { id: string; target_id: string; kind: FinancialTargetEntry["kind"]; effect: FinancialTargetEntry["effect"]; amount: number | string; occurred_on: string; note: string | null; created_at: string };
type FinancialTargetDebtRow = { target_id: string; creditor: string | null; annual_interest_rate: number | string | null; minimum_payment: number | string | null; due_day: number | null };
type SnapshotRow = { month: string; income: number | string; expense: number | string; netWorth?: number | string; accountBalances: Record<string, number | string>; accountBalancesBase?: Record<string, number | string>; accountMovementCounts?: Record<string, number | string>; categorySpending: Record<string, number | string> };
type RpcResult = { data: unknown; error: { message?: string } | null };
type UntypedTableQuery = PromiseLike<RpcResult> & {
  select: (columns: string) => UntypedTableQuery;
  in: (column: string, values: readonly string[]) => UntypedTableQuery;
  gte: (column: string, value: string) => UntypedTableQuery;
  lte: (column: string, value: string) => UntypedTableQuery;
  order: (column: string, options?: { ascending?: boolean }) => UntypedTableQuery;
  range: (from: number, to: number) => UntypedTableQuery;
};
type LiabilityTermRpc = {
  id: string; account_id?: string; starts_on: string; ends_on?: string | null;
  payment_frequency: LiabilityTerms["paymentFrequency"]; interval_count: number | string;
  calculation_method: LiabilityTerms["calculationMethod"]; amortization_method: LiabilityTerms["amortizationMethod"];
  statement_cutoff_day?: number | string | null; due_day?: number | string | null; first_due_on?: string | null;
  installment_count?: number | string | null; scheduled_payment?: number | string | null;
  contractual_minimum?: number | string | null; periodic_fee: number | string; periodic_insurance: number | string;
  variable_rate: boolean; index_name?: string | null; spread_rate?: number | string | null;
  prepayment_strategy: LiabilityTerms["prepaymentStrategy"]; source: LiabilityTerms["source"]; version: number | string;
};
type LiabilityRateRpc = {
  id: string; rate_kind: LiabilityRatePeriod["rateKind"]; rate_basis: LiabilityRatePeriod["rateBasis"];
  reported_value: number | string; effective_annual_rate?: number | string | null; starts_on: string;
  ends_on?: string | null; source: LiabilityRatePeriod["source"];
};
type LiabilityOverviewRpcItem = {
  accountId: string; accountVersion: number | string; liabilityVersion: number | string; name: string;
  kind: LiabilityOverviewItem["kind"]; status: LiabilityOverviewItem["status"]; creditorName?: string | null;
  currencyCode: string; color: string; icon?: string | null; entityId?: string | null;
  originalPrincipal?: number | string | null; originatedOn?: string | null; maturityOn?: string | null;
  legacyTargetId?: string | null; migrationStatus: LiabilityOverviewItem["migrationStatus"];
  nativeBalance: number | string; nativeDebt: number | string; reportingBalance: number | string; reportingDebt: number | string;
  currentTerm?: LiabilityTermRpc | null; currentRates?: LiabilityRateRpc[] | null;
  nextObligation?: {
    id: string; kind: LiabilityObligationKind;
    sequenceNumber?: number | string | null; dueOn: string;
    principalDue: number | string; interestDue: number | string; feeDue: number | string;
    minimumDue: number | string; totalDue: number | string;
    allocated: number | string; remaining: number | string; status: LiabilityObligationStatus; version: number | string;
  } | null;
  paymentRule?: {
    id: string; fundingAccountId: string; strategy: LiabilityPaymentRule["strategy"];
    fixedAmount?: number | string | null; maximumAmount?: number | string | null; daysBeforeDue: number | string;
    recordingMode: LiabilityPaymentRule["recordingMode"]; active: boolean; suspendedByTarget?: boolean; version: number | string;
  } | null;
  card?: {
    network: CreditCardProfile["network"]; lastFour?: string | null; creditLimit: number | string;
    cutoffDay: number | string; dueDay: number | string; annualFee: number | string;
    purchaseRateEa?: number | string | null; cashAdvanceRateEa?: number | string | null;
    availableCredit: number | string; version: number | string;
  } | null;
};
type LiabilityCalendarRpcItem = {
  date: string; type: LiabilityCalendarItem["type"]; id: string; accountId: string; accountName: string;
  currencyCode: string; liabilityKind: LiabilityCalendarItem["liabilityKind"];
  status: LiabilityObligationStatus | LiabilityPaymentIntentStatus; amount: number | string;
  remaining: number | string; minimumDue: number | string; sequenceNumber?: number | string | null;
  ledgerEventId?: string | null; version: number | string;
};
type LiabilityReconciliationPreviewRpc = {
  accountId: string;
  cutoffOn: string;
  currencyCode: string;
  ledgerDebtBeforeStatementCharges?: number | string;
  ledgerBalance: number | string;
  ledgerDebt: number | string;
  reportingBalance: number | string;
  statementTotal: number | string;
  postedInterest?: number | string;
  postedFees?: number | string;
  interestToPost?: number | string;
  feesToPost?: number | string;
  difference: number | string;
  adjustmentKind?: string | null;
  isBalanced: boolean;
  requiresExchangeRate?: boolean;
};
export type LiabilityObligationRow = {
  id: string; account_id: string; kind: LiabilityObligation["kind"];
  sequence_number: number | null; period_start: string | null; period_end: string | null;
  due_on: string; principal_due: number | string; interest_due: number | string;
  fee_due: number | string; minimum_due: number | string; total_due: number | string;
  status: LiabilityObligation["status"]; source: LiabilityObligation["source"]; version: number | string;
};
export type LiabilityPaymentIntentRow = {
  id: string; account_id: string; rule_id: string | null; obligation_id: string | null;
  scheduled_for: string; planned_amount: number | string; status: LiabilityPaymentIntent["status"];
  suspended_by_target?: boolean;
  detached_by_rule?: boolean;
  ledger_event_id: string | null; failure_reason: string | null; version: number | string;
};
export type TransactionPageRow = TransactionRow & { transfer_pair?: TransactionRow | null };
export type TransactionPageRowResult = { items?: TransactionPageRow[]; hasMore?: boolean; nextCursor?: TransactionCursor | null };

function profileFromRow(row: ProfileRow): FinanceProfile {
  return { id: row.id, email: row.email, displayName: row.display_name?.trim() || row.email.split("@")[0] || "Usuario", avatarUrl: row.avatar_url ?? undefined, currencyCode: REPORTING_CURRENCY_CODE, timezone: row.timezone, weekStartsOn: row.week_starts_on, monthStartsOn: row.month_starts_on, themeMode: row.theme_mode, colorTheme: row.color_theme, customThemeColor: normalizeHexColor(row.custom_theme_color) ?? DEFAULT_CUSTOM_THEME_COLOR, schemaVersion: row.schema_version };
}

export function transactionFromRow(row: TransactionRow, liabilityRole?: NonNullable<Transaction["liabilityRole"]>): Transaction {
  return { id: row.id, kind: row.kind, amount: Number(row.amount), accountId: row.account_id, categoryId: row.category_id ?? undefined, transferGroupId: row.transfer_group_id ?? undefined, recurringOccurrenceId: row.recurring_occurrence_id ?? undefined, financialTargetId: row.financial_target_id ?? undefined, financialTargetEffect: row.financial_target_effect ?? undefined, description: row.description, merchant: row.merchant ?? undefined, note: row.note ?? undefined, icon: row.icon ?? undefined, occurredOn: row.occurred_on, createdAt: row.created_at, ledgerEventId: row.ledger_event_id, nativeCurrencyCode: row.native_currency_code, baseCurrencyCode: row.base_currency_code, baseAmount: row.base_amount === undefined ? undefined : Number(row.base_amount), exchangeRate: row.exchange_rate === undefined ? undefined : Number(row.exchange_rate), exchangeRateDate: row.exchange_rate_date, exchangeRateSource: row.exchange_rate_source, referenceExchangeRate: row.reference_exchange_rate === undefined ? undefined : Number(row.reference_exchange_rate), referenceRateSource: row.reference_rate_source, version: row.version === undefined ? undefined : Number(row.version), liabilityRole, syncStatus: "synced" };
}

export function recurringRuleFromRow(row: RecurringRuleRow): RecurringRule {
  return { id: row.id, kind: row.kind, amount: Number(row.amount), destinationAmount: row.destination_amount === null ? undefined : Number(row.destination_amount), accountId: row.account_id, destinationAccountId: row.destination_account_id ?? undefined, categoryId: row.category_id ?? undefined, financialTargetId: row.financial_target_id ?? undefined, financialTargetEffect: row.financial_target_effect ?? undefined, description: row.description, merchant: row.merchant ?? undefined, note: row.note ?? undefined, icon: row.icon ?? undefined, exchangeRate: Number(row.exchange_rate), exchangeRateDate: row.exchange_rate_date, exchangeRateSource: row.exchange_rate_source, referenceExchangeRate: row.reference_exchange_rate === null ? undefined : Number(row.reference_exchange_rate), referenceRateSource: row.reference_rate_source ?? undefined, cadence: row.cadence, intervalCount: row.interval_count, startsOn: row.starts_on, endsOn: row.ends_on ?? undefined, anchorDay: row.anchor_day ?? undefined, secondAnchorDay: row.second_anchor_day ?? undefined, weekday: row.weekday ?? undefined, postingPolicy: row.posting_policy, timezone: row.timezone, autoPost: row.auto_post, includeInBudget: row.include_in_budget, includeInIncomeTarget: row.include_in_income_target, status: row.status, suspendedByTarget: row.suspended_by_target, nextRunOn: row.next_run_on ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at, syncStatus: "synced" };
}

export function recurringOccurrenceFromRow(row: RecurringOccurrenceRow): RecurringOccurrence {
  return { id: row.id, ruleId: row.rule_id, kind: row.kind, scheduledOn: row.scheduled_on, effectiveOn: row.effective_on, amount: Number(row.amount), destinationAmount: row.destination_amount === null ? undefined : Number(row.destination_amount), accountId: row.account_id, destinationAccountId: row.destination_account_id ?? undefined, categoryId: row.category_id ?? undefined, financialTargetId: row.financial_target_id ?? undefined, financialTargetEffect: row.financial_target_effect ?? undefined, description: row.description, merchant: row.merchant ?? undefined, note: row.note ?? undefined, icon: row.icon ?? undefined, exchangeRate: Number(row.exchange_rate), exchangeRateDate: row.exchange_rate_date, exchangeRateSource: row.exchange_rate_source, referenceExchangeRate: row.reference_exchange_rate === null ? undefined : Number(row.reference_exchange_rate), referenceRateSource: row.reference_rate_source ?? undefined, status: row.status, suspendedByTarget: row.suspended_by_target, transactionId: row.transaction_id ?? undefined, transferGroupId: row.transfer_group_id ?? undefined, failureReason: row.failure_reason ?? undefined, postedAt: row.posted_at ?? undefined, createdAt: row.created_at };
}

function financialTargetFromRow(row: FinancialTargetRow): FinancialTarget {
  return { id: row.id, mode: row.mode, kind: row.kind, status: row.status, title: row.title, description: row.description ?? undefined, targetAmount: Number(row.target_amount), initialProgress: Number(row.initial_progress), progressAmount: Number(row.progress_amount), startsOn: row.starts_on, targetDate: row.target_date ?? undefined, priority: row.priority, color: row.color, icon: row.icon, accountId: row.account_id ?? undefined, categoryId: row.category_id ?? undefined, trackingMode: row.tracking_mode, createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at ?? undefined, archivedAt: row.archived_at ?? undefined, syncStatus: "synced" };
}

export function financialTargetEntryFromRow(row: FinancialTargetEntryRow): FinancialTargetEntry {
  return { id: row.id, targetId: row.target_id, kind: row.kind, effect: row.effect, amount: Number(row.amount), occurredOn: row.occurred_on, note: row.note ?? undefined, createdAt: row.created_at, syncStatus: "synced" };
}

export function liabilityObligationFromRow(row: LiabilityObligationRow): LiabilityObligation {
  return {
    id: row.id,
    accountId: row.account_id,
    kind: row.kind,
    sequenceNumber: row.sequence_number ?? undefined,
    periodStart: row.period_start ?? undefined,
    periodEnd: row.period_end ?? undefined,
    dueOn: row.due_on,
    principalDue: Number(row.principal_due),
    interestDue: Number(row.interest_due),
    feeDue: Number(row.fee_due),
    minimumDue: Number(row.minimum_due),
    totalDue: Number(row.total_due),
    status: row.status,
    source: row.source,
    version: Number(row.version),
  };
}

export function liabilityPaymentIntentFromRow(row: LiabilityPaymentIntentRow): LiabilityPaymentIntent {
  return {
    id: row.id,
    accountId: row.account_id,
    ruleId: row.rule_id ?? undefined,
    obligationId: row.obligation_id ?? undefined,
    scheduledFor: row.scheduled_for,
    plannedAmount: Number(row.planned_amount),
    status: row.status,
    suspendedByTarget: row.suspended_by_target,
    ledgerEventId: row.ledger_event_id ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    version: Number(row.version),
  };
}

export function liabilityBootstrapFromRows(obligations: LiabilityObligationRow[], intents: LiabilityPaymentIntentRow[]) {
  return {
    obligations: obligations.map(liabilityObligationFromRow),
    intents: intents.map(liabilityPaymentIntentFromRow),
  };
}

function financialTargetDebtFromRow(row: FinancialTargetDebtRow): FinancialTargetDebtDetails {
  return { targetId: row.target_id, creditor: row.creditor ?? undefined, annualInterestRate: row.annual_interest_rate === null ? undefined : Number(row.annual_interest_rate), minimumPayment: row.minimum_payment === null ? undefined : Number(row.minimum_payment), dueDay: row.due_day ?? undefined };
}

function snapshotFromRow(row: SnapshotRow): FinanceSnapshot {
  return { month: row.month, income: Number(row.income), expense: Number(row.expense), netWorth: row.netWorth === undefined ? undefined : Number(row.netWorth), accountBalances: Object.fromEntries(Object.entries(row.accountBalances ?? {}).map(([id, value]) => [id, Number(value)])), accountBalancesBase: Object.fromEntries(Object.entries(row.accountBalancesBase ?? {}).map(([id, value]) => [id, Number(value)])), accountMovementCounts: Object.fromEntries(Object.entries(row.accountMovementCounts ?? {}).map(([id, value]) => [id, Number(value)])), categorySpending: Object.fromEntries(Object.entries(row.categorySpending ?? {}).map(([id, value]) => [id, Number(value)])) };
}

async function callUntypedRpc(client: FinanceSupabaseClient, name: string, args: Record<string, unknown>) {
  const rpc = client.rpc as unknown as (fn: string, parameters: Record<string, unknown>) => PromiseLike<RpcResult>;
  const result = await rpc(name, args);
  if (result.error) throw result.error;
  return result.data;
}

function untypedTable(client: FinanceSupabaseClient, relation: string) {
  const from = client.from as unknown as (table: string) => UntypedTableQuery;
  return from(relation);
}

/**
 * Loads the domain ownership marker for transaction ledger events. This keeps
 * generic history actions from offering edits that must be performed through
 * the debt/card workflow and mirrors the database guard after a reload.
 */
export async function loadRemoteTransactionLiabilityRoles(
  client: FinanceSupabaseClient,
  rows: readonly TransactionRow[],
) {
  const ledgerEventIds = Array.from(new Set(rows.flatMap((row) => row.ledger_event_id ? [row.ledger_event_id] : [])));
  const roles = new Map<string, NonNullable<Transaction["liabilityRole"]>>();
  for (let offset = 0; offset < ledgerEventIds.length; offset += 500) {
    const result = await untypedTable(client, "liability_event_metadata")
      .select("ledger_event_id,role")
      .in("ledger_event_id", ledgerEventIds.slice(offset, offset + 500));
    if (result.error) throw result.error;
    for (const row of (Array.isArray(result.data) ? result.data : []) as Array<{ ledger_event_id: string; role: NonNullable<Transaction["liabilityRole"]> }>) {
      if (!roles.has(row.ledger_event_id)) roles.set(row.ledger_event_id, row.role);
    }
  }
  return roles;
}

async function loadPagedRows<Row>(buildPage: (from: number, to: number) => UntypedTableQuery, pageSize = 1000) {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const result = await buildPage(offset, offset + pageSize - 1);
    if (result.error) throw result.error;
    const page = Array.isArray(result.data) ? result.data as Row[] : [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function creditCardStatementFromRow(row: CreditCardStatementRow): CreditCardStatement {
  return {
    id: row.id,
    accountId: row.account_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    cutoffOn: row.cutoff_on,
    dueOn: row.due_on,
    totalDue: Number(row.total_due),
    minimumDue: Number(row.minimum_due),
    purchases: Number(row.purchases),
    advances: Number(row.advances),
    interest: Number(row.interest),
    fees: Number(row.fees),
    payments: Number(row.payments),
    refunds: Number(row.refunds),
    status: row.status,
    reconciledAt: row.reconciled_at ?? undefined,
    version: Number(row.version),
  };
}

function creditCardPurchasePlanFromRow(row: CreditCardPurchasePlanRow): CreditCardPurchasePlan {
  return {
    id: row.id,
    accountId: row.account_id,
    transactionId: row.transaction_id,
    installmentCount: row.installment_count,
    financingType: row.financing_type,
    annualEffectiveRate: row.annual_effective_rate === null ? undefined : Number(row.annual_effective_rate),
    firstDueOn: row.first_due_on,
    status: row.status,
  };
}

function creditCardInstallmentFromRow(row: CreditCardInstallmentRow): CreditCardInstallment {
  return {
    id: row.id,
    planId: row.plan_id,
    installmentNumber: row.installment_number,
    dueOn: row.due_on,
    principal: Number(row.principal),
    estimatedInterest: Number(row.estimated_interest),
    estimatedFee: Number(row.estimated_fee),
    status: row.status,
    statementId: row.statement_id ?? undefined,
  };
}

export type RemoteCreditCardHistoryRange = {
  statements: CreditCardStatement[];
  purchasePlans: CreditCardPurchasePlan[];
  installments: CreditCardInstallment[];
};

type CreditCardHistoryState = Pick<FinanceState, "creditCardStatements" | "creditCardPurchasePlans" | "creditCardInstallments">;

function assertCreditCardHistoryRange(dateFrom: string, dateTo: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateTo < dateFrom) {
    throw new Error("El rango del historial de tarjetas no es válido.");
  }
}

/**
 * Loads every statement and installment needed by a report range. The app
 * bootstrap intentionally keeps only a small card window, so report/export
 * paths must use this paginated loader instead of treating that cache as the
 * complete historical source.
 */
export async function loadRemoteCreditCardHistoryRange(
  client: FinanceSupabaseClient,
  dateFrom: string,
  dateTo: string,
  options: { pageSize?: number; planChunkSize?: number } = {},
): Promise<RemoteCreditCardHistoryRange> {
  assertCreditCardHistoryRange(dateFrom, dateTo);
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 1000, 1000));
  const planChunkSize = Math.max(1, Math.min(options.planChunkSize ?? 100, 200));
  const [statementRows, installmentRows] = await Promise.all([
    loadPagedRows<CreditCardStatementRow>((from, to) => untypedTable(client, "credit_card_statements")
      .select("id,account_id,period_start,period_end,cutoff_on,due_on,total_due,minimum_due,purchases,advances,interest,fees,payments,refunds,status,reconciled_at,version")
      .gte("cutoff_on", dateFrom)
      .lte("cutoff_on", dateTo)
      .order("cutoff_on")
      .order("id")
      .range(from, to), pageSize),
    loadPagedRows<CreditCardInstallmentRow>((from, to) => untypedTable(client, "credit_card_installments")
      .select("id,plan_id,installment_number,due_on,principal,estimated_interest,estimated_fee,status,statement_id")
      .gte("due_on", dateFrom)
      .lte("due_on", dateTo)
      .order("due_on")
      .order("id")
      .range(from, to), pageSize),
  ]);

  const planIds = Array.from(new Set(installmentRows.map((row) => row.plan_id)));
  const planRows: CreditCardPurchasePlanRow[] = [];
  for (let offset = 0; offset < planIds.length; offset += planChunkSize) {
    planRows.push(...await loadPagedRows<CreditCardPurchasePlanRow>((from, to) => untypedTable(client, "credit_card_purchase_plans")
      .select("id,account_id,transaction_id,installment_count,financing_type,annual_effective_rate,first_due_on,status")
      .in("id", planIds.slice(offset, offset + planChunkSize))
      .order("first_due_on")
      .order("id")
      .range(from, to), pageSize));
  }

  return {
    statements: statementRows.map(creditCardStatementFromRow),
    purchasePlans: Array.from(new Map(planRows.map((row) => [row.id, creditCardPurchasePlanFromRow(row)])).values()),
    installments: installmentRows.map(creditCardInstallmentFromRow),
  };
}

/** Replaces the authoritative slice while preserving cached data outside it. */
export function mergeRemoteCreditCardHistoryRange(
  current: CreditCardHistoryState,
  remote: RemoteCreditCardHistoryRange,
  dateFrom: string,
  dateTo: string,
): CreditCardHistoryState {
  assertCreditCardHistoryRange(dateFrom, dateTo);
  const remoteStatementIds = new Set(remote.statements.map((item) => item.id));
  const remoteInstallmentIds = new Set(remote.installments.map((item) => item.id));
  const remotePlansById = new Map(remote.purchasePlans.map((item) => [item.id, item]));

  return {
    creditCardStatements: [
      ...current.creditCardStatements.filter((item) => (item.cutoffOn < dateFrom || item.cutoffOn > dateTo) && !remoteStatementIds.has(item.id)),
      ...remote.statements,
    ].sort((left, right) => right.cutoffOn.localeCompare(left.cutoffOn) || left.id.localeCompare(right.id)),
    creditCardPurchasePlans: [
      ...current.creditCardPurchasePlans.filter((item) => !remotePlansById.has(item.id)),
      ...remotePlansById.values(),
    ].sort((left, right) => left.firstDueOn.localeCompare(right.firstDueOn) || left.id.localeCompare(right.id)),
    creditCardInstallments: [
      ...current.creditCardInstallments.filter((item) => (item.dueOn < dateFrom || item.dueOn > dateTo) && !remoteInstallmentIds.has(item.id)),
      ...remote.installments,
    ].sort((left, right) => left.dueOn.localeCompare(right.dueOn) || left.installmentNumber - right.installmentNumber || left.id.localeCompare(right.id)),
  };
}

/** Loads the complete editable schedule so an edit can reuse stable obligation IDs. */
export function loadRemoteLiabilityObligations(client: FinanceSupabaseClient) {
  return loadPagedRows<LiabilityObligationRow>((from, to) => untypedTable(client, "liability_obligations")
    .select("id,account_id,kind,sequence_number,period_start,period_end,due_on,principal_due,interest_due,fee_due,minimum_due,total_due,status,source,version")
    .in("status", ["projected", "open", "due", "partial", "overdue", "paid", "waived", "cancelled"])
    .order("due_on")
    .order("id")
    .range(from, to));
}

/** Loads only actionable reminders around the initial app window; older history remains server-side. */
export function loadRemoteLiabilityPaymentIntents(client: FinanceSupabaseClient, dateFrom: string, dateTo: string) {
  return loadPagedRows<LiabilityPaymentIntentRow>((from, to) => untypedTable(client, "liability_payment_intents")
    .select("id,account_id,rule_id,obligation_id,scheduled_for,planned_amount,status,suspended_by_target,detached_by_rule,ledger_event_id,failure_reason,version")
    .in("status", ["planned", "needs_confirmation", "confirmed", "failed"])
    .gte("scheduled_for", dateFrom)
    .lte("scheduled_for", dateTo)
    .order("scheduled_for")
    .order("id")
    .range(from, to));
}

function optionalNumber(value: number | string | null | undefined) {
  return value === null || value === undefined || value === "" ? undefined : Number(value);
}

function liabilityTermFromRpc(row: LiabilityTermRpc, accountId: string): LiabilityTerms {
  return {
    id: row.id,
    accountId,
    startsOn: row.starts_on,
    endsOn: row.ends_on ?? undefined,
    paymentFrequency: row.payment_frequency,
    intervalCount: Number(row.interval_count),
    calculationMethod: row.calculation_method,
    amortizationMethod: row.amortization_method,
    statementCutoffDay: optionalNumber(row.statement_cutoff_day),
    dueDay: optionalNumber(row.due_day),
    firstDueOn: row.first_due_on ?? undefined,
    installmentCount: optionalNumber(row.installment_count),
    scheduledPayment: optionalNumber(row.scheduled_payment),
    contractualMinimum: optionalNumber(row.contractual_minimum),
    periodicFee: Number(row.periodic_fee),
    periodicInsurance: Number(row.periodic_insurance),
    variableRate: row.variable_rate,
    indexName: row.index_name ?? undefined,
    spreadRate: optionalNumber(row.spread_rate),
    prepaymentStrategy: row.prepayment_strategy,
    source: row.source,
    version: Number(row.version),
  };
}

function liabilityRateFromRpc(row: LiabilityRateRpc, accountId: string): LiabilityRatePeriod {
  return {
    id: row.id,
    accountId,
    rateKind: row.rate_kind,
    rateBasis: row.rate_basis,
    reportedValue: Number(row.reported_value),
    effectiveAnnualRate: optionalNumber(row.effective_annual_rate),
    startsOn: row.starts_on,
    endsOn: row.ends_on ?? undefined,
    source: row.source,
  };
}

export function liabilityOverviewFromRpc(value: unknown, fallbackAsOf = ""): LiabilityOverview {
  const payload = (value ?? {}) as { reportingCurrency?: string; asOf?: string; items?: LiabilityOverviewRpcItem[] };
  const items = (payload.items ?? []).filter((item) => item.currencyCode === "COP" || item.currencyCode === "USD").map((item): LiabilityOverviewItem => {
    const accountId = item.accountId;
    const liability: Liability = {
      accountId,
      kind: item.kind,
      status: item.status,
      creditorName: item.creditorName ?? undefined,
      originalPrincipal: optionalNumber(item.originalPrincipal),
      originatedOn: item.originatedOn ?? undefined,
      maturityOn: item.maturityOn ?? undefined,
      legacyTargetId: item.legacyTargetId ?? undefined,
      migrationStatus: item.migrationStatus,
      version: Number(item.liabilityVersion),
    };
    const currentRates = (item.currentRates ?? []).map((rate) => liabilityRateFromRpc(rate, accountId));
    return {
      liability,
      accountId,
      accountVersion: Number(item.accountVersion),
      liabilityVersion: Number(item.liabilityVersion),
      name: item.name,
      accountName: item.name,
      kind: item.kind,
      status: item.status,
      creditorName: item.creditorName ?? undefined,
      currencyCode: item.currencyCode as "COP" | "USD",
      color: item.color,
      accountColor: item.color,
      icon: item.icon ?? undefined,
      accountIcon: item.icon ?? undefined,
      entityId: item.entityId ?? undefined,
      originalPrincipal: optionalNumber(item.originalPrincipal),
      originatedOn: item.originatedOn ?? undefined,
      maturityOn: item.maturityOn ?? undefined,
      legacyTargetId: item.legacyTargetId ?? undefined,
      migrationStatus: item.migrationStatus,
      nativeBalance: Number(item.nativeBalance),
      nativeDebt: Number(item.nativeDebt),
      reportingBalance: Number(item.reportingBalance),
      reportingDebt: Number(item.reportingDebt),
      reportingApproximate: item.currencyCode !== "COP",
      currentTerms: item.currentTerm ? liabilityTermFromRpc(item.currentTerm, accountId) : undefined,
      currentRates,
      rates: currentRates,
      nextObligation: item.nextObligation ? {
        id: item.nextObligation.id,
        kind: item.nextObligation.kind,
        sequenceNumber: optionalNumber(item.nextObligation.sequenceNumber),
        dueOn: item.nextObligation.dueOn,
        principalDue: Number(item.nextObligation.principalDue),
        interestDue: Number(item.nextObligation.interestDue),
        feeDue: Number(item.nextObligation.feeDue),
        minimumDue: Number(item.nextObligation.minimumDue),
        totalDue: Number(item.nextObligation.totalDue),
        allocated: Number(item.nextObligation.allocated),
        remaining: Number(item.nextObligation.remaining),
        status: item.nextObligation.status,
        version: Number(item.nextObligation.version),
      } : undefined,
      paymentRule: item.paymentRule ? {
        id: item.paymentRule.id,
        accountId,
        fundingAccountId: item.paymentRule.fundingAccountId,
        strategy: item.paymentRule.strategy,
        fixedAmount: optionalNumber(item.paymentRule.fixedAmount),
        maximumAmount: optionalNumber(item.paymentRule.maximumAmount),
        daysBeforeDue: Number(item.paymentRule.daysBeforeDue),
        recordingMode: item.paymentRule.recordingMode,
        active: item.paymentRule.active,
        suspendedByTarget: item.paymentRule.suspendedByTarget,
        version: Number(item.paymentRule.version),
      } : undefined,
      card: item.card ? {
        accountId,
        network: item.card.network,
        lastFour: item.card.lastFour ?? undefined,
        creditLimit: Number(item.card.creditLimit),
        cutoffDay: Number(item.card.cutoffDay),
        dueDay: Number(item.card.dueDay),
        annualFee: Number(item.card.annualFee),
        purchaseRateEa: optionalNumber(item.card.purchaseRateEa),
        cashAdvanceRateEa: optionalNumber(item.card.cashAdvanceRateEa),
        availableCredit: Number(item.card.availableCredit),
        version: Number(item.card.version),
      } : undefined,
    };
  });
  return {
    asOf: payload.asOf ?? fallbackAsOf,
    reportingCurrencyCode: "COP",
    totalReportingDebt: items.reduce((sum, item) => sum + item.reportingDebt, 0),
    items,
    coverage: "complete",
  };
}

export function liabilityCalendarFromRpc(value: unknown, dateFrom: string, dateTo: string, limit = 500): LiabilityCalendarRange {
  const payload = (value ?? {}) as { startDate?: string; endDate?: string; items?: LiabilityCalendarRpcItem[] };
  const rows = payload.items ?? [];
  return {
    startDate: payload.startDate ?? dateFrom,
    endDate: payload.endDate ?? dateTo,
    items: rows.filter((item) => item.currencyCode === "COP" || item.currencyCode === "USD").map((item) => ({
      date: item.date,
      type: item.type,
      id: item.id,
      accountId: item.accountId,
      accountName: item.accountName,
      currencyCode: item.currencyCode as "COP" | "USD",
      liabilityKind: item.liabilityKind,
      status: item.status,
      amount: Number(item.amount),
      remaining: Number(item.remaining),
      minimumDue: Number(item.minimumDue),
      sequenceNumber: optionalNumber(item.sequenceNumber),
      ledgerEventId: item.ledgerEventId ?? undefined,
      version: Number(item.version),
    })),
    coverage: rows.length >= limit ? "partial" : "complete",
  };
}

export function liabilityReconciliationPreviewFromRpc(value: unknown): LiabilityReconciliationPreview {
  const payload = value as LiabilityReconciliationPreviewRpc | null;
  if (!payload || (payload.currencyCode !== "COP" && payload.currencyCode !== "USD")) {
    throw new Error("La vista previa de conciliación no devolvió una moneda compatible.");
  }
  const adjustmentKind = payload.adjustmentKind === "adjustment_in" || payload.adjustmentKind === "adjustment_out"
    ? payload.adjustmentKind
    : undefined;
  return {
    accountId: payload.accountId,
    cutoffOn: payload.cutoffOn,
    currencyCode: payload.currencyCode,
    ledgerDebtBeforeStatementCharges: Number(payload.ledgerDebtBeforeStatementCharges ?? payload.ledgerDebt),
    ledgerBalance: Number(payload.ledgerBalance),
    ledgerDebt: Number(payload.ledgerDebt),
    reportingBalance: Number(payload.reportingBalance),
    statementTotal: Number(payload.statementTotal),
    postedInterest: Number(payload.postedInterest ?? 0),
    postedFees: Number(payload.postedFees ?? 0),
    interestToPost: Number(payload.interestToPost ?? 0),
    feesToPost: Number(payload.feesToPost ?? 0),
    difference: Number(payload.difference),
    adjustmentKind,
    isBalanced: payload.isBalanced,
    requiresExchangeRate: Boolean(payload.requiresExchangeRate),
  };
}

export async function loadRemoteLiabilityOverview(client: FinanceSupabaseClient, includeArchived = false) {
  const data = await callUntypedRpc(client, "get_liability_overview_v2", { p_include_archived: includeArchived });
  return liabilityOverviewFromRpc(data);
}

export async function loadRemoteLiabilityCalendar(client: FinanceSupabaseClient, dateFrom: string, dateTo: string, limit = 500) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateTo < dateFrom) {
    throw new Error("El rango del calendario de obligaciones no es válido.");
  }
  const pageLimit = Math.max(1, Math.min(limit, 2000));
  const items: LiabilityCalendarItem[] = [];
  let coverage: LiabilityCalendarRange["coverage"] = "complete";
  let cursor = dateFrom;
  while (cursor <= dateTo) {
    const segmentEnd = [isoDateOffset(cursor, 179), dateTo].sort()[0];
    const data = await callUntypedRpc(client, "get_liability_calendar_v2", { p_start_date: cursor, p_end_date: segmentEnd, p_limit: pageLimit });
    const segment = liabilityCalendarFromRpc(data, cursor, segmentEnd, pageLimit);
    items.push(...segment.items);
    if (segment.coverage === "partial") coverage = "partial";
    cursor = isoDateOffset(segmentEnd, 1);
  }
  return {
    startDate: dateFrom,
    endDate: dateTo,
    items: Array.from(new Map(items.map((item) => [`${item.type}:${item.id}`, item])).values())
      .sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id)),
    coverage,
  };
}

export async function previewRemoteLiabilityReconciliation(
  client: FinanceSupabaseClient,
  accountId: string,
  cutoffOn: string,
  statementTotal: number,
  statement?: { id?: string; periodStart: string; interest: number; fees: number },
) {
  const data = await callUntypedRpc(client, "preview_liability_reconciliation_v2", {
    p_account_id: accountId,
    p_cutoff_on: cutoffOn,
    p_total_due: statementTotal,
    p_obligation_id: statement?.id ?? null,
    p_period_start: statement?.periodStart ?? null,
    p_interest: statement?.interest ?? 0,
    p_fees: statement?.fees ?? 0,
  });
  return liabilityReconciliationPreviewFromRpc(data);
}

export function isoDateOffset(value: string, days: number) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function loadRemoteFinancialResetGeneration(client: FinanceSupabaseClient, userId: string) {
  const { data, error } = await client
    .from("profiles")
    .select("financial_reset_generation")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("El perfil todavía no está disponible.");
  const generation = Number(data.financial_reset_generation);
  if (!Number.isSafeInteger(generation) || generation < 0) {
    throw new Error("La versión remota de los datos financieros no es válida.");
  }
  return generation;
}

export async function loadRemoteFinanceState(client: FinanceSupabaseClient): Promise<FinanceState> {
  const month = currentMonthStart();
  const scheduleStart = isoDateOffset(month, -45);
  const scheduleEnd = isoDateOffset(month, 430);
  const [results, liabilityObligationRows, liabilityPaymentIntentRows] = await Promise.all([
    Promise.all([
      client.from("profiles").select("id,email,display_name,avatar_url,currency_code,timezone,week_starts_on,month_starts_on,theme_mode,color_theme,custom_theme_color,schema_version").maybeSingle(),
    client.from("account_entities").select("id,name,color,icon,sort_order,archived,version").eq("archived", false).order("sort_order").order("name"),
    client.from("accounts").select("id,name,account_type,initial_balance,color,icon,archived,archived_at,currency_code,expected_annual_return,opening_balance_date,opening_exchange_rate,entity_id,version").order("archived").order("created_at"),
    client.from("categories").select("id,name,category_group,transaction_kind,color,icon,is_default,archived,sort_order,main_category_id").order("archived").order("category_group").order("sort_order"),
    client.from("budgets").select("id,category_id,month,amount").eq("month", month).order("month"),
    client.from("monthly_budget_plans").select("month,income_target,source").eq("month", month).maybeSingle(),
    client.rpc("get_transactions_page", { p_limit: 50, p_kind: "all", p_query: "" }),
    client.from("main_categories").select("id,key,name,color,icon,target_percent,included_in_plan,sort_order,archived,is_default").order("archived").order("sort_order"),
    client.rpc("get_finance_snapshot", { p_month: month }),
    client.from("recurring_rules").select("id,kind,amount,destination_amount,account_id,destination_account_id,category_id,financial_target_id,financial_target_effect,description,merchant,note,icon,exchange_rate,exchange_rate_date,exchange_rate_source,reference_exchange_rate,reference_rate_source,cadence,interval_count,starts_on,ends_on,anchor_day,second_anchor_day,weekday,posting_policy,timezone,auto_post,include_in_budget,include_in_income_target,status,suspended_by_target,next_run_on,created_at,updated_at").neq("status", "archived").order("next_run_on"),
    client.from("recurring_occurrences").select("id,rule_id,kind,scheduled_on,effective_on,amount,destination_amount,account_id,destination_account_id,category_id,financial_target_id,financial_target_effect,description,merchant,note,icon,exchange_rate,exchange_rate_date,exchange_rate_source,reference_exchange_rate,reference_rate_source,status,suspended_by_target,transaction_id,transfer_group_id,failure_reason,posted_at,created_at").gte("effective_on", scheduleStart).lte("effective_on", scheduleEnd).order("effective_on").order("id"),
    client.from("financial_target_overview").select("id,mode,kind,status,title,description,target_amount,initial_progress,progress_amount,starts_on,target_date,priority,color,icon,account_id,category_id,tracking_mode,created_at,updated_at,completed_at,archived_at").order("status").order("priority").order("updated_at", { ascending: false }),
    client.from("financial_target_entries").select("id,target_id,kind,effect,amount,occurred_on,note,created_at").order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(100),
    client.from("financial_target_debt_details").select("target_id,creditor,annual_interest_rate,minimum_payment,due_day"),
    client.from("credit_card_profiles").select("account_id,network,last_four,credit_limit,cutoff_day,due_day,annual_fee,purchase_rate_ea,cash_advance_rate_ea,version"),
    client.from("credit_card_statements").select("id,account_id,period_start,period_end,cutoff_on,due_on,total_due,minimum_due,purchases,advances,interest,fees,payments,refunds,status,reconciled_at,version").order("cutoff_on", { ascending: false }).limit(24),
    client.from("credit_card_purchase_plans").select("id,account_id,transaction_id,installment_count,financing_type,annual_effective_rate,first_due_on,status").eq("status", "active").order("first_due_on"),
      client.from("credit_card_installments").select("id,plan_id,installment_number,due_on,principal,estimated_interest,estimated_fee,status,statement_id").in("status", ["planned", "billed"]).lte("due_on", scheduleEnd).order("due_on").limit(500),
    ] as const),
    loadRemoteLiabilityObligations(client),
    loadRemoteLiabilityPaymentIntents(client, scheduleStart, scheduleEnd),
  ] as const);
  const [profileResult, accountEntityResult, accountResult, categoryResult, initialBudgetResult, initialBudgetPlanResult, transactionResult, allocationResult, initialSnapshotResult, recurringRuleResult, recurringOccurrenceResult, financialTargetResult, financialTargetEntryResult, financialTargetDebtResult, creditCardResult, creditCardStatementResult, creditCardPurchasePlanResult, creditCardInstallmentResult] = results;
  const error = results.find((result) => result.error)?.error;
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
    budgetRows = budgetResult.data; budgetPlanRow = budgetPlanResult.data; snapshotRow = snapshotResult.data;
  }
  const transactionPayload = (transactionResult.data ?? {}) as TransactionPageRowResult;
  const transactionRows = transactionPayload.items ?? [];
  const relatedRows = transactionRows.flatMap((row) => row.transfer_pair ? [row.transfer_pair] : []);
  const liabilityCalendarStart = isoDateOffset(profileMonth, -45);
  // Bootstrap only the near-term window; other calendar ranges load on demand.
  const liabilityCalendarEnd = isoDateOffset(profileMonth, 120);
  const allTransactionRows = [...transactionRows, ...relatedRows];
  const [liabilityOverview, liabilityCalendar, liabilityRoleByEvent] = await Promise.all([
    loadRemoteLiabilityOverview(client),
    loadRemoteLiabilityCalendar(client, liabilityCalendarStart, liabilityCalendarEnd),
    loadRemoteTransactionLiabilityRoles(client, allTransactionRows),
  ]);
  const liabilities: Liability[] = liabilityOverview.items.map((item) => ({
    accountId: item.accountId,
    kind: item.kind,
    status: item.status,
    creditorName: item.creditorName,
    originalPrincipal: item.originalPrincipal,
    originatedOn: item.originatedOn,
    maturityOn: item.maturityOn,
    legacyTargetId: item.legacyTargetId,
    migrationStatus: item.migrationStatus,
    version: item.liabilityVersion,
  }));
  const liabilityBootstrap = liabilityBootstrapFromRows(liabilityObligationRows, liabilityPaymentIntentRows);
  return {
    profile,
    accountEntities: ((accountEntityResult.data ?? []) as AccountEntityRow[]).map((row): AccountEntity => ({ id: row.id, name: row.name, color: row.color, icon: row.icon, sortOrder: row.sort_order, archived: row.archived, version: Number(row.version) })),
    accounts: ((accountResult.data ?? []) as Array<AccountRow & { entity_id?: string | null }>).map((row) => ({ id: row.id, name: row.name, type: row.account_type, initialBalance: Number(row.initial_balance), color: row.color, icon: row.icon, archived: row.archived, archivedAt: row.archived_at ?? undefined, currencyCode: row.currency_code, expectedAnnualReturn: row.expected_annual_return === null || row.expected_annual_return === undefined ? undefined : Number(row.expected_annual_return), openingBalanceDate: row.opening_balance_date, openingExchangeRate: row.opening_exchange_rate === undefined ? undefined : Number(row.opening_exchange_rate), entityId: row.entity_id ?? undefined, version: row.version === undefined ? undefined : Number(row.version) })),
    creditCards: ((creditCardResult.data ?? []) as CreditCardProfileRow[]).map((row) => ({ accountId: row.account_id, network: row.network, lastFour: row.last_four ?? undefined, creditLimit: Number(row.credit_limit), cutoffDay: row.cutoff_day, dueDay: row.due_day, annualFee: Number(row.annual_fee), purchaseRateEa: row.purchase_rate_ea === null ? undefined : Number(row.purchase_rate_ea), cashAdvanceRateEa: row.cash_advance_rate_ea === null ? undefined : Number(row.cash_advance_rate_ea), version: Number(row.version) })),
    creditCardStatements: ((creditCardStatementResult.data ?? []) as CreditCardStatementRow[]).map(creditCardStatementFromRow),
    creditCardPurchasePlans: ((creditCardPurchasePlanResult.data ?? []) as CreditCardPurchasePlanRow[]).map(creditCardPurchasePlanFromRow),
    creditCardInstallments: ((creditCardInstallmentResult.data ?? []) as CreditCardInstallmentRow[]).map(creditCardInstallmentFromRow),
    liabilities,
    liabilityTerms: liabilityOverview.items.flatMap((item) => item.currentTerms ? [item.currentTerms] : []),
    liabilityRatePeriods: liabilityOverview.items.flatMap((item) => item.currentRates),
    liabilityObligations: liabilityBootstrap.obligations,
    liabilityPaymentRules: liabilityOverview.items.flatMap((item) => item.paymentRule ? [item.paymentRule] : []),
    liabilityPaymentIntents: liabilityBootstrap.intents,
    liabilityOverview,
    liabilityCalendar: liabilityCalendar.items,
    categories: ((categoryResult.data ?? []) as CategoryRow[]).map((row) => ({ id: row.id, name: row.name, group: row.category_group, color: row.color, icon: row.icon, kind: row.transaction_kind, isDefault: row.is_default, archived: row.archived, sortOrder: row.sort_order, mainCategoryId: row.main_category_id ?? undefined })),
    budgets: ((budgetRows ?? []) as BudgetRow[]).map((row) => ({ id: row.id, categoryId: row.category_id, month: row.month, amount: Number(row.amount) })),
    monthlyBudgetPlans: budgetPlanRow ? [{ month: (budgetPlanRow as MonthlyBudgetPlanRow).month, incomeTarget: Number((budgetPlanRow as MonthlyBudgetPlanRow).income_target), source: (budgetPlanRow as MonthlyBudgetPlanRow).source }] : [],
    budgetMonthsLoaded: [profileMonth],
    groupAllocations: ((allocationResult.data ?? []) as AllocationRow[]).map((row) => ({ id: row.id, group: row.key, name: row.name, color: row.color, icon: row.icon, targetPercent: Number(row.target_percent), includedInPlan: row.included_in_plan, sortOrder: row.sort_order, archived: row.archived, isDefault: row.is_default })),
    transactions: allTransactionRows.map((row) => transactionFromRow(row, row.ledger_event_id ? liabilityRoleByEvent.get(row.ledger_event_id) : undefined)),
    recurringRules: ((recurringRuleResult.data ?? []) as RecurringRuleRow[]).map(recurringRuleFromRow),
    recurringOccurrences: ((recurringOccurrenceResult.data ?? []) as RecurringOccurrenceRow[]).map(recurringOccurrenceFromRow),
    financialTargets: ((financialTargetResult.data ?? []) as FinancialTargetRow[]).map(financialTargetFromRow),
    financialTargetEntries: ((financialTargetEntryResult.data ?? []) as FinancialTargetEntryRow[]).map(financialTargetEntryFromRow),
    financialTargetDebts: ((financialTargetDebtResult.data ?? []) as FinancialTargetDebtRow[]).map(financialTargetDebtFromRow),
    snapshot: snapshotFromRow(snapshotRow as SnapshotRow),
  };
}
