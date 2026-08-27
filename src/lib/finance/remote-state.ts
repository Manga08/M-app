import type { SupabaseClient } from "@supabase/supabase-js";
import { currentMonthStart } from "@/lib/finance/calculations";
import type {
  Account,
  AccountEntity,
  BudgetPlanSource,
  Category,
  FinanceProfile,
  FinanceSnapshot,
  FinanceState,
  FinancialTarget,
  FinancialTargetDebtDetails,
  FinancialTargetEntry,
  GroupAllocation,
  RecurringOccurrence,
  RecurringRule,
  Transaction,
  TransactionCursor,
} from "@/lib/finance/types";
import type { Database } from "@/lib/supabase/database.types";
import { DEFAULT_CUSTOM_THEME_COLOR, normalizeHexColor } from "@/lib/custom-theme";

type FinanceSupabaseClient = SupabaseClient<Database>;
type ProfileRow = { id: string; email: string; display_name: string | null; avatar_url: string | null; currency_code: string; timezone: string; week_starts_on: number; month_starts_on: number; theme_mode: FinanceProfile["themeMode"]; color_theme: FinanceProfile["colorTheme"]; custom_theme_color: string; schema_version?: number };
type AccountRow = { id: string; name: string; account_type: Account["type"]; initial_balance: number | string; color: string; icon: string; archived: boolean; archived_at?: string | null; currency_code?: string; expected_annual_return?: number | string | null; opening_balance_date?: string; opening_exchange_rate?: number | string; version?: number | string };
type AccountEntityRow = { id: string; name: string; color: string; icon: string; sort_order: number; archived: boolean; version: number | string };
type CategoryRow = { id: string; name: string; category_group: Category["group"]; transaction_kind: Category["kind"]; color: string; icon: string; is_default: boolean; archived: boolean; sort_order: number; main_category_id?: string | null };
type BudgetRow = { id: string; category_id: string; month: string; amount: number | string };
type MonthlyBudgetPlanRow = { month: string; income_target: number | string; source: BudgetPlanSource };
type AllocationRow = { id: string; key: GroupAllocation["group"]; name: string; color: string; icon: string; target_percent: number | string; included_in_plan: boolean; sort_order: number; archived: boolean; is_default: boolean };
export type TransactionRow = { id: string; kind: Transaction["kind"]; amount: number | string; account_id: string; category_id: string | null; transfer_group_id: string | null; recurring_occurrence_id: string | null; financial_target_id: string | null; financial_target_effect: Transaction["financialTargetEffect"] | null; description: string; merchant: string | null; note: string | null; icon: string | null; occurred_on: string; created_at: string; ledger_event_id?: string; native_currency_code?: string; base_currency_code?: string; base_amount?: number | string; exchange_rate?: number | string; exchange_rate_date?: string; exchange_rate_source?: Transaction["exchangeRateSource"]; reference_exchange_rate?: number | string; reference_rate_source?: Transaction["referenceRateSource"]; version?: number | string };
export type RecurringRuleRow = { id: string; kind: RecurringRule["kind"]; amount: number | string; account_id: string; destination_account_id: string | null; category_id: string | null; financial_target_id: string | null; financial_target_effect: RecurringRule["financialTargetEffect"] | null; description: string; merchant: string | null; note: string | null; icon: string | null; cadence: RecurringRule["cadence"]; interval_count: number; starts_on: string; ends_on: string | null; anchor_day: number | null; second_anchor_day?: number | null; weekday: number | null; posting_policy: RecurringRule["postingPolicy"]; timezone: string; auto_post: boolean; include_in_budget: boolean; include_in_income_target: boolean; status: RecurringRule["status"]; next_run_on: string | null; created_at: string; updated_at: string };
export type RecurringOccurrenceRow = { id: string; rule_id: string; kind: RecurringOccurrence["kind"]; scheduled_on: string; effective_on: string; amount: number | string; account_id: string; destination_account_id: string | null; category_id: string | null; financial_target_id: string | null; financial_target_effect: RecurringOccurrence["financialTargetEffect"] | null; description: string; merchant: string | null; note: string | null; icon: string | null; status: RecurringOccurrence["status"]; transaction_id: string | null; transfer_group_id: string | null; failure_reason: string | null; posted_at: string | null; created_at: string };
type FinancialTargetRow = { id: string; mode: FinancialTarget["mode"]; kind: FinancialTarget["kind"]; status: FinancialTarget["status"]; title: string; description: string | null; target_amount: number | string; initial_progress: number | string; progress_amount: number | string; starts_on: string; target_date: string | null; priority: number; color: string; icon: string; account_id: string | null; category_id: string | null; tracking_mode: FinancialTarget["trackingMode"]; created_at: string; updated_at: string; completed_at: string | null; archived_at: string | null };
export type FinancialTargetEntryRow = { id: string; target_id: string; kind: FinancialTargetEntry["kind"]; effect: FinancialTargetEntry["effect"]; amount: number | string; occurred_on: string; note: string | null; created_at: string };
type FinancialTargetDebtRow = { target_id: string; creditor: string | null; annual_interest_rate: number | string | null; minimum_payment: number | string | null; due_day: number | null };
type SnapshotRow = { month: string; income: number | string; expense: number | string; netWorth?: number | string; accountBalances: Record<string, number | string>; accountBalancesBase?: Record<string, number | string>; categorySpending: Record<string, number | string> };
export type TransactionPageRow = TransactionRow & { transfer_pair?: TransactionRow | null };
export type TransactionPageRowResult = { items?: TransactionPageRow[]; hasMore?: boolean; nextCursor?: TransactionCursor | null };

