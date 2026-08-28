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
  FinancialTargetDebtInput,
  FinancialTargetEntry,
  FinancialTargetStatus,
  FinanceGroupInput,
  GroupAllocationWrite,
  IncomeTypeInput,
  LiabilityAdjustmentInput,
  LiabilityArchiveInput,
  LiabilityInput,
  LiabilityObligation,
  LiabilityObligationWriteInput,
  LiabilityPaymentInput,
  LiabilityPaymentRuleInput,
  LiabilityTermsInput,
  MonthlyBudgetPlanInput,
  PlannerImportMutationInput,
  ProfileInput,
  QueueItem,
  RecurringRule,
  Transaction,
  TransactionInput,
} from "@/lib/finance/types";
import type { Database, Json } from "@/lib/supabase/database.types";
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

type RpcResult = { data: unknown; error: { message?: string } | null };

async function callUntypedRpc(client: FinanceSupabaseClient, name: string, args: Record<string, unknown>) {
  // SupabaseClient.rpc reads `this.rest`; keep the client receiver when the
  // generated Database type does not yet expose a freshly deployed RPC.
  const rpc = client.rpc.bind(client) as unknown as (fn: string, parameters: Record<string, unknown>) => PromiseLike<RpcResult>;
  const result = await rpc(name, args);
  if (result.error) throw result.error;
  return result.data;
}

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

export function liabilityTermsToRpc(input: LiabilityTermsInput) {
  return {
    term: {
      id: input.id,
      account_id: input.accountId,
      starts_on: input.startsOn,
      ends_on: input.endsOn ?? "",
      payment_frequency: input.paymentFrequency,
      interval_count: input.intervalCount,
      calculation_method: input.calculationMethod,
      amortization_method: input.amortizationMethod,
      statement_cutoff_day: input.statementCutoffDay ?? "",
      due_day: input.dueDay ?? "",
      first_due_on: input.firstDueOn ?? "",
      installment_count: input.installmentCount ?? "",
      scheduled_payment: input.scheduledPayment ?? "",
      contractual_minimum: input.contractualMinimum ?? "",
      periodic_fee: input.periodicFee,
      periodic_insurance: input.periodicInsurance,
      variable_rate: input.variableRate,
      index_name: input.indexName ?? "",
      spread_rate: input.spreadRate ?? "",
      prepayment_strategy: input.prepaymentStrategy,
      source: input.source,
    },
    rates: input.rates.map((rate) => ({
      id: rate.id,
      rate_kind: rate.rateKind,
      rate_basis: rate.rateBasis,
      reported_value: rate.reportedValue,
      effective_annual_rate: rate.effectiveAnnualRate ?? null,
      starts_on: rate.startsOn,
      ends_on: rate.endsOn ?? null,
      source: rate.source,
    })),
  };
}

export function liabilityObligationToRpc(obligation: LiabilityObligation | LiabilityObligationWriteInput["obligation"]) {
  return {
    id: obligation.id,
    account_id: obligation.accountId,
    kind: obligation.kind,
    sequence_number: obligation.sequenceNumber ?? null,
    period_start: obligation.periodStart ?? null,
    period_end: obligation.periodEnd ?? null,
    due_on: obligation.dueOn,
    principal_due: obligation.principalDue,
    interest_due: obligation.interestDue,
    fee_due: obligation.feeDue,
    minimum_due: obligation.minimumDue,
    total_due: obligation.totalDue,
    status: obligation.status,
    source: obligation.source,
  };
}

function creditCardStatementToRpc(statement: CreditCardStatement) {
  return {
    id: statement.id,
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
    reconciled_at: statement.reconciledAt ?? null,
    reconciliation_transaction_id: statement.reconciliationTransactionId ?? null,
    reconciliation_exchange_rate: statement.reconciliationExchangeRate ?? null,
    reconciliation_exchange_rate_source: statement.reconciliationExchangeRateSource ?? null,
    version: statement.version ?? null,
  };
}

export function liabilityAdjustmentToRpc(adjustment: LiabilityAdjustmentInput) {
  return {
    id: adjustment.id,
    role: adjustment.role,
    kind: adjustment.kind,
    amount: adjustment.amount,
    category_id: adjustment.categoryId ?? null,
    description: adjustment.description ?? null,
    merchant: adjustment.merchant ?? null,
    note: adjustment.note ?? null,
    icon: adjustment.icon ?? null,
    occurred_on: adjustment.occurredOn ?? null,
    exchange_rate: adjustment.exchangeRate ?? null,
    exchange_rate_date: adjustment.exchangeRateDate ?? null,
    exchange_rate_source: adjustment.exchangeRateSource ?? null,
    reference_exchange_rate: adjustment.referenceExchangeRate ?? null,
    reference_rate_source: adjustment.referenceRateSource ?? null,
  };
}

