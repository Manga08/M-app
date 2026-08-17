"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { demoFinanceState } from "@/lib/finance/demo-data";
import type { Account, Budget, Category, FinanceState, QueueItem, Transaction, TransactionInput } from "@/lib/finance/types";
import { queueOperation, readLocalState, readQueue, removeQueueItem, writeLocalState } from "@/lib/offline-db";
import { createClient } from "@/lib/supabase/client";

type FinanceContextValue = FinanceState & {
  hydrated: boolean;
  online: boolean;
  pendingCount: number;
  addTransaction: (input: TransactionInput) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  addAccount: (account: Omit<Account, "id">) => Promise<void>;
  addCategory: (category: Omit<Category, "id">) => Promise<void>;
  updateBudget: (categoryId: string, amount: number) => Promise<void>;
};

const FinanceContext = createContext<FinanceContextValue | null>(null);

type AccountRow = { id: string; name: string; account_type: Account["type"]; initial_balance: number | string; color: string; archived: boolean };
type CategoryRow = { id: string; name: string; category_group: Category["group"]; transaction_kind: Category["kind"]; color: string; icon: string; is_default: boolean };
type BudgetRow = { id: string; category_id: string; month: string; amount: number | string };
type TransactionRow = { id: string; kind: Transaction["kind"]; amount: number | string; account_id: string; category_id: string | null; transfer_group_id: string | null; description: string; merchant: string | null; note: string | null; occurred_on: string; created_at: string };

function uid() {
  return crypto.randomUUID();
}

