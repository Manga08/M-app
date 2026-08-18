"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { useTheme } from "next-themes";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { demoFinanceState } from "@/lib/finance/demo-data";
import { currentMonthStart } from "@/lib/finance/calculations";
import type {
  Account,
  Budget,
  Category,
  FinanceProfile,
  FinanceState,
  GroupAllocation,
  ProfileInput,
  QueueItem,
  Transaction,
  TransactionInput,
} from "@/lib/finance/types";
import { queueOperation, readLocalState, readQueue, removeQueueItem, updateQueueItem, writeLocalState } from "@/lib/offline-db";
import { createClient } from "@/lib/supabase/client";

type FinanceContextValue = FinanceState & {
  hydrated: boolean;
  online: boolean;
  pendingCount: number;
  syncError: string | null;
  currentMonth: string;
  addTransaction: (input: TransactionInput) => Promise<void>;
  updateTransaction: (id: string, input: TransactionInput) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  addAccount: (account: Omit<Account, "id">) => Promise<void>;
  addCategory: (category: Omit<Category, "id">) => Promise<void>;
  updateBudget: (categoryId: string, amount: number) => Promise<void>;
  updateProfile: (profile: ProfileInput) => Promise<void>;
  updateGroupAllocations: (allocations: Array<Pick<GroupAllocation, "group" | "targetPercent">>) => Promise<void>;
  syncNow: () => Promise<void>;
};

const FinanceContext = createContext<FinanceContextValue | null>(null);

const emptyFinanceState: FinanceState = {
  profile: null,
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
  groupAllocations: [],
};

type ProfileRow = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  currency_code: string;
  timezone: string;
  week_starts_on: number;
  month_starts_on: number;
  theme_mode: FinanceProfile["themeMode"];
  color_theme: FinanceProfile["colorTheme"];
};
type AccountRow = { id: string; name: string; account_type: Account["type"]; initial_balance: number | string; color: string; archived: boolean };
type CategoryRow = { id: string; name: string; category_group: Category["group"]; transaction_kind: Category["kind"]; color: string; icon: string; is_default: boolean };
type BudgetRow = { id: string; category_id: string; month: string; amount: number | string };
type AllocationRow = { id: string; group_key: GroupAllocation["group"]; target_percent: number | string };
type TransactionRow = { id: string; kind: Transaction["kind"]; amount: number | string; account_id: string; category_id: string | null; transfer_group_id: string | null; description: string; merchant: string | null; note: string | null; occurred_on: string; created_at: string };
type TransactionPayload = { transactions: Transaction[]; input: TransactionInput };

function uid() {
  return crypto.randomUUID();
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "No fue posible sincronizar este cambio.";
}

function profileFromRow(row: ProfileRow): FinanceProfile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name?.trim() || row.email.split("@")[0] || "Usuario",
    avatarUrl: row.avatar_url ?? undefined,
    currencyCode: row.currency_code,
    timezone: row.timezone,
    weekStartsOn: row.week_starts_on,
    monthStartsOn: row.month_starts_on,
    themeMode: row.theme_mode,
    colorTheme: row.color_theme,
  };
}