export function liabilityPaymentToRpc(input: LiabilityPaymentInput) {
  return {
    payment: {
      liability_account_id: input.accountId,
      funding_account_id: input.fundingAccountId,
      liability_amount: input.liabilityAmount,
      funding_amount: input.fundingAmount ?? null,
      occurred_on: input.occurredOn ?? null,
      description: input.description ?? null,
      intent_id: input.intentId ?? null,
      transfer_group_id: input.transferGroupId ?? null,
      funding_transaction_id: input.fundingTransactionId ?? null,
      liability_transaction_id: input.liabilityTransactionId ?? null,
      interest_transaction_id: input.interestTransactionId ?? null,
      fee_transaction_id: input.feeTransactionId ?? null,
      funding_exchange_rate: input.fundingExchangeRate,
      liability_exchange_rate: input.liabilityExchangeRate,
      funding_exchange_rate_source: input.fundingExchangeRateSource ?? null,
      liability_exchange_rate_source: input.liabilityExchangeRateSource ?? null,
      future_schedule: input.futureObligations?.map((obligation) => ({
        ...liabilityObligationToRpc(obligation),
        expected_version: obligation.version ?? null,
      })) ?? null,
    },
    allocations: (input.allocations ?? []).map((allocation) => ({
      id: allocation.id ?? null,
      obligation_id: allocation.obligationId,
      amount: allocation.amount,
      allocated_on: allocation.allocatedOn ?? null,
    })),
  };
}

export function creditCardStatementToLiabilityWrite(statement: CreditCardStatement): LiabilityObligationWriteInput {
  // `payments` is informational activity inside the bank cycle and totalDue is
  // already the resulting net balance. Only a zero statement is settled before
  // ledger-backed payment allocations are recorded.
  const settled = statement.totalDue === 0;
  return {
    obligation: {
      id: statement.id,
      accountId: statement.accountId,
      kind: "credit_card_statement",
      periodStart: statement.periodStart,
      periodEnd: statement.periodEnd,
      dueOn: statement.dueOn,
      principalDue: Math.max(0, statement.totalDue - statement.interest - statement.fees),
      interestDue: statement.interest,
      feeDue: statement.fees,
      minimumDue: statement.minimumDue,
      totalDue: statement.totalDue,
      status: settled ? "paid" : "open",
      source: "statement",
      version: statement.version,
    },
    statement,
    adjustments: [],
  };
}

