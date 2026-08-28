-- Covers the composite statement foreign key used when a reconciled extracto
-- claims an installment. The partial predicate keeps the index compact.
create index if not exists credit_card_installments_statement_idx
  on public.credit_card_installments (user_id, statement_id)
  where statement_id is not null;
