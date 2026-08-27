-- Preserve the tenant key when either side of the optional occurrence link is
-- deleted. PostgreSQL otherwise applies SET NULL to every column in the
-- composite foreign key, including the NOT NULL user_id column.
alter table public.transactions
  drop constraint if exists transactions_recurring_occurrence_owner_fkey,
  add constraint transactions_recurring_occurrence_owner_fkey
    foreign key (user_id, recurring_occurrence_id)
    references public.recurring_occurrences (user_id, id)
    on delete set null (recurring_occurrence_id);

alter table public.recurring_occurrences
  drop constraint if exists recurring_occurrences_transaction_owner_fkey,
  add constraint recurring_occurrences_transaction_owner_fkey
    foreign key (user_id, transaction_id)
    references public.transactions (user_id, id)
    on delete set null (transaction_id);