function profileFromRow(row: ProfileRow): FinanceProfile {
  return { id: row.id, email: row.email, displayName: row.display_name?.trim() || row.email.split("@")[0] || "Usuario", avatarUrl: row.avatar_url ?? undefined, currencyCode: row.currency_code, timezone: row.timezone, weekStartsOn: row.week_starts_on, monthStartsOn: row.month_starts_on, themeMode: row.theme_mode, colorTheme: row.color_theme, customThemeColor: normalizeHexColor(row.custom_theme_color) ?? DEFAULT_CUSTOM_THEME_COLOR, schemaVersion: row.schema_version };
}

export function transactionFromRow(row: TransactionRow): Transaction {
  return { id: row.id, kind: row.kind, amount: Number(row.amount), accountId: row.account_id, categoryId: row.category_id ?? undefined, transferGroupId: row.transfer_group_id ?? undefined, recurringOccurrenceId: row.recurring_occurrence_id ?? undefined, financialTargetId: row.financial_target_id ?? undefined, financialTargetEffect: row.financial_target_effect ?? undefined, description: row.description, merchant: row.merchant ?? undefined, note: row.note ?? undefined, icon: row.icon ?? undefined, occurredOn: row.occurred_on, createdAt: row.created_at, ledgerEventId: row.ledger_event_id, nativeCurrencyCode: row.native_currency_code, baseCurrencyCode: row.base_currency_code, baseAmount: row.base_amount === undefined ? undefined : Number(row.base_amount), exchangeRate: row.exchange_rate === undefined ? undefined : Number(row.exchange_rate), exchangeRateDate: row.exchange_rate_date, exchangeRateSource: row.exchange_rate_source, referenceExchangeRate: row.reference_exchange_rate === undefined ? undefined : Number(row.reference_exchange_rate), referenceRateSource: row.reference_rate_source, version: row.version === undefined ? undefined : Number(row.version), syncStatus: "synced" };
}

export function recurringRuleFromRow(row: RecurringRuleRow): RecurringRule {
  return { id: row.id, kind: row.kind, amount: Number(row.amount), accountId: row.account_id, destinationAccountId: row.destination_account_id ?? undefined, categoryId: row.category_id ?? undefined, financialTargetId: row.financial_target_id ?? undefined, financialTargetEffect: row.financial_target_effect ?? undefined, description: row.description, merchant: row.merchant ?? undefined, note: row.note ?? undefined, icon: row.icon ?? undefined, cadence: row.cadence, intervalCount: row.interval_count, startsOn: row.starts_on, endsOn: row.ends_on ?? undefined, anchorDay: row.anchor_day ?? undefined, secondAnchorDay: row.second_anchor_day ?? undefined, weekday: row.weekday ?? undefined, postingPolicy: row.posting_policy, timezone: row.timezone, autoPost: row.auto_post, includeInBudget: row.include_in_budget, includeInIncomeTarget: row.include_in_income_target, status: row.status, nextRunOn: row.next_run_on ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at, syncStatus: "synced" };
}

