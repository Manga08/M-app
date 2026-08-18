create index transactions_user_account_idx on public.transactions (user_id, account_id);
create index transactions_user_category_idx on public.transactions (user_id, category_id) where category_id is not null;
create index recurring_rules_user_account_idx on public.recurring_rules (user_id, account_id);
create index recurring_rules_user_category_idx on public.recurring_rules (user_id, category_id) where category_id is not null;