async function loadRemoteState(client: SupabaseClient): Promise<FinanceState> {
  const [profileResult, accountResult, categoryResult, budgetResult, transactionResult, allocationResult] = await Promise.all([
    client.from("profiles").select("*").maybeSingle(),
    client.from("accounts").select("*").eq("archived", false).order("created_at"),
    client.from("categories").select("*").eq("archived", false).order("created_at"),
    client.from("budgets").select("*").order("month"),
    client.from("transactions").select("*").order("occurred_on", { ascending: false }).order("created_at", { ascending: false }),
    client.from("group_allocations").select("*").order("group_key"),
  ]);
  const error = profileResult.error || accountResult.error || categoryResult.error || budgetResult.error || transactionResult.error || allocationResult.error;
  if (error) throw error;
  if (!profileResult.data) throw new Error("El perfil todavía no está disponible.");

  return {
    profile: profileFromRow(profileResult.data as ProfileRow),
    accounts: ((accountResult.data ?? []) as AccountRow[]).map((row) => ({ id: row.id, name: row.name, type: row.account_type, initialBalance: Number(row.initial_balance), color: row.color, archived: row.archived })),
    categories: ((categoryResult.data ?? []) as CategoryRow[]).map((row) => ({ id: row.id, name: row.name, group: row.category_group, color: row.color, icon: row.icon, kind: row.transaction_kind, isDefault: row.is_default })),
    budgets: ((budgetResult.data ?? []) as BudgetRow[]).map((row) => ({ id: row.id, categoryId: row.category_id, month: row.month, amount: Number(row.amount) })),
    groupAllocations: ((allocationResult.data ?? []) as AllocationRow[]).map((row) => ({ id: row.id, group: row.group_key, targetPercent: Number(row.target_percent) })),
    transactions: ((transactionResult.data ?? []) as TransactionRow[]).map((row) => ({
      id: row.id,
      kind: row.kind,
      amount: Number(row.amount),
      accountId: row.account_id,
      categoryId: row.category_id ?? undefined,
      transferGroupId: row.transfer_group_id ?? undefined,
      description: row.description,
      merchant: row.merchant ?? undefined,
      note: row.note ?? undefined,
      occurredOn: row.occurred_on,
      createdAt: row.created_at,
      syncStatus: "synced",
    })),
  };
}

async function writeTransactionPayload(client: SupabaseClient, userId: string, payload: TransactionPayload) {
  if (payload.input.type === "transfer") {
    const outgoing = payload.transactions.find((transaction) => transaction.kind === "transfer_out");
    const incoming = payload.transactions.find((transaction) => transaction.kind === "transfer_in");
    if (!outgoing || !incoming || !outgoing.transferGroupId) throw new Error("La transferencia local está incompleta.");
    const { error } = await client.rpc("upsert_transfer", {
      p_transfer_group_id: outgoing.transferGroupId,
      p_source_transaction_id: outgoing.id,
      p_destination_transaction_id: incoming.id,
      p_source_account_id: outgoing.accountId,
      p_destination_account_id: incoming.accountId,
      p_amount: outgoing.amount,
      p_description: outgoing.description,
      p_occurred_on: outgoing.occurredOn,
      p_note: outgoing.note ?? null,
    });
    if (error) throw error;
    return;
  }

  const transaction = payload.transactions[0];
  const { error } = await client.from("transactions").upsert({
    id: transaction.id,
    user_id: userId,
    kind: transaction.kind,
    amount: transaction.amount,
    account_id: transaction.accountId,
    category_id: transaction.categoryId ?? null,
    description: transaction.description,
    merchant: transaction.merchant ?? null,
    note: transaction.note ?? null,
    occurred_on: transaction.occurredOn,
  }, { onConflict: "id" });
  if (error) throw error;
}

async function executeQueueItem(client: SupabaseClient, userId: string, item: QueueItem) {
  if (item.operation === "transaction.create" || item.operation === "transaction.update") {
    await writeTransactionPayload(client, userId, item.payload as TransactionPayload);
    return;
  }
  if (item.operation === "transaction.delete") {
    const payload = item.payload as { id: string; transferGroupId?: string };
    const query = client.from("transactions").delete();
    const { error } = payload.transferGroupId ? await query.eq("transfer_group_id", payload.transferGroupId) : await query.eq("id", payload.id);
    if (error) throw error;
    return;
  }
  if (item.operation === "account.create") {
    const payload = item.payload as Account;
    const { error } = await client.from("accounts").upsert({ id: payload.id, user_id: userId, name: payload.name, account_type: payload.type, initial_balance: payload.initialBalance, color: payload.color }, { onConflict: "id" });
    if (error) throw error;
    return;
  }
  if (item.operation === "category.create") {
    const payload = item.payload as Category;
    const { error } = await client.from("categories").upsert({ id: payload.id, user_id: userId, name: payload.name, category_group: payload.group, transaction_kind: payload.kind, color: payload.color, icon: payload.icon, is_default: false }, { onConflict: "id" });
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
    const { error } = await client.from("profiles").update({ display_name: payload.displayName, currency_code: payload.currencyCode, timezone: payload.timezone, week_starts_on: payload.weekStartsOn, month_starts_on: payload.monthStartsOn, theme_mode: payload.themeMode, color_theme: payload.colorTheme }).eq("id", userId);
    if (error) throw error;
    return;
  }
  if (item.operation === "allocation.set") {
    const payload = item.payload as Array<Pick<GroupAllocation, "group" | "targetPercent">>;
    const { error } = await client.rpc("set_group_allocations", { p_allocations: payload.map((allocation) => ({ group: allocation.group, percent: allocation.targetPercent })) });
    if (error) throw error;
  }
}

