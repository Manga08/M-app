import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Account,
  ArchiveFinanceGroupInput,
  Category,
  CategoryInput,
  CategoryOrderWrite,
  FinancialTarget,
  FinancialTargetDebtDetails,
  FinancialTargetEntry,
  FinancialTargetStatus,
  FinanceGroupInput,
  GroupAllocationWrite,
  IncomeTypeInput,
  MonthlyBudgetPlanInput,
  ProfileInput,
  QueueItem,
  RecurringRule,
  Transaction,
  TransactionInput,
} from "@/lib/finance/types";
import type { Database } from "@/lib/supabase/database.types";

type FinanceSupabaseClient = SupabaseClient<Database>;
type TransactionPayload = { transactions: Transaction[]; input: TransactionInput };
type TransactionImportPayload = { transactions: Transaction[] };

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

function transactionToV2Row(transaction: Transaction) {
  return {
    id: transaction.id, account_id: transaction.accountId, category_id: transaction.categoryId ?? null,
    kind: transaction.kind, amount: transaction.amount, transfer_group_id: transaction.transferGroupId ?? null,
    description: transaction.description, merchant: transaction.merchant ?? null, note: transaction.note ?? null,
    icon: transaction.icon ?? null, recurring_occurrence_id: transaction.recurringOccurrenceId ?? null,
    financial_target_id: transaction.financialTargetId ?? null,
    financial_target_effect: transaction.financialTargetEffect ?? null, occurred_on: transaction.occurredOn,
    native_currency_code: transaction.nativeCurrencyCode ?? null, base_currency_code: transaction.baseCurrencyCode ?? null,
    base_amount: transaction.baseAmount ?? null, exchange_rate: transaction.exchangeRate ?? null,
    exchange_rate_date: transaction.exchangeRateDate ?? null, exchange_rate_source: transaction.exchangeRateSource ?? null,
  };
}

function rpcGroupAllocations(allocations: GroupAllocationWrite[]) {
  return allocations.map((allocation) => ({
    group_key: allocation.group, percent: allocation.targetPercent, included: allocation.includedInPlan,
    sort_order: allocation.sortOrder,
  }));
}

async function upsertTransactions(client: FinanceSupabaseClient, operationId: string, payload: TransactionPayload | TransactionImportPayload) {
  const { error } = await client.rpc("upsert_transactions_v2", {
    p_operation_id: operationId,
    p_transactions: payload.transactions.map(transactionToV2Row),
  });
  if (error) throw error;
}