export function financialTargetDebtToRpc(debt: FinancialTargetDebtInput | undefined) {
  if (!debt) return undefined;
  const payload: { [key: string]: Json | undefined } = {};
  const assign = (key: string, value: Json | undefined) => {
    if (value !== undefined) payload[key] = value;
  };

  assign("creditor", debt.creditor);
  assign("annual_interest_rate", debt.annualInterestRate);
  assign("minimum_payment", debt.minimumPayment);
  assign("due_day", debt.dueDay);
  assign("liability_account_id", debt.liabilityAccountId);
  assign("debt_type", debt.debtType);
  assign("currency_code", debt.currencyCode);
  assign("principal", debt.principal);
  assign("opening_exchange_rate", debt.openingExchangeRate);
  assign("term_id", debt.termId);
  assign("rate_id", debt.rateId);
  assign("terms_start_on", debt.termsStartOn);
  assign("terms_end_on", debt.termsEndOn);
  assign("payment_frequency", debt.paymentFrequency);
  assign("interval_count", debt.intervalCount);
  assign("calculation_method", debt.calculationMethod);
  assign("amortization_method", debt.amortizationMethod);
  assign("first_due_on", debt.firstDueOn);
  assign("installment_count", debt.installmentCount);
  assign("scheduled_payment", debt.scheduledPayment);
  assign("periodic_fee", debt.periodicFee);
  assign("periodic_insurance", debt.periodicInsurance);
  assign("variable_rate", debt.variableRate);
  assign("index_name", debt.indexName);
  assign("spread_rate", debt.spreadRate);
  assign("prepayment_strategy", debt.prepaymentStrategy);
  assign("rate_basis", debt.rateBasis);
  assign("rate_value", debt.rateValue);
  assign("effective_annual_rate", debt.effectiveAnnualRate);

  if (debt.fundingAccountId !== undefined) payload.funding_account_id = debt.fundingAccountId;
  else if (debt.clearFundingAccount) payload.funding_account_id = null;

  if (debt.clearRate) {
    payload.rate_value = null;
    payload.effective_annual_rate = null;
    payload.annual_interest_rate = null;
  }

  if (debt.schedule !== undefined) payload.schedule = debt.schedule.map(liabilityObligationToRpc);
  else if (debt.clearSchedule) payload.schedule = [];

  return payload;
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
  if (item.operation === "liability.upsert") {
    const payload = item.payload as LiabilityInput;
    await callUntypedRpc(client, "upsert_liability_v2", {
      p_operation_id: item.id,
      p_account: {
        id: payload.account.id,
        name: payload.account.name,
        color: payload.account.color,
        icon: payload.account.icon ?? "",
        currency_code: payload.account.currencyCode,
        entity_id: payload.account.entityId ?? "",
        opening_debt: payload.account.openingDebt,
        opening_balance_date: payload.account.openingBalanceDate,
        opening_exchange_rate: payload.account.openingExchangeRate ?? null,
      },
      p_liability: {
        account_id: payload.liability.accountId,
        kind: payload.liability.kind,
        status: payload.liability.status,
        creditor_name: payload.liability.creditorName ?? "",
        original_principal: payload.liability.originalPrincipal ?? null,
        originated_on: payload.liability.originatedOn ?? "",
        maturity_on: payload.liability.maturityOn ?? "",
        legacy_target_id: payload.liability.legacyTargetId ?? "",
      },
      p_expected_account_version: payload.account.version ?? null,
      p_expected_liability_version: payload.liability.version ?? null,
    });
    return;
  }
  if (item.operation === "liability.terms.upsert") {
    const payload = item.payload as LiabilityTermsInput;
    const rpcPayload = liabilityTermsToRpc(payload);
    await callUntypedRpc(client, "upsert_liability_terms_v2", {
      p_operation_id: item.id,
      p_term: rpcPayload.term,
      p_rates: rpcPayload.rates,
      p_expected_version: payload.version ?? null,
    });
    return;
  }
  if (item.operation === "liability.obligation.upsert") {
    const payload = item.payload as LiabilityObligationWriteInput;
    await callUntypedRpc(client, "upsert_liability_obligation_v2", {
      p_operation_id: item.id,
      p_obligation: liabilityObligationToRpc(payload.obligation),
      p_statement: payload.statement ? creditCardStatementToRpc(payload.statement) : null,
      p_adjustments: (payload.adjustments ?? []).map(liabilityAdjustmentToRpc),
      p_reconcile_difference: payload.reconcileDifference ?? false,
      p_expected_version: payload.expectedVersion ?? payload.obligation.version ?? null,
    });
    return;
  }
  if (item.operation === "liability.payment.record") {
    const payload = item.payload as LiabilityPaymentInput;
    const rpcPayload = liabilityPaymentToRpc(payload);
    await callUntypedRpc(client, "record_liability_payment_v2", {
      p_operation_id: item.id,
      p_payment: rpcPayload.payment,
      p_allocations: rpcPayload.allocations,
    });
    return;
  }
  if (item.operation === "liability.archive") {
    const payload = item.payload as LiabilityArchiveInput;
    await callUntypedRpc(client, "archive_liability_v2", {
      p_operation_id: item.id,
      p_account_id: payload.accountId,
      p_expected_account_version: payload.accountVersion,
      p_expected_liability_version: payload.liabilityVersion,
    });
    return;
  }
  if (item.operation === "liability.payment-rule.upsert") {
    const payload = item.payload as LiabilityPaymentRuleInput;
    await callUntypedRpc(client, "upsert_liability_payment_rule_v2", {
      p_operation_id: item.id,
      p_rule: {
        id: payload.id,
        account_id: payload.accountId,
        funding_account_id: payload.fundingAccountId,
        strategy: payload.strategy,
        fixed_amount: payload.fixedAmount ?? "",
        maximum_amount: payload.maximumAmount ?? "",
        days_before_due: payload.daysBeforeDue,
        recording_mode: payload.recordingMode,
        active: payload.active,
      },
      p_expected_version: payload.version ?? null,
    });
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
    const write = "obligation" in (item.payload as object)
      ? item.payload as LiabilityObligationWriteInput
      : creditCardStatementToLiabilityWrite(item.payload as CreditCardStatement);
    const expectedVersion = "obligation" in (item.payload as object)
      ? write.expectedVersion ?? null
      : write.obligation.version && write.obligation.version > 1
        ? write.obligation.version - 1
        : null;
    await callUntypedRpc(client, "upsert_liability_obligation_v2", {
      p_operation_id: item.id,
      p_obligation: liabilityObligationToRpc(write.obligation),
      p_statement: write.statement ? creditCardStatementToRpc(write.statement) : null,
      p_adjustments: (write.adjustments ?? []).map(liabilityAdjustmentToRpc),
      p_reconcile_difference: write.reconcileDifference ?? false,
      p_expected_version: expectedVersion,
    });
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
    const payload = item.payload as { target: FinancialTarget; debt?: FinancialTargetDebtInput };
    const debt = payload.target.kind === "debt" ? financialTargetDebtToRpc(payload.debt) : undefined;
    const target = payload.target.kind === "debt"
      ? { ...payload.target, accountId: payload.debt?.liabilityAccountId }
      : payload.target;
    const { error } = await client.rpc("upsert_financial_target_v2", {
      p_operation_id: item.id, p_target: financialTargetToRow(userId, target), p_debt: debt,
    });
    if (error) throw error;
    return;
  }
  if (item.operation === "financial-target.status") {
    const payload = item.payload as { id: string; status: FinancialTargetStatus };
    await callUntypedRpc(client, "set_financial_target_status_v2", {
      p_operation_id: item.id,
      p_target_id: payload.id,
      p_status: payload.status,
    });
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