async function flushQueue(client: SupabaseClient, userId: string) {
  const items = await readQueue(userId);
  let lastError: string | null = null;
  for (const item of items) {
    try {
      await executeQueueItem(client, userId, item);
      await removeQueueItem(item.id);
    } catch (error) {
      lastError = errorMessage(error);
      await updateQueueItem({ ...item, attempts: (item.attempts ?? 0) + 1, lastError, userId });
    }
  }
  return { pending: (await readQueue(userId)).length, error: lastError };
}

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme();
  const [state, setState] = useState<FinanceState>(emptyFinanceState);
  const [hydrated, setHydrated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncing = useRef(false);
  const online = useSyncExternalStore(
    (callback) => {
      window.addEventListener("online", callback);
      window.addEventListener("offline", callback);
      return () => {
        window.removeEventListener("online", callback);
        window.removeEventListener("offline", callback);
      };
    },
    () => navigator.onLine,
    () => true,
  );

  const refreshPending = useCallback(async (id = userId) => {
    if (id) setPendingCount((await readQueue(id)).length);
  }, [userId]);

  const syncNow = useCallback(async () => {
    const client = createClient();
    if (!client || !userId || !navigator.onLine || syncing.current) return;
    syncing.current = true;
    try {
      const flushed = await flushQueue(client, userId);
      setPendingCount(flushed.pending);
      setSyncError(flushed.error);
      const remote = await loadRemoteState(client);
      setState(remote);
    } catch (error) {
      setSyncError(errorMessage(error));
    } finally {
      syncing.current = false;
    }
  }, [userId]);

  useEffect(() => {
    let active = true;
    async function hydrate() {
      const client = createClient();
      if (!client) {
        const local = await readLocalState("demo");
        if (active) {
          setUserId("demo");
          setState(local ?? demoFinanceState);
          setHydrated(true);
        }
        return;
      }

      const { data, error } = await client.auth.getUser();
      const user = data.user;
      if (!active) return;
      if (error || !user) {
        setHydrated(true);
        setSyncError(error ? errorMessage(error) : null);
        return;
      }

      setUserId(user.id);
      const local = await readLocalState(user.id);
      let remote: FinanceState | undefined;
      let initializationError: string | null = null;
      if (navigator.onLine) {
        const flushed = await flushQueue(client, user.id);
        if (!active) return;
        setPendingCount(flushed.pending);
        initializationError = flushed.error;
        try {
          remote = await loadRemoteState(client);
        } catch (loadError) {
          initializationError = errorMessage(loadError);
        }
      } else {
        setPendingCount((await readQueue(user.id)).length);
      }

      if (!active) return;
      setState(remote ?? local ?? profileFallbackState(user));
      setSyncError(initializationError);
      setHydrated(true);
    }
    hydrate();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (hydrated && userId) writeLocalState(userId, state);
  }, [hydrated, state, userId]);

  useEffect(() => {
    if (!state.profile) return;
    setTheme(state.profile.themeMode);
    document.documentElement.dataset.palette = state.profile.colorTheme;
  }, [setTheme, state.profile]);

  useEffect(() => {
    if (!online || !hydrated || !userId || userId === "demo") return;
    const timeout = window.setTimeout(() => { void syncNow(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [hydrated, online, syncNow, userId]);

  const persist = useCallback(async (operation: QueueItem["operation"], payload: unknown) => {
    const client = createClient();
    if (!client || !userId || userId === "demo") return true;
    const item: QueueItem = { id: uid(), userId, operation, payload, createdAt: new Date().toISOString() };
    if (navigator.onLine) {
      try {
        await executeQueueItem(client, userId, item);
        setSyncError(null);
        return true;
      } catch (error) {
        const message = errorMessage(error);
        setSyncError(message);
        await queueOperation({ ...item, attempts: 1, lastError: message });
        await refreshPending(userId);
        return false;
      }
    }
    await queueOperation(item);
    await refreshPending(userId);
    return false;
  }, [refreshPending, userId]);

  const addTransaction = useCallback(async (input: TransactionInput) => {
    const created = buildTransactions(input);
    setState((current) => ({ ...current, transactions: [...created, ...current.transactions] }));
    const synced = await persist("transaction.create", { transactions: created, input } satisfies TransactionPayload);
    if (synced) markTransactionsSynced(setState, created.map((transaction) => transaction.id));
  }, [persist]);

  const updateTransaction = useCallback(async (id: string, input: TransactionInput) => {
    const selected = state.transactions.find((transaction) => transaction.id === id);
    if (!selected) throw new Error("No encontramos el movimiento que quieres editar.");
    const existing = selected.transferGroupId ? state.transactions.filter((transaction) => transaction.transferGroupId === selected.transferGroupId) : [selected];
    if (selected.transferGroupId && input.type !== "transfer") throw new Error("Una transferencia debe seguir siendo una transferencia.");
    if (!selected.transferGroupId && input.type === "transfer") throw new Error("Crea una transferencia nueva para cambiar el tipo.");

    const updated = selected.transferGroupId ? buildUpdatedTransfer(existing, input) : [{
      ...selected,
      kind: input.type === "income" ? "income" as const : "expense" as const,
      amount: input.amount,
      accountId: input.accountId,
      categoryId: input.categoryId,
      description: input.description,
      merchant: input.merchant,
      note: input.note,
      occurredOn: input.occurredOn,
      syncStatus: createClient() ? "pending" as const : "synced" as const,
    }];
    const ids = new Set(existing.map((transaction) => transaction.id));
    setState((current) => ({ ...current, transactions: [...updated, ...current.transactions.filter((transaction) => !ids.has(transaction.id))] }));
    const synced = await persist("transaction.update", { transactions: updated, input } satisfies TransactionPayload);
    if (synced) markTransactionsSynced(setState, updated.map((transaction) => transaction.id));
  }, [persist, state.transactions]);

  const deleteTransaction = useCallback(async (id: string) => {
    const selected = state.transactions.find((transaction) => transaction.id === id);
    if (!selected) return;
    setState((current) => ({ ...current, transactions: current.transactions.filter((transaction) => transaction.id !== id && (!selected.transferGroupId || transaction.transferGroupId !== selected.transferGroupId)) }));
    await persist("transaction.delete", { id, transferGroupId: selected.transferGroupId });
  }, [persist, state.transactions]);

  const addAccount = useCallback(async (account: Omit<Account, "id">) => {
    const created = { ...account, id: uid() };
    setState((current) => ({ ...current, accounts: [...current.accounts, created] }));
    await persist("account.create", created);
  }, [persist]);

  const addCategory = useCallback(async (category: Omit<Category, "id">) => {
    const created = { ...category, id: uid() };
    setState((current) => ({ ...current, categories: [...current.categories, created] }));
    await persist("category.create", created);
  }, [persist]);

  const updateBudget = useCallback(async (categoryId: string, amount: number) => {
    const month = currentMonthStart();
    const budgetId = state.budgets.find((budget) => budget.categoryId === categoryId && budget.month === month)?.id ?? uid();
    setState((current) => {
      const existing = current.budgets.find((budget) => budget.categoryId === categoryId && budget.month === month);
      const next: Budget = { id: existing?.id ?? budgetId, categoryId, month, amount };
      return { ...current, budgets: existing ? current.budgets.map((budget) => budget.id === existing.id ? next : budget) : [...current.budgets, next] };
    });
    await persist("budget.upsert", { id: budgetId, categoryId, amount, month });
  }, [persist, state.budgets]);

  const updateProfile = useCallback(async (profile: ProfileInput) => {
    setState((current) => ({ ...current, profile: current.profile ? { ...current.profile, ...profile } : current.profile }));
    await persist("profile.update", profile);
  }, [persist]);

  const updateGroupAllocations = useCallback(async (allocations: Array<Pick<GroupAllocation, "group" | "targetPercent">>) => {
    setState((current) => ({
      ...current,
      groupAllocations: allocations.map((allocation) => ({ id: current.groupAllocations.find((item) => item.group === allocation.group)?.id ?? uid(), ...allocation })),
    }));
    await persist("allocation.set", allocations);
  }, [persist]);

  const value = useMemo(() => ({
    ...state,
    hydrated,
    online,
    pendingCount,
    syncError,
    currentMonth: currentMonthStart(),
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addAccount,
    addCategory,
    updateBudget,
    updateProfile,
    updateGroupAllocations,
    syncNow,
  }), [state, hydrated, online, pendingCount, syncError, addTransaction, updateTransaction, deleteTransaction, addAccount, addCategory, updateBudget, updateProfile, updateGroupAllocations, syncNow]);

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

function profileFallbackState(user: User): FinanceState {
  return {
    ...emptyFinanceState,
    profile: {
      id: user.id,
      email: user.email ?? "",
      displayName: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Usuario",
      avatarUrl: user.user_metadata?.avatar_url || user.user_metadata?.picture,
      currencyCode: "COP",
      timezone: "America/Bogota",
      weekStartsOn: 1,
      monthStartsOn: 1,
      themeMode: "system",
      colorTheme: "moneva",
    },
  };
}

function buildTransactions(input: TransactionInput): Transaction[] {
  const now = new Date().toISOString();
  const status: Transaction["syncStatus"] = createClient() ? "pending" : "synced";
  if (input.type === "transfer" && input.destinationAccountId) {
    const groupId = uid();
    return [
      { id: uid(), kind: "transfer_out", amount: input.amount, accountId: input.accountId, transferGroupId: groupId, description: input.description || "Transferencia", note: input.note, occurredOn: input.occurredOn, createdAt: now, syncStatus: status },
      { id: uid(), kind: "transfer_in", amount: input.amount, accountId: input.destinationAccountId, transferGroupId: groupId, description: input.description || "Transferencia", note: input.note, occurredOn: input.occurredOn, createdAt: now, syncStatus: status },
    ];
  }
  return [{
    id: uid(),
    kind: input.type === "income" ? "income" : "expense",
    amount: input.amount,
    accountId: input.accountId,
    categoryId: input.categoryId,
    description: input.description || (input.type === "income" ? "Ingreso" : "Gasto"),
    merchant: input.merchant,
    note: input.note,
    occurredOn: input.occurredOn,
    createdAt: now,
    syncStatus: status,
  }];
}

function buildUpdatedTransfer(existing: Transaction[], input: TransactionInput): Transaction[] {
  const outgoing = existing.find((transaction) => transaction.kind === "transfer_out");
  const incoming = existing.find((transaction) => transaction.kind === "transfer_in");
  if (!outgoing || !incoming || !input.destinationAccountId) throw new Error("La transferencia está incompleta.");
  const common = { amount: input.amount, description: input.description || "Transferencia", note: input.note, occurredOn: input.occurredOn, syncStatus: createClient() ? "pending" as const : "synced" as const };
  return [
    { ...outgoing, ...common, accountId: input.accountId },
    { ...incoming, ...common, accountId: input.destinationAccountId },
  ];
}

function markTransactionsSynced(setState: React.Dispatch<React.SetStateAction<FinanceState>>, ids: string[]) {
  const idSet = new Set(ids);
  setState((current) => ({ ...current, transactions: current.transactions.map((transaction) => idSet.has(transaction.id) ? { ...transaction, syncStatus: "synced" } : transaction) }));
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) throw new Error("useFinance debe usarse dentro de FinanceProvider");
  return context;
}
