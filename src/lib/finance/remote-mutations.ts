import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Account,
  AccountEntityInput,
  AccountUpdateInput,
  ArchiveFinanceGroupInput,
  Category,
  CategoryInput,
  CategoryOrderWrite,
  CreditCardInput,
  CreditCardInstallment,
  CreditCardPurchasePlan,
  CreditCardStatement,
  FinancialTarget,
  FinancialTargetDebtDetails,
  FinancialTargetEntry,
  FinancialTargetStatus,
  FinanceGroupInput,
  GroupAllocationWrite,
  IncomeTypeInput,
  MonthlyBudgetPlanInput,
  PlannerImportMutationInput,
  ProfileInput,
  QueueItem,
  RecurringRule,
  Transaction,
  TransactionInput,
} from "@/lib/finance/types";
import type { Database } from "@/lib/supabase/database.types";
import { exactPostingExchangeRate, normalizeTransferPostings } from "@/lib/finance/transfer-exchange";
import { REPORTING_CURRENCY_CODE } from "@/lib/finance/currency";

type FinanceSupabaseClient = SupabaseClient<Database>;
type TransactionPayload = { transactions: Transaction[]; input: TransactionInput };
type TransactionImportPayload = { transactions: Transaction[] };
type PlannerImportQueuePayload = Omit<PlannerImportMutationInput, "transactions"> & { transactions: Transaction[] };
type CreditCardPurchaseQueuePayload = {
  transaction: Transaction;
  plan: CreditCardPurchasePlan;
  installments: CreditCardInstallment[];
};

function recurringRuleToRow(userId: string, rule: RecurringRule) {
  return {
    id: rule.id, user_id: userId, account_id: rule.accountId, destination_account_id: rule.destinationAccountId ?? null,
    category_id: rule.categoryId ?? null, financial_target_id: rule.financialTargetId ?? null,
    financial_target_effect: rule.financialTargetEffect ?? null, kind: rule.kind, amount: rule.amount, description: rule.description,
    merchant: rule.merchant ?? null, note: rule.note ?? null, icon: rule.icon ?? null, cadence: rule.cadence,
    destination_amount: rule.destinationAmount ?? null, exchange_rate: rule.exchangeRate,
    exchange_rate_date: rule.exchangeRateDate, exchange_rate_source: rule.exchangeRateSource,
    reference_exchange_rate: rule.referenceExchangeRate ?? null,
    reference_rate_source: rule.referenceRateSource ?? null,
    interval_count: rule.intervalCount, starts_on: rule.startsOn, ends_on: rule.endsOn ?? null,
    anchor_day: rule.anchorDay ?? null, second_anchor_day: rule.secondAnchorDay ?? null, weekday: rule.weekday ?? null, posting_policy: rule.postingPolicy,
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
    priority: target.priority, color: target.color, icon: target.icon,
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
    base_amount: transaction.baseAmount ?? null,
    exchange_rate: transaction.transferGroupId && transaction.baseAmount && transaction.amount > 0
      ? exactPostingExchangeRate(transaction.baseAmount, transaction.amount)
      : transaction.exchangeRate ?? null,
    exchange_rate_date: transaction.exchangeRateDate ?? null, exchange_rate_source: transaction.exchangeRateSource ?? null,
    reference_exchange_rate: transaction.referenceExchangeRate ?? null,
    reference_rate_source: transaction.referenceRateSource ?? null,
  };
}

function accountToPlannerRow(payload: PlannerImportQueuePayload) {
  return {
    id: payload.account.id,
    create_account: payload.createAccount,
    reconcile_initial_balance: payload.reconcileInitialBalance,
    name: payload.account.name,
    account_type: payload.account.type,
    initial_balance: payload.account.initialBalance,
    color: payload.account.color,
    icon: payload.account.icon ?? null,
    currency_code: payload.account.currencyCode ?? "COP",
    expected_annual_return: payload.account.expectedAnnualReturn ?? null,
  };
}

function rpcGroupAllocations(allocations: GroupAllocationWrite[]) {
  return allocations.map((allocation) => ({
    group_key: allocation.group, percent: allocation.targetPercent, included: allocation.includedInPlan,
    sort_order: allocation.sortOrder,
  }));
}

