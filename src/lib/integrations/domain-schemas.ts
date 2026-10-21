/** Nested JSON contracts for tools that import OpenAPI. SQL remains authoritative;
 * optional new domain fields are allowed for backwards-compatible extensions. */
export function domainArgumentSchema(action: string, argument: string): Record<string, unknown> | undefined {
  const shape = (fields: string, required: string) => ({
    type: "object", required: required.split(" ").filter(Boolean),
    properties: Object.fromEntries(fields.split(" ").filter(Boolean).map((entry) => {
      const [name, kind = "string"] = entry.split(":");
      const schema = kind === "money" ? { type: "string", pattern: "^-?[0-9]+(?:\\.[0-9]+)?$", description: "Decimal exacto, sin separadores de miles." }
        : kind === "uuid" || kind === "date" ? { type: "string", format: kind }
        : { type: kind };
      return [name, schema];
    })),
  });
  const many = (value: Record<string, unknown>) => ({ type: "array", maxItems: 1000, items: value });
  const account = "id:uuid name account_type currency_code color icon entity_id:uuid initial_balance:money opening_debt:money opening_balance_date:date opening_exchange_rate:money expected_annual_return:money";
  const transaction = "id:uuid account_id:uuid category_id:uuid kind amount:money description merchant note icon occurred_on:date native_currency_code base_currency_code base_amount:money exchange_rate:money exchange_rate_date:date exchange_rate_source reference_exchange_rate:money reference_rate_source transfer_group_id:uuid financial_target_id:uuid financial_target_effect";
  const allocation = shape("group_key percent:money included:boolean sort_order:integer", "group_key percent included sort_order");
  switch (`${action}:${argument}`) {
    case "entity.save:entity": return shape("id:uuid name color icon sort_order:integer", "id name color icon sort_order");
    case "account.update:account": return shape(account, "id name account_type currency_code color");
    case "card.save:account": case "liability.save:account": return shape(account, "id name currency_code color opening_debt opening_balance_date");
    case "movements.save:transactions": return { ...many(shape(transaction, "id account_id kind amount description occurred_on")), maxItems: 100 };
    case "card.purchase:transaction": return shape(transaction, "id account_id category_id kind amount description occurred_on");
    case "distribution.set:allocations": case "main-category.archive:allocations": return many(allocation);
    case "category.order:positions": return many(shape("id:uuid sort_order:integer", "id sort_order"));
    case "budget.set:budgets": return many(shape("id:uuid category_id:uuid amount:money", "id category_id amount"));
    case "target.save:target": return shape("id:uuid mode kind status title description target_amount:money initial_progress:money starts_on:date target_date:date priority:integer color icon account_id:uuid category_id:uuid tracking_mode", "id mode kind status title target_amount starts_on color icon tracking_mode");
    case "target.save:debt": return shape("creditor annual_interest_rate:money minimum_payment:money due_day:integer liability_account_id:uuid", "");
    case "card.save:card": return shape("network last_four credit_limit:money cutoff_day:integer due_day:integer annual_fee:money purchase_rate_ea:money cash_advance_rate_ea:money", "network credit_limit cutoff_day due_day annual_fee");
    case "card.purchase:plan": return shape("id:uuid installment_count:integer financing_type annual_effective_rate:money first_due_on:date", "id installment_count financing_type first_due_on");
    case "card.purchase:installments": return many(shape("id:uuid installment_number:integer due_on:date principal:money estimated_interest:money estimated_fee:money", "id installment_number due_on principal estimated_interest estimated_fee"));
    case "liability.save:liability": return shape("account_id:uuid kind status creditor_name original_principal:money originated_on:date maturity_on:date", "account_id kind status");
    case "liability.terms:term": return shape("id:uuid account_id:uuid starts_on:date ends_on:date payment_frequency interval_count:integer calculation_method amortization_method statement_cutoff_day:integer due_day:integer first_due_on:date installment_count:integer scheduled_payment:money contractual_minimum:money periodic_fee:money periodic_insurance:money variable_rate:boolean index_name spread_rate:money prepayment_strategy source", "id account_id starts_on payment_frequency interval_count calculation_method amortization_method source");
    case "liability.terms:rates": return many(shape("id:uuid rate_kind rate_basis reported_value:money effective_annual_rate:money starts_on:date ends_on:date source", "id rate_kind rate_basis reported_value starts_on source"));
    case "liability.obligation:obligation": return shape("id:uuid account_id:uuid kind sequence_number:integer period_start:date period_end:date due_on:date principal_due:money interest_due:money fee_due:money minimum_due:money total_due:money status source", "id account_id kind due_on principal_due interest_due fee_due minimum_due total_due status source");
    case "liability.obligation:statement": return shape("id:uuid account_id:uuid period_start:date period_end:date cutoff_on:date due_on:date total_due:money minimum_due:money purchases:money advances:money interest:money fees:money payments:money refunds:money status", "id account_id period_start period_end cutoff_on due_on total_due minimum_due");
    case "liability.obligation:adjustments": return many(shape(`${transaction} role`, "id role kind amount"));
    case "liability.payment:payment": return shape("id:uuid account_id:uuid funding_account_id:uuid liability_amount:money funding_amount:money occurred_on:date description intent_id:uuid transfer_group_id:uuid funding_transaction_id:uuid liability_transaction_id:uuid funding_exchange_rate:money liability_exchange_rate:money funding_exchange_rate_source liability_exchange_rate_source", "account_id funding_account_id liability_amount funding_exchange_rate liability_exchange_rate");
    case "liability.payment:allocations": return many(shape("id:uuid obligation_id:uuid amount:money allocated_on:date", "obligation_id amount"));
    case "liability.payment-rule:rule": return shape("id:uuid account_id:uuid funding_account_id:uuid strategy fixed_amount:money maximum_amount:money days_before_due:integer recording_mode active:boolean", "id account_id funding_account_id strategy days_before_due recording_mode active");
    case "liability.payment-intent:intent": return shape("id:uuid account_id:uuid rule_id:uuid obligation_id:uuid scheduled_for:date planned_amount:money status", "id account_id scheduled_for planned_amount status");
    default: return undefined;
  }
}