async function loadRemoteState(): Promise<FinanceState | undefined> {
  const supabase = createClient();
  if (!supabase || !navigator.onLine) return undefined;
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return undefined;

  await supabase.from("profiles").upsert({ id: user.id, email: user.email ?? "", display_name: user.user_metadata?.full_name ?? null }, { onConflict: "id" });
  const accountResult = await supabase.from("accounts").select("*").eq("archived", false).order("created_at");
  const categoryResult = await supabase.from("categories").select("*").eq("archived", false).order("created_at");
  let accountRows = accountResult.data as AccountRow[] | null;
  let categoryRows = categoryResult.data as CategoryRow[] | null;
  const accountError = accountResult.error;
  const categoryError = categoryResult.error;
  if (accountError || categoryError) return undefined;

  if (!accountRows?.length) {
    const seed = { id: uid(), user_id: user.id, name: "Efectivo", account_type: "cash", initial_balance: 0, color: "#34d399" };
    const { error } = await supabase.from("accounts").insert(seed);
    if (error) return undefined;
    accountRows = [{ ...seed, account_type: "cash", initial_balance: 0, archived: false }];
  }
  if (!categoryRows?.length) {
    const seeds = demoFinanceState.categories.map((category) => ({ id: uid(), user_id: user.id, name: category.name, category_group: category.group, transaction_kind: category.kind, color: category.color, icon: category.icon, is_default: true }));
    const { data, error } = await supabase.from("categories").insert(seeds).select("*");
    if (error) return undefined;
    categoryRows = data as CategoryRow[];
  }
  const [{ data: budgetRows, error: budgetError }, { data: transactionRows, error: transactionError }] = await Promise.all([
    supabase.from("budgets").select("*").order("month"),
    supabase.from("transactions").select("*").order("occurred_on", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  if (budgetError || transactionError) return undefined;
  return {
    accounts: (accountRows ?? []).map((row: AccountRow) => ({ id: row.id, name: row.name, type: row.account_type, initialBalance: Number(row.initial_balance), color: row.color, archived: row.archived })),
    categories: (categoryRows ?? []).map((row: CategoryRow) => ({ id: row.id, name: row.name, group: row.category_group, color: row.color, icon: row.icon, kind: row.transaction_kind, isDefault: row.is_default })),
    budgets: ((budgetRows ?? []) as BudgetRow[]).map((row: BudgetRow) => ({ id: row.id, categoryId: row.category_id, month: row.month, amount: Number(row.amount) })),
    transactions: ((transactionRows ?? []) as TransactionRow[]).map((row: TransactionRow) => ({ id: row.id, kind: row.kind, amount: Number(row.amount), accountId: row.account_id, categoryId: row.category_id ?? undefined, transferGroupId: row.transfer_group_id ?? undefined, description: row.description, merchant: row.merchant ?? undefined, note: row.note ?? undefined, occurredOn: row.occurred_on, createdAt: row.created_at, syncStatus: "synced" })),
  };
}

async function enqueue(operation: QueueItem["operation"], payload: unknown) {
  await queueOperation({ id: uid(), operation, payload, createdAt: new Date().toISOString() });
}

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FinanceState>(demoFinanceState);
  const [hydrated, setHydrated] = useState(false);
  const online = useSyncExternalStore(
    (callback) => { window.addEventListener("online", callback); window.addEventListener("offline", callback); return () => { window.removeEventListener("online", callback); window.removeEventListener("offline", callback); }; },
    () => navigator.onLine,
    () => true,
  );
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPending = useCallback(async () => setPendingCount((await readQueue()).length), []);

  useEffect(() => {
    let active = true;
    Promise.all([readLocalState(), loadRemoteState(), readQueue()]).then(([stored, remote, pending]) => {
      if (!active) return;
      setState(remote ?? stored ?? demoFinanceState);
      setPendingCount(pending.length);
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (hydrated) writeLocalState(state);
  }, [hydrated, state]);

  const syncInsert = useCallback(async (transactions: Transaction[], input?: TransactionInput) => {
    const supabase = createClient();
    if (!supabase || !navigator.onLine) return false;
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return false;
    if (input?.type === "transfer" && input.destinationAccountId) {
      const { error } = await supabase.rpc("create_transfer", {
        p_source_account_id: input.accountId,
        p_destination_account_id: input.destinationAccountId,
        p_amount: input.amount,
        p_description: input.description,
        p_occurred_on: input.occurredOn,
        p_note: input.note || null,
      });
      return !error;
    }
    const transaction = transactions[0];
    const { error } = await supabase.from("transactions").insert({
      id: transaction.id, user_id: user.id, kind: transaction.kind,
      amount: transaction.amount, account_id: transaction.accountId,
      category_id: transaction.categoryId ?? null, description: transaction.description,
      merchant: transaction.merchant ?? null, note: transaction.note ?? null,
      occurred_on: transaction.occurredOn,
    });
    return !error;
  }, []);

  const addTransaction = useCallback(async (input: TransactionInput) => {
    const now = new Date().toISOString();
    const groupId = input.type === "transfer" ? uid() : undefined;
    const remoteEnabled = Boolean(createClient());
    const initialSyncStatus: Transaction["syncStatus"] = remoteEnabled ? "pending" : "synced";
    const created: Transaction[] = input.type === "transfer" && input.destinationAccountId ? [
      { id: uid(), kind: "transfer_out", amount: input.amount, accountId: input.accountId, transferGroupId: groupId, description: input.description || "Transferencia", note: input.note, occurredOn: input.occurredOn, createdAt: now, syncStatus: initialSyncStatus },
      { id: uid(), kind: "transfer_in", amount: input.amount, accountId: input.destinationAccountId, transferGroupId: groupId, description: input.description || "Transferencia", note: input.note, occurredOn: input.occurredOn, createdAt: now, syncStatus: initialSyncStatus },
    ] : [{
      id: uid(), kind: input.type === "income" ? "income" : "expense", amount: input.amount, accountId: input.accountId,
      categoryId: input.categoryId, description: input.description || (input.type === "income" ? "Ingreso" : "Gasto"),
      merchant: input.merchant, note: input.note, occurredOn: input.occurredOn, createdAt: now, syncStatus: initialSyncStatus,
    }];
    setState((current) => ({ ...current, transactions: [...created, ...current.transactions] }));
    if (!remoteEnabled) return;
    const synced = await syncInsert(created, input);
    if (synced) {
      setState((current) => ({ ...current, transactions: current.transactions.map((item) => created.some((transaction) => transaction.id === item.id) ? { ...item, syncStatus: "synced" } : item) }));
    } else {
      await enqueue("transaction.create", { input, localIds: created.map((item) => item.id) });
      await refreshPending();
    }
  }, [refreshPending, syncInsert]);

  const deleteTransaction = useCallback(async (id: string) => {
    const selected = state.transactions.find((item) => item.id === id);
    setState((current) => ({ ...current, transactions: current.transactions.filter((transaction) => transaction.id !== id && (!selected?.transferGroupId || transaction.transferGroupId !== selected.transferGroupId)) }));
    const supabase = createClient();
    if (supabase && navigator.onLine) {
      const query = supabase.from("transactions").delete();
      const { error } = selected?.transferGroupId ? await query.eq("transfer_group_id", selected.transferGroupId) : await query.eq("id", id);
      if (error) await enqueue("transaction.delete", { id, transferGroupId: selected?.transferGroupId });
    } else if (supabase) await enqueue("transaction.delete", { id, transferGroupId: selected?.transferGroupId });
    await refreshPending();
  }, [refreshPending, state.transactions]);

  const addAccount = useCallback(async (account: Omit<Account, "id">) => {
    const created = { ...account, id: uid() };
    setState((current) => ({ ...current, accounts: [...current.accounts, created] }));
    const supabase = createClient(); const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    const result = supabase && data.user && navigator.onLine ? await supabase.from("accounts").insert({ id: created.id, user_id: data.user.id, name: created.name, account_type: created.type, initial_balance: created.initialBalance, color: created.color }) : null;
    if (supabase && (!result || result.error)) await enqueue("account.create", created);
    await refreshPending();
  }, [refreshPending]);

  const addCategory = useCallback(async (category: Omit<Category, "id">) => {
    const created = { ...category, id: uid() };
    setState((current) => ({ ...current, categories: [...current.categories, created] }));
    const supabase = createClient(); const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    const result = supabase && data.user && navigator.onLine ? await supabase.from("categories").insert({ id: created.id, user_id: data.user.id, name: created.name, category_group: created.group, transaction_kind: created.kind, color: created.color, icon: created.icon, is_default: false }) : null;
    if (supabase && (!result || result.error)) await enqueue("category.create", created);
    await refreshPending();
  }, [refreshPending]);

  const updateBudget = useCallback(async (categoryId: string, amount: number) => {
    const budgetId = state.budgets.find((budget) => budget.categoryId === categoryId && budget.month === "2026-08-01")?.id ?? uid();
    setState((current) => {
      const existing = current.budgets.find((budget) => budget.categoryId === categoryId && budget.month === "2026-08-01");
      const next: Budget = { id: existing?.id ?? budgetId, categoryId, month: "2026-08-01", amount };
      return { ...current, budgets: existing ? current.budgets.map((budget) => budget.id === existing.id ? next : budget) : [...current.budgets, next] };
    });
    const supabase = createClient(); const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    const payload = { id: budgetId, user_id: data.user?.id, category_id: categoryId, amount, month: "2026-08-01" };
    const result = supabase && data.user && navigator.onLine ? await supabase.from("budgets").upsert(payload, { onConflict: "user_id,category_id,month" }) : null;
    if (supabase && (!result || result.error)) await enqueue("budget.upsert", payload);
    await refreshPending();
  }, [refreshPending, state.budgets]);

  useEffect(() => {
    if (!online) return;
    const supabase = createClient();
    if (!supabase) return;
    readQueue().then(async (items) => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      for (const item of items) {
        let synced = false;
        if (item.operation === "transaction.create") {
          const payload = item.payload as { input: TransactionInput; localIds: string[] };
          const local = state.transactions.filter((transaction) => payload.localIds.includes(transaction.id));
          synced = Boolean(local.length && await syncInsert(local, payload.input));
          if (synced) setState((current) => ({ ...current, transactions: current.transactions.map((transaction) => payload.localIds.includes(transaction.id) ? { ...transaction, syncStatus: "synced" } : transaction) }));
        }
        if (item.operation === "transaction.delete") {
          const payload = item.payload as { id: string; transferGroupId?: string };
          const query = supabase.from("transactions").delete();
          const result = payload.transferGroupId ? await query.eq("transfer_group_id", payload.transferGroupId) : await query.eq("id", payload.id);
          synced = !result.error;
        }
        if (item.operation === "account.create") {
          const payload = item.payload as Account;
          const { error } = await supabase.from("accounts").insert({ id: payload.id, user_id: data.user.id, name: payload.name, account_type: payload.type, initial_balance: payload.initialBalance, color: payload.color });
          synced = !error;
        }
        if (item.operation === "category.create") {
          const payload = item.payload as Category;
          const { error } = await supabase.from("categories").insert({ id: payload.id, user_id: data.user.id, name: payload.name, category_group: payload.group, transaction_kind: payload.kind, color: payload.color, icon: payload.icon, is_default: false });
          synced = !error;
        }
        if (item.operation === "budget.upsert") {
          const payload = item.payload as { id: string; category_id: string; amount: number; month: string };
          const { error } = await supabase.from("budgets").upsert({ ...payload, user_id: data.user.id }, { onConflict: "user_id,category_id,month" });
          synced = !error;
        }
        if (synced) await removeQueueItem(item.id);
      }
      refreshPending();
    });
  }, [online, refreshPending, state.transactions, syncInsert]);

  const value = useMemo(() => ({ ...state, hydrated, online, pendingCount, addTransaction, deleteTransaction, addAccount, addCategory, updateBudget }), [state, hydrated, online, pendingCount, addTransaction, deleteTransaction, addAccount, addCategory, updateBudget]);
  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) throw new Error("useFinance debe usarse dentro de FinanceProvider");
  return context;
}