export function recurringOccurrenceFromRow(row: RecurringOccurrenceRow): RecurringOccurrence {
  return { id: row.id, ruleId: row.rule_id, kind: row.kind, scheduledOn: row.scheduled_on, effectiveOn: row.effective_on, amount: Number(row.amount), accountId: row.account_id, destinationAccountId: row.destination_account_id ?? undefined, categoryId: row.category_id ?? undefined, financialTargetId: row.financial_target_id ?? undefined, financialTargetEffect: row.financial_target_effect ?? undefined, description: row.description, merchant: row.merchant ?? undefined, note: row.note ?? undefined, icon: row.icon ?? undefined, status: row.status, transactionId: row.transaction_id ?? undefined, transferGroupId: row.transfer_group_id ?? undefined, failureReason: row.failure_reason ?? undefined, postedAt: row.posted_at ?? undefined, createdAt: row.created_at };
}

function financialTargetFromRow(row: FinancialTargetRow): FinancialTarget {
  return { id: row.id, mode: row.mode, kind: row.kind, status: row.status, title: row.title, description: row.description ?? undefined, targetAmount: Number(row.target_amount), initialProgress: Number(row.initial_progress), progressAmount: Number(row.progress_amount), startsOn: row.starts_on, targetDate: row.target_date ?? undefined, priority: row.priority, color: row.color, icon: row.icon, accountId: row.account_id ?? undefined, categoryId: row.category_id ?? undefined, trackingMode: row.tracking_mode, createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at ?? undefined, archivedAt: row.archived_at ?? undefined, syncStatus: "synced" };
}

export function financialTargetEntryFromRow(row: FinancialTargetEntryRow): FinancialTargetEntry {
  return { id: row.id, targetId: row.target_id, kind: row.kind, effect: row.effect, amount: Number(row.amount), occurredOn: row.occurred_on, note: row.note ?? undefined, createdAt: row.created_at, syncStatus: "synced" };
}

function financialTargetDebtFromRow(row: FinancialTargetDebtRow): FinancialTargetDebtDetails {
  return { targetId: row.target_id, creditor: row.creditor ?? undefined, annualInterestRate: row.annual_interest_rate === null ? undefined : Number(row.annual_interest_rate), minimumPayment: row.minimum_payment === null ? undefined : Number(row.minimum_payment), dueDay: row.due_day ?? undefined };
}