/** Executes one durable queue item. Each compound money mutation is atomic and replay-safe. */
export async function executeFinanceQueueItem(client: FinanceSupabaseClient, userId: string, item: QueueItem) {
  if (item.operation === "transaction.create" || item.operation === "transaction.update") {
    return upsertTransactions(client, item.id, item.payload as TransactionPayload);
  }
  if (item.operation === "transaction.import") {
    return upsertTransactions(client, item.id, item.payload as TransactionImportPayload);
  }
  if (item.operation === "transaction.delete") {
    const payload = item.payload as { id: string; transferGroupId?: string };
    const { error } = await client.rpc("delete_transactions_v2", {
      p_operation_id: item.id, p_transaction_id: payload.id, p_transfer_group_id: payload.transferGroupId,
    });
    if (error) throw error;
    return;
  }
  if (item.operation === "recurring-rule.upsert") {
    const { error } = await client.from("recurring_rules").upsert(recurringRuleToRow(userId, item.payload as RecurringRule), { onConflict: "id" });
    if (error) throw error;
    return;
  }
  if (item.operation === "recurring-rule.archive") {
    const { error } = await client.from("recurring_rules").update({ status: "archived", active: false, archived_at: new Date().toISOString() }).eq("id", (item.payload as { id: string }).id).eq("user_id", userId);
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
    const debt = payload.target.kind === "debt" && payload.debt ? {
      creditor: payload.debt.creditor ?? null, annual_interest_rate: payload.debt.annualInterestRate ?? null,
      minimum_payment: payload.debt.minimumPayment ?? null, due_day: payload.debt.dueDay ?? null,
    } : undefined;
    const { error } = await client.rpc("upsert_financial_target_v2", {
      p_operation_id: item.id, p_target: financialTargetToRow(userId, payload.target), p_debt: debt,
    });
    if (error) throw error;
    return;
  }
  if (item.operation === "financial-target.status") {
    const payload = item.payload as { id: string; status: FinancialTargetStatus; completedAt?: string; archivedAt?: string };
    const { error } = await client.from("financial_targets").update({ status: payload.status, completed_at: payload.completedAt ?? null, archived_at: payload.archivedAt ?? null }).eq("id", payload.id).eq("user_id", userId);
    if (error) throw error;
    return;
  }
  if (item.operation === "financial-target-entry.upsert") {
    const { error } = await client.from("financial_target_entries").upsert(financialTargetEntryToRow(userId, item.payload as FinancialTargetEntry), { onConflict: "id" });
    if (error) throw error;
    return;
  }
  if (item.operation === "financial-target-entry.delete") {
    const { error } = await client.from("financial_target_entries").delete().eq("id", (item.payload as { id: string }).id).eq("user_id", userId);
    if (error) throw error;
    return;
  }
  if (item.operation === "account.create") {
    const payload = item.payload as Account;
    const { error } = await client.from("accounts").upsert({
      id: payload.id, user_id: userId, name: payload.name, account_type: payload.type,
      initial_balance: payload.initialBalance, color: payload.color, icon: payload.icon,
      currency_code: payload.currencyCode ?? "COP", expected_annual_return: payload.expectedAnnualReturn ?? null,
    }, { onConflict: "id" });
    if (error) throw error;
    return;
  }
  if (item.operation === "category.create" || item.operation === "category.upsert") {
    const payload = item.payload as Category | CategoryInput;
    const { error } = await client.rpc("upsert_finance_category", { p_id: payload.id!, p_name: payload.name, p_group_key: payload.group, p_color: payload.color, p_icon: payload.icon });
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
    const { error } = await client.rpc("upsert_income_type", { p_id: payload.id!, p_name: payload.name, p_color: payload.color, p_icon: payload.icon });
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
    const { error } = await client.rpc("upsert_finance_group", { p_id: payload.id!, p_group_key: payload.group!, p_name: payload.name, p_color: payload.color, p_icon: payload.icon, p_sort_order: payload.sortOrder });
    if (error) throw error;
    return;
  }
  if (item.operation === "finance-group.archive") {
    const payload = item.payload as ArchiveFinanceGroupInput | { groupKey: string; destinationGroupKey?: string; archiveCategories?: boolean };
    const atomic = "allocations" in payload && Array.isArray(payload.allocations);
    const { error } = atomic
      ? await client.rpc("archive_finance_group_atomic", { p_group_key: payload.groupKey, p_allocations: rpcGroupAllocations(payload.allocations), p_destination_group_key: payload.destinationGroupKey, p_archive_categories: payload.archiveCategories ?? false })
      : await client.rpc("archive_finance_group", { p_group_key: payload.groupKey, p_destination_group_key: payload.destinationGroupKey, p_archive_categories: payload.archiveCategories ?? false });
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
    const { error } = await client.from("profiles").update({ display_name: payload.displayName, currency_code: payload.currencyCode, timezone: payload.timezone, week_starts_on: payload.weekStartsOn, month_starts_on: payload.monthStartsOn, theme_mode: payload.themeMode, color_theme: payload.colorTheme, custom_theme_color: payload.customThemeColor }).eq("id", userId);
    if (error) throw error;
    return;
  }
  if (item.operation === "allocation.set") {
    const { error } = await client.rpc("set_group_allocations", { p_allocations: rpcGroupAllocations(item.payload as GroupAllocationWrite[]) });
    if (error) throw error;
    return;
  }
  if (item.operation === "budget-plan.set") {
    const payload = item.payload as MonthlyBudgetPlanInput;
    const { error } = await client.rpc("set_monthly_budget_plan", { p_month: payload.month, p_income_target: payload.incomeTarget, p_source: payload.source, p_budgets: payload.budgets.map((budget) => ({ id: budget.id, category_id: budget.categoryId, amount: budget.amount })) });
    if (error) throw error;
    return;
  }
  if (item.operation === "category.order") {
    const payload = item.payload as { groupKey: string; positions: CategoryOrderWrite[] };
    const { error } = await client.rpc("set_finance_category_order", { p_group_key: payload.groupKey, p_positions: payload.positions.map((position) => ({ id: position.id, sort_order: position.sortOrder })) });
    if (error) throw error;
    return;
  }
  if (item.operation === "income-type.import") {
    for (const payload of item.payload as IncomeTypeInput[]) {
      const { error } = await client.rpc("upsert_income_type", { p_id: payload.id!, p_name: payload.name, p_color: payload.color, p_icon: payload.icon });
      if (error) throw error;
    }
    return;
  }
  if (item.operation === "category.import") {
    for (const payload of item.payload as CategoryInput[]) {
      const { error } = await client.rpc("upsert_finance_category", { p_id: payload.id!, p_name: payload.name, p_group_key: payload.group, p_color: payload.color, p_icon: payload.icon });
      if (error) throw error;
    }
    return;
  }
  throw new Error(`La operación offline “${String(item.operation)}” no está soportada por esta versión. Se conservará para no perder datos.`);
}
