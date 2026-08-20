create index if not exists recurring_occurrences_account_owner_idx
  on public.recurring_occurrences (user_id, account_id);
create index if not exists recurring_occurrences_destination_owner_idx
  on public.recurring_occurrences (user_id, destination_account_id)
  where destination_account_id is not null;
create index if not exists recurring_occurrences_category_owner_idx
  on public.recurring_occurrences (user_id, category_id)
  where category_id is not null;
create index if not exists recurring_occurrences_transaction_owner_idx
  on public.recurring_occurrences (user_id, transaction_id)
  where transaction_id is not null;