function snapshotFromRow(row: SnapshotRow): FinanceSnapshot {
  return { month: row.month, income: Number(row.income), expense: Number(row.expense), netWorth: row.netWorth === undefined ? undefined : Number(row.netWorth), accountBalances: Object.fromEntries(Object.entries(row.accountBalances ?? {}).map(([id, value]) => [id, Number(value)])), accountBalancesBase: Object.fromEntries(Object.entries(row.accountBalancesBase ?? {}).map(([id, value]) => [id, Number(value)])), categorySpending: Object.fromEntries(Object.entries(row.categorySpending ?? {}).map(([id, value]) => [id, Number(value)])) };
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
  const results = await Promise.all([
    client.from("profiles").select("id,email,display_name,avatar_url,currency_code,timezone,week_starts_on,month_starts_on,theme_mode,color_theme,custom_theme_color,schema_version").maybeSingle(),
    client.from("account_entities").select("id,name,color,icon,sort_order,archived,version").eq("archived", false).order("sort_order").order("name"),
    client.from("accounts").select("id,name,account_type,initial_balance,color,icon,archived,archived_at,currency_code,expected_annual_return,opening_balance_date,opening_exchange_rate,entity_id,version").order("archived").order("created_at"),
    client.from("categories").select("id,name,category_group,transaction_kind,color,icon,is_default,archived,sort_order,main_category_id").order("archived").order("category_group").order("sort_order"),
    client.from("budgets").select("id,category_id,month,amount").eq("month", month).order("month"),
    client.from("monthly_budget_plans").select("month,income_target,source").eq("month", month).maybeSingle(),
    client.rpc("get_transactions_page", { p_limit: 50, p_kind: "all", p_query: "" }),
    client.from("main_categories").select("id,key,name,color,icon,target_percent,included_in_plan,sort_order,archived,is_default").order("archived").order("sort_order"),
    client.rpc("get_finance_snapshot", { p_month: month }),
    client.from("recurring_rules").select("id,kind,amount,account_id,destination_account_id,category_id,financial_target_id,financial_target_effect,description,merchant,note,icon,cadence,interval_count,starts_on,ends_on,anchor_day,second_anchor_day,weekday,posting_policy,timezone,auto_post,include_in_budget,include_in_income_target,status,next_run_on,created_at,updated_at").neq("status", "archived").order("next_run_on"),
    client.from("recurring_occurrences").select("id,rule_id,kind,scheduled_on,effective_on,amount,account_id,destination_account_id,category_id,financial_target_id,financial_target_effect,description,merchant,note,icon,status,transaction_id,transfer_group_id,failure_reason,posted_at,created_at").gte("effective_on", scheduleStart).lte("effective_on", scheduleEnd).order("effective_on").order("id"),
    client.from("financial_target_overview").select("id,mode,kind,status,title,description,target_amount,initial_progress,progress_amount,starts_on,target_date,priority,color,icon,account_id,category_id,tracking_mode,created_at,updated_at,completed_at,archived_at").order("status").order("priority").order("updated_at", { ascending: false }),
    client.from("financial_target_entries").select("id,target_id,kind,effect,amount,occurred_on,note,created_at").order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(100),
    client.from("financial_target_debt_details").select("target_id,creditor,annual_interest_rate,minimum_payment,due_day"),
  ] as const);
  const [profileResult, accountEntityResult, accountResult, categoryResult, initialBudgetResult, initialBudgetPlanResult, transactionResult, allocationResult, initialSnapshotResult, recurringRuleResult, recurringOccurrenceResult, financialTargetResult, financialTargetEntryResult, financialTargetDebtResult] = results;
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
  return {
    profile,
    accountEntities: ((accountEntityResult.data ?? []) as AccountEntityRow[]).map((row): AccountEntity => ({ id: row.id, name: row.name, color: row.color, icon: row.icon, sortOrder: row.sort_order, archived: row.archived, version: Number(row.version) })),
    accounts: ((accountResult.data ?? []) as Array<AccountRow & { entity_id?: string | null }>).map((row) => ({ id: row.id, name: row.name, type: row.account_type, initialBalance: Number(row.initial_balance), color: row.color, icon: row.icon, archived: row.archived, archivedAt: row.archived_at ?? undefined, currencyCode: row.currency_code, expectedAnnualReturn: row.expected_annual_return === null || row.expected_annual_return === undefined ? undefined : Number(row.expected_annual_return), openingBalanceDate: row.opening_balance_date, openingExchangeRate: row.opening_exchange_rate === undefined ? undefined : Number(row.opening_exchange_rate), entityId: row.entity_id ?? undefined, version: row.version === undefined ? undefined : Number(row.version) })),
    categories: ((categoryResult.data ?? []) as CategoryRow[]).map((row) => ({ id: row.id, name: row.name, group: row.category_group, color: row.color, icon: row.icon, kind: row.transaction_kind, isDefault: row.is_default, archived: row.archived, sortOrder: row.sort_order, mainCategoryId: row.main_category_id ?? undefined })),
    budgets: ((budgetRows ?? []) as BudgetRow[]).map((row) => ({ id: row.id, categoryId: row.category_id, month: row.month, amount: Number(row.amount) })),
    monthlyBudgetPlans: budgetPlanRow ? [{ month: (budgetPlanRow as MonthlyBudgetPlanRow).month, incomeTarget: Number((budgetPlanRow as MonthlyBudgetPlanRow).income_target), source: (budgetPlanRow as MonthlyBudgetPlanRow).source }] : [],
    budgetMonthsLoaded: [profileMonth],
    groupAllocations: ((allocationResult.data ?? []) as AllocationRow[]).map((row) => ({ id: row.id, group: row.key, name: row.name, color: row.color, icon: row.icon, targetPercent: Number(row.target_percent), includedInPlan: row.included_in_plan, sortOrder: row.sort_order, archived: row.archived, isDefault: row.is_default })),
    transactions: [...transactionRows, ...relatedRows].map(transactionFromRow),
    recurringRules: ((recurringRuleResult.data ?? []) as RecurringRuleRow[]).map(recurringRuleFromRow),
    recurringOccurrences: ((recurringOccurrenceResult.data ?? []) as RecurringOccurrenceRow[]).map(recurringOccurrenceFromRow),
    financialTargets: ((financialTargetResult.data ?? []) as FinancialTargetRow[]).map(financialTargetFromRow),
    financialTargetEntries: ((financialTargetEntryResult.data ?? []) as FinancialTargetEntryRow[]).map(financialTargetEntryFromRow),
    financialTargetDebts: ((financialTargetDebtResult.data ?? []) as FinancialTargetDebtRow[]).map(financialTargetDebtFromRow),
    snapshot: snapshotFromRow(snapshotRow as SnapshotRow),
  };
}