async function upsertTransactions(client: FinanceSupabaseClient, operationId: string, payload: TransactionPayload | TransactionImportPayload) {
  const transactions = normalizeTransferPostings(payload.transactions);
  const { error } = await client.rpc("upsert_transactions_v3", {
    p_operation_id: operationId,
    p_transactions: transactions.map(transactionToV2Row),
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
  if (item.operation === "planner.import") {
    const payload = item.payload as PlannerImportQueuePayload;
    const { error } = await client.rpc("import_planner_v1", {
      p_operation_id: item.id,
      p_account: accountToPlannerRow(payload),
      p_categories: payload.categories,
      p_income_types: payload.incomeTypes,
      p_transactions: payload.transactions.map(transactionToV2Row),
    });
    if (error) throw error;
    return;
  }
  if (item.operation === "transaction.delete") {
    const payload = item.payload as { id: string; transferGroupId?: string };
    const { error } = await client.rpc("delete_transactions_v2", {
      p_operation_id: item.id, p_transaction_id: payload.id, p_transfer_group_id: payload.transferGroupId,
    });
    if (error) throw error;
    return;
  }
  if (item.operation === "credit-card.upsert") {
    const payload = item.payload as CreditCardInput & { accountId: string };
    const { error } = await client.rpc("upsert_credit_card_v1", {
      p_operation_id: item.id,
      p_account: {
        id: payload.accountId,
        name: payload.name,
        color: payload.color,
        icon: payload.icon,
        currency_code: payload.currencyCode,
        entity_id: payload.entityId ?? "",
        opening_debt: payload.openingDebt,
        opening_balance_date: payload.openingBalanceDate,
        opening_exchange_rate: payload.openingExchangeRate ?? null,
      },
      p_card: {
        network: payload.network,
        last_four: payload.lastFour ?? "",
        credit_limit: payload.creditLimit,
        cutoff_day: payload.cutoffDay,
        due_day: payload.dueDay,
        annual_fee: payload.annualFee,
        purchase_rate_ea: payload.purchaseRateEa ?? "",
        cash_advance_rate_ea: payload.cashAdvanceRateEa ?? "",
      },
      p_expected_account_version: payload.accountVersion,
      p_expected_card_version: payload.cardVersion,
    });
    if (error) throw error;
    return;
  }
  if (item.operation === "credit-card.purchase.create") {
    const payload = item.payload as CreditCardPurchaseQueuePayload;
    const { error } = await client.rpc("create_credit_card_purchase_v1", {
      p_operation_id: item.id,
      p_transaction: transactionToV2Row(payload.transaction),
      p_plan: {
        id: payload.plan.id,
        installment_count: payload.plan.installmentCount,
        financing_type: payload.plan.financingType,
        annual_effective_rate: payload.plan.annualEffectiveRate ?? "",
        first_due_on: payload.plan.firstDueOn,
      },
      p_installments: payload.installments.map((installment) => ({
        id: installment.id,
        installment_number: installment.installmentNumber,
        due_on: installment.dueOn,
        principal: installment.principal,
        estimated_interest: installment.estimatedInterest,
        estimated_fee: installment.estimatedFee,
      })),
    });
    if (error) throw error;
    return;
  }
  if (item.operation === "credit-card.statement.upsert") {
    const statement = item.payload as CreditCardStatement;
    const { error } = await client.from("credit_card_statements").upsert({
      id: statement.id,
      user_id: userId,
      account_id: statement.accountId,
      period_start: statement.periodStart,
      period_end: statement.periodEnd,
      cutoff_on: statement.cutoffOn,
      due_on: statement.dueOn,
      total_due: statement.totalDue,
      minimum_due: statement.minimumDue,
      purchases: statement.purchases,
      advances: statement.advances,
      interest: statement.interest,
      fees: statement.fees,
      payments: statement.payments,
      refunds: statement.refunds,
      status: statement.status,
      reconciled_at: statement.reconciledAt ?? new Date().toISOString(),
      version: statement.version ?? 1,
    }, { onConflict: "id" });
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
  if (item.operation === "account-entity.upsert") {
    const payload = item.payload as AccountEntityInput;
    const { error } = await client.rpc("upsert_account_entity", {
      p_operation_id: item.id,
      p_entity: {
        id: payload.id,
        name: payload.name,
        color: payload.color,
        icon: payload.icon,
        sort_order: payload.sortOrder,
      },
      p_expected_version: payload.version,
    });
    if (error) throw error;
    return;
  }
  if (item.operation === "account-entity.archive") {
    const payload = item.payload as { id: string; version: number };
    const { error } = await client.rpc("archive_account_entity", {
      p_operation_id: item.id,
      p_entity_id: payload.id,
      p_expected_version: payload.version,
    });
    if (error) throw error;
    return;
  }
  if (item.operation === "account.create") {
    const payload = item.payload as Account;
    const { error } = await client.from("accounts").upsert({
      id: payload.id, user_id: userId, name: payload.name, account_type: payload.type,
      initial_balance: payload.initialBalance, color: payload.color, icon: payload.icon,
      currency_code: payload.currencyCode ?? "COP", expected_annual_return: payload.expectedAnnualReturn ?? null,
      opening_balance_date: payload.openingBalanceDate ?? new Date().toISOString().slice(0, 10),
      opening_exchange_rate: payload.openingExchangeRate ?? (payload.currencyCode === "USD" ? null : 1),
      entity_id: payload.entityId ?? null,
    }, { onConflict: "id" });
    if (error) throw error;
    return;
  }
  if (item.operation === "account.update") {
    const payload = item.payload as AccountUpdateInput;
    const { error } = await client.rpc("update_account_v3", {
      p_operation_id: item.id,
      p_account: {
        id: payload.account.id,
        name: payload.account.name,
        account_type: payload.account.type,
        color: payload.account.color,
        icon: payload.account.icon ?? "",
        currency_code: payload.account.currencyCode ?? "COP",
        expected_annual_return: payload.account.expectedAnnualReturn ?? "",
        entity_id: payload.account.entityId ?? "",
      },
      p_expected_version: payload.account.version ?? 1,
      p_target_balance: payload.targetBalance,
      p_adjustment_date: payload.adjustmentDate,
      p_exchange_rate: payload.exchangeRate,
      p_reference_exchange_rate: payload.referenceExchangeRate,
      p_reference_rate_source: payload.referenceRateSource,
    });
    if (error) throw error;
    return;
  }
  if (item.operation === "account.archive") {
    const payload = item.payload as { id: string; version: number };
    const { error } = await client.rpc("archive_account_v1", {
      p_operation_id: item.id,
      p_account_id: payload.id,
      p_expected_version: payload.version,
    });
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
    const { error } = await client.from("profiles").update({ display_name: payload.displayName, currency_code: REPORTING_CURRENCY_CODE, timezone: payload.timezone, week_starts_on: payload.weekStartsOn, month_starts_on: payload.monthStartsOn, theme_mode: payload.themeMode, color_theme: payload.colorTheme, custom_theme_color: payload.customThemeColor }).eq("id", userId);
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
