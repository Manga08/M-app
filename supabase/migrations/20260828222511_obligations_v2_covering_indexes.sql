-- Cover every new composite foreign key used by obligation lifecycle writes.
-- These indexes keep deletes/updates predictable as each user's history grows.

create index financial_target_debt_liability_owner_idx
  on public.financial_target_debt_details (user_id, migrated_liability_account_id)
  where migrated_liability_account_id is not null;

create index liability_event_metadata_related_event_idx
  on public.liability_event_metadata (user_id, related_ledger_event_id)
  where related_ledger_event_id is not null;

create index liability_payment_allocations_account_idx
  on public.liability_payment_allocations (user_id, account_id);

create index liability_payment_allocations_event_idx
  on public.liability_payment_allocations (user_id, ledger_event_id);

create index liability_payment_intents_account_idx
  on public.liability_payment_intents (user_id, account_id);

create index liability_payment_intents_event_idx
  on public.liability_payment_intents (user_id, ledger_event_id)
  where ledger_event_id is not null;

create index liability_payment_intents_obligation_idx
  on public.liability_payment_intents (user_id, obligation_id)
  where obligation_id is not null;

create index liability_payment_rules_funding_account_idx
  on public.liability_payment_rules (user_id, funding_account_id);
