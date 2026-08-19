"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useTheme } from "next-themes";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { demoFinanceState } from "@/lib/finance/demo-data";
import { currentMonthStart } from "@/lib/finance/calculations";
import type {
  Account,
  Budget,
  Category,
  CategoryInput,
  FinanceReport,
  FinanceReportGroup,
  FinanceReportMonth,
  FinanceGroupInput,
  FinanceProfile,
  FinanceSnapshot,
  FinanceState,
  GroupAllocation,
  IncomeTypeInput,
  ProfileInput,
  QueueItem,
  Transaction,
  TransactionCursor,
  TransactionInput,
  TransactionListFilter,
  TransactionPage,
} from "@/lib/finance/types";
import { archiveIncomeTypeInCategories, upsertIncomeTypeInCategories } from "@/lib/finance/income-types";
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
  upsertCategory: (category: CategoryInput) => Promise<void>;
  archiveCategory: (id: string) => Promise<void>;
  upsertIncomeType: (incomeType: IncomeTypeInput) => Promise<void>;
  archiveIncomeType: (id: string) => Promise<void>;
  upsertFinanceGroup: (group: FinanceGroupInput) => Promise<void>;
  archiveFinanceGroup: (groupKey: string, destinationGroupKey?: string, archiveCategories?: boolean) => Promise<void>;
  updateBudget: (categoryId: string, amount: number) => Promise<void>;
  updateProfile: (profile: ProfileInput) => Promise<void>;
  updateGroupAllocations: (allocations: Array<Pick<GroupAllocation, "group" | "targetPercent" | "includedInPlan" | "sortOrder">>) => Promise<void>;
  listTransactions: (options: { limit?: number; cursor?: TransactionCursor | null; filter?: TransactionListFilter; query?: string }) => Promise<TransactionPage>;
  exportTransactions: (options?: { filter?: TransactionListFilter; query?: string }) => Promise<Transaction[]>;
  getFinanceReport: (endMonth?: string, months?: number) => Promise<FinanceReport>;
  syncNow: () => Promise<void>;
};

export type FinanceIdentity = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
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
type AccountRow = { id: string; name: string; account_type: Account["type"]; initial_balance: number | string; color: string; icon: string; archived: boolean };
type CategoryRow = { id: string; name: string; category_group: Category["group"]; transaction_kind: Category["kind"]; color: string; icon: string; is_default: boolean; archived: boolean };
type BudgetRow = { id: string; category_id: string; month: string; amount: number | string };
type AllocationRow = { id: string; group_key: GroupAllocation["group"]; name: string; color: string; icon: string; target_percent: number | string; included_in_plan: boolean; sort_order: number; archived: boolean; is_default: boolean };
type TransactionRow = { id: string; kind: Transaction["kind"]; amount: number | string; account_id: string; category_id: string | null; transfer_group_id: string | null; description: string; merchant: string | null; note: string | null; icon: string | null; occurred_on: string; created_at: string };
type SnapshotRow = { month: string; income: number | string; expense: number | string; accountBalances: Record<string, number | string>; categorySpending: Record<string, number | string> };
type TransactionPageRow = TransactionRow & { transfer_pair?: TransactionRow | null };
type TransactionPageRowResult = { items?: TransactionPageRow[]; hasMore?: boolean; nextCursor?: TransactionCursor | null };
type ReportRow = {
  startMonth: string;
  endMonth: string;
  months: Array<{ month: string; income: number | string; expense: number | string; balance: number | string }>;
  groups: Array<{ group: string; name: string; color: string; expense: number | string; targetPercent: number | string; includedInPlan: boolean; archived: boolean }>;
};
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

function transactionFromRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    kind: row.kind,
    amount: Number(row.amount),
    accountId: row.account_id,
    categoryId: row.category_id ?? undefined,
    transferGroupId: row.transfer_group_id ?? undefined,
    description: row.description,
    merchant: row.merchant ?? undefined,
    note: row.note ?? undefined,
    icon: row.icon ?? undefined,
    occurredOn: row.occurred_on,
    createdAt: row.created_at,
    syncStatus: "synced",
  };
}

function snapshotFromRow(row: SnapshotRow): FinanceSnapshot {
  return {
    month: row.month,
    income: Number(row.income),
    expense: Number(row.expense),
    accountBalances: Object.fromEntries(Object.entries(row.accountBalances ?? {}).map(([id, value]) => [id, Number(value)])),
    categorySpending: Object.fromEntries(Object.entries(row.categorySpending ?? {}).map(([id, value]) => [id, Number(value)])),
  };
}

async function loadRemoteState(client: SupabaseClient): Promise<FinanceState> {
  const month = currentMonthStart();
  const [profileResult, accountResult, categoryResult, budgetResult, transactionResult, allocationResult, snapshotResult] = await Promise.all([
    client.from("profiles").select("id,email,display_name,avatar_url,currency_code,timezone,week_starts_on,month_starts_on,theme_mode,color_theme").maybeSingle(),
    client.from("accounts").select("id,name,account_type,initial_balance,color,icon,archived").eq("archived", false).order("created_at"),
    client.from("categories").select("id,name,category_group,transaction_kind,color,icon,is_default,archived").order("archived").order("created_at"),
    client.from("budgets").select("id,category_id,month,amount").eq("month", month).order("month"),
    client.rpc("get_transactions_page", { p_limit: 50, p_cursor_occurred_on: null, p_cursor_created_at: null, p_cursor_id: null, p_kind: "all", p_query: "" }),
    client.from("group_allocations").select("id,group_key,name,color,icon,target_percent,included_in_plan,sort_order,archived,is_default").order("archived").order("sort_order"),
    client.rpc("get_finance_snapshot", { p_month: month }),
  ]);
  const error = profileResult.error || accountResult.error || categoryResult.error || budgetResult.error || transactionResult.error || allocationResult.error || snapshotResult.error;
  if (error) throw error;
  if (!profileResult.data) throw new Error("El perfil todavía no está disponible.");

  const transactionPayload = (transactionResult.data ?? {}) as TransactionPageRowResult;
  const transactionRows = transactionPayload.items ?? [];
  const relatedRows = transactionRows.flatMap((row) => row.transfer_pair ? [row.transfer_pair] : []);

  return {
    profile: profileFromRow(profileResult.data as ProfileRow),
    accounts: ((accountResult.data ?? []) as AccountRow[]).map((row) => ({ id: row.id, name: row.name, type: row.account_type, initialBalance: Number(row.initial_balance), color: row.color, icon: row.icon, archived: row.archived })),
    categories: ((categoryResult.data ?? []) as CategoryRow[]).map((row) => ({ id: row.id, name: row.name, group: row.category_group, color: row.color, icon: row.icon, kind: row.transaction_kind, isDefault: row.is_default, archived: row.archived })),
    budgets: ((budgetResult.data ?? []) as BudgetRow[]).map((row) => ({ id: row.id, categoryId: row.category_id, month: row.month, amount: Number(row.amount) })),
    groupAllocations: ((allocationResult.data ?? []) as AllocationRow[]).map((row) => ({ id: row.id, group: row.group_key, name: row.name, color: row.color, icon: row.icon, targetPercent: Number(row.target_percent), includedInPlan: row.included_in_plan, sortOrder: row.sort_order, archived: row.archived, isDefault: row.is_default })),
    transactions: [...transactionRows, ...relatedRows].map(transactionFromRow),
    snapshot: snapshotFromRow(snapshotResult.data as SnapshotRow),
  };
}

function adjustedSnapshot(snapshot: FinanceSnapshot | undefined, transactions: Transaction[], direction: 1 | -1) {
  if (!snapshot) return snapshot;
  const next: FinanceSnapshot = {
    ...snapshot,
    accountBalances: { ...snapshot.accountBalances },
    categorySpending: { ...snapshot.categorySpending },
  };
  for (const transaction of transactions) {
    const accountDirection = transaction.kind === "income" || transaction.kind === "transfer_in" ? 1 : -1;
    next.accountBalances[transaction.accountId] = (next.accountBalances[transaction.accountId] ?? 0) + direction * accountDirection * transaction.amount;
    if (transaction.occurredOn.slice(0, 7) !== snapshot.month.slice(0, 7)) continue;
    if (transaction.kind === "income") next.income += direction * transaction.amount;
    if (transaction.kind === "expense") {
      next.expense += direction * transaction.amount;
      if (transaction.categoryId) next.categorySpending[transaction.categoryId] = Math.max(0, (next.categorySpending[transaction.categoryId] ?? 0) + direction * transaction.amount);
    }
  }
  return next;
}

function mergeTransactions(current: Transaction[], incoming: Transaction[]) {
  const byId = new Map(current.map((transaction) => [transaction.id, transaction]));
  for (const transaction of incoming) {
    const existing = byId.get(transaction.id);
    if (!existing || existing.syncStatus !== "pending") byId.set(transaction.id, transaction);
  }
  return [...byId.values()].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

function transactionMatches(transaction: Transaction, categories: Category[], filter: TransactionListFilter, query: string) {
  if (transaction.kind === "transfer_in") return false;
  if (filter === "expense" && transaction.kind !== "expense") return false;
  if (filter === "income" && transaction.kind !== "income") return false;
  if (filter === "transfer" && transaction.kind !== "transfer_out") return false;
  const clean = query.trim().toLocaleLowerCase("es");
  if (!clean) return true;
  const category = categories.find((item) => item.id === transaction.categoryId)?.name ?? "";
  return [transaction.description, transaction.merchant, transaction.note, category]
    .filter(Boolean)
    .some((value) => value!.toLocaleLowerCase("es").includes(clean));
}

function isAfterCursor(transaction: Transaction, cursor?: TransactionCursor | null) {
  if (!cursor) return true;
  const transactionKey = `${transaction.occurredOn}|${transaction.createdAt}|${transaction.id}`;
  const cursorKey = `${cursor.occurredOn}|${cursor.createdAt}|${cursor.id}`;
  return transactionKey < cursorKey;
}

function localTransactionPage(state: FinanceState, options: { limit: number; cursor?: TransactionCursor | null; filter: TransactionListFilter; query: string }): TransactionPage {
  const candidates = state.transactions
    .filter((transaction) => transactionMatches(transaction, state.categories, options.filter, options.query))
    .filter((transaction) => isAfterCursor(transaction, options.cursor))
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const items = candidates.slice(0, options.limit);
  const transferGroups = new Set(items.map((item) => item.transferGroupId).filter(Boolean));
  const related = state.transactions.filter((transaction) => transaction.kind === "transfer_in" && transaction.transferGroupId && transferGroups.has(transaction.transferGroupId));
  const last = items.at(-1);
  return {
    items,
    related,
    hasMore: candidates.length > options.limit,
    nextCursor: last ? { occurredOn: last.occurredOn, createdAt: last.createdAt, id: last.id } : null,
    source: "local",
  };
}

function fallbackReport(state: FinanceState, endMonth: string, monthCount: number): FinanceReport {
  const [endYear, endMonthNumber] = endMonth.split("-").map(Number);
  const monthKeys = Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(Date.UTC(endYear, endMonthNumber - monthCount + index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
  });
  const months: FinanceReportMonth[] = monthKeys.map((month) => {
    const totals = state.transactions.filter((transaction) => transaction.occurredOn.slice(0, 7) === month.slice(0, 7)).reduce((sum, transaction) => {
      if (transaction.kind === "income") sum.income += transaction.amount;
      if (transaction.kind === "expense") sum.expense += transaction.amount;
      return sum;
    }, { income: 0, expense: 0 });
    if (state.snapshot?.month === month) {
      totals.income = state.snapshot.income;
      totals.expense = state.snapshot.expense;
    }
    return { month, ...totals, balance: totals.income - totals.expense };
  });
  const firstMonth = monthKeys[0];
  const nextMonthDate = new Date(Date.UTC(endYear, endMonthNumber, 1));
  const nextMonth = `${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const groups: FinanceReportGroup[] = state.groupAllocations.filter((group) => !group.archived).map((group) => {
    const ids = new Set(state.categories.filter((category) => category.group === group.group).map((category) => category.id));
    const expense = state.transactions.filter((transaction) => transaction.kind === "expense" && transaction.categoryId && ids.has(transaction.categoryId) && transaction.occurredOn >= firstMonth && transaction.occurredOn < nextMonth).reduce((sum, transaction) => sum + transaction.amount, 0);
    return { group: group.group, name: group.name, color: group.color, expense, targetPercent: group.targetPercent, includedInPlan: group.includedInPlan, archived: Boolean(group.archived) };
  });
  return { startMonth: firstMonth, endMonth, months, groups, source: "local" };
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
    icon: transaction.icon ?? null,
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
    const { error } = await client.from("accounts").upsert({ id: payload.id, user_id: userId, name: payload.name, account_type: payload.type, initial_balance: payload.initialBalance, color: payload.color, icon: payload.icon }, { onConflict: "id" });
    if (error) throw error;
    return;
  }
  if (item.operation === "category.create") {
    const payload = item.payload as Category;
    const { error } = await client.rpc("upsert_finance_category", { p_id: payload.id, p_name: payload.name, p_group_key: payload.group, p_color: payload.color, p_icon: payload.icon });
    if (error) throw error;
    return;
  }
  if (item.operation === "category.upsert") {
    const payload = item.payload as CategoryInput;
    const { error } = await client.rpc("upsert_finance_category", { p_id: payload.id, p_name: payload.name, p_group_key: payload.group, p_color: payload.color, p_icon: payload.icon });
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
    const { error } = await client.rpc("upsert_income_type", { p_id: payload.id, p_name: payload.name, p_color: payload.color, p_icon: payload.icon });
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
    const { error } = await client.rpc("upsert_finance_group", { p_id: payload.id, p_group_key: payload.group, p_name: payload.name, p_color: payload.color, p_icon: payload.icon, p_sort_order: payload.sortOrder });
    if (error) throw error;
    return;
  }
  if (item.operation === "finance-group.archive") {
    const payload = item.payload as { groupKey: string; destinationGroupKey?: string; archiveCategories?: boolean };
    const { error } = await client.rpc("archive_finance_group", { p_group_key: payload.groupKey, p_destination_group_key: payload.destinationGroupKey ?? null, p_archive_categories: payload.archiveCategories ?? false });
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
    const payload = item.payload as Array<Pick<GroupAllocation, "group" | "targetPercent" | "includedInPlan" | "sortOrder">>;
    const { error } = await client.rpc("set_group_allocations", { p_allocations: payload.map((allocation) => ({ group_key: allocation.group, percent: allocation.targetPercent, included: allocation.includedInPlan, sort_order: allocation.sortOrder })) });
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

export function FinanceProvider({ children, initialIdentity }: { children: React.ReactNode; initialIdentity?: FinanceIdentity }) {
  const { setTheme } = useTheme();
  const [state, setState] = useState<FinanceState>(emptyFinanceState);
  const [hydrated, setHydrated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncing = useRef(false);
  const stateRef = useRef(state);
  const wasOnline = useRef(true);
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

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
          const nextState = local ?? demoFinanceState;
          setUserId("demo");
          stateRef.current = nextState;
          setState(nextState);
          setHydrated(true);
        }
        return;
      }

      let identity = initialIdentity;
      if (!identity) {
        const { data, error } = await client.auth.getUser();
        const user = data.user;
        if (!active) return;
        if (error || !user) {
          setHydrated(true);
          setSyncError(error ? errorMessage(error) : null);
          return;
        }
        identity = identityFromUser(user);
      }

      setUserId(identity.id);
      const local = await readLocalState(identity.id);
      if (!active) return;
      const initialState = local ?? profileFallbackState(identity);
      stateRef.current = initialState;
      setState(initialState);
      setHydrated(true);

      let remote: FinanceState | undefined;
      let initializationError: string | null = null;
      if (navigator.onLine) {
        const flushed = await flushQueue(client, identity.id);
        if (!active) return;
        setPendingCount(flushed.pending);
        initializationError = flushed.error;
        try {
          remote = await loadRemoteState(client);
        } catch (loadError) {
          initializationError = errorMessage(loadError);
        }
      } else {
        setPendingCount((await readQueue(identity.id)).length);
      }

      if (!active) return;
      if (remote) {
        stateRef.current = remote;
        setState(remote);
      }
      setSyncError(initializationError);
    }
    hydrate();
    return () => { active = false; };
  }, [initialIdentity]);

  useEffect(() => {
    if (hydrated && userId) writeLocalState(userId, state);
  }, [hydrated, state, userId]);

  useEffect(() => {
    if (!state.profile) return;
    setTheme(state.profile.themeMode);
    document.documentElement.dataset.palette = state.profile.colorTheme;
  }, [setTheme, state.profile]);

  useEffect(() => {
    const reconnected = online && !wasOnline.current;
    wasOnline.current = online;
    if (!reconnected || !hydrated || !userId || userId === "demo") return;
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
    setState((current) => ({ ...current, transactions: mergeTransactions(current.transactions, created), snapshot: adjustedSnapshot(current.snapshot, created, 1) }));
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
      icon: input.icon,
      occurredOn: input.occurredOn,
      syncStatus: createClient() ? "pending" as const : "synced" as const,
    }];
    const ids = new Set(existing.map((transaction) => transaction.id));
    setState((current) => ({
      ...current,
      transactions: mergeTransactions(current.transactions.filter((transaction) => !ids.has(transaction.id)), updated),
      snapshot: adjustedSnapshot(adjustedSnapshot(current.snapshot, existing, -1), updated, 1),
    }));
    const synced = await persist("transaction.update", { transactions: updated, input } satisfies TransactionPayload);
    if (synced) markTransactionsSynced(setState, updated.map((transaction) => transaction.id));
  }, [persist, state.transactions]);

  const deleteTransaction = useCallback(async (id: string) => {
    const selected = state.transactions.find((transaction) => transaction.id === id);
    if (!selected) return;
    const removed = selected.transferGroupId ? state.transactions.filter((transaction) => transaction.transferGroupId === selected.transferGroupId) : [selected];
    setState((current) => ({
      ...current,
      transactions: current.transactions.filter((transaction) => transaction.id !== id && (!selected.transferGroupId || transaction.transferGroupId !== selected.transferGroupId)),
      snapshot: adjustedSnapshot(current.snapshot, removed, -1),
    }));
    await persist("transaction.delete", { id, transferGroupId: selected.transferGroupId });
  }, [persist, state.transactions]);

  const addAccount = useCallback(async (account: Omit<Account, "id">) => {
    const created = { ...account, id: uid() };
    setState((current) => ({
      ...current,
      accounts: [...current.accounts, created],
      snapshot: current.snapshot ? { ...current.snapshot, accountBalances: { ...current.snapshot.accountBalances, [created.id]: created.initialBalance } } : current.snapshot,
    }));
    await persist("account.create", created);
  }, [persist]);

  const addCategory = useCallback(async (category: Omit<Category, "id">) => {
    const created = { ...category, id: uid() };
    setState((current) => ({ ...current, categories: [...current.categories, created] }));
    await persist("category.create", created);
  }, [persist]);

  const upsertCategory = useCallback(async (category: CategoryInput) => {
    setState((current) => {
      const existing = current.categories.some((item) => item.id === category.id);
      const next: Category = { ...category, kind: "expense", isDefault: existing ? current.categories.find((item) => item.id === category.id)?.isDefault : false, archived: false };
      return { ...current, categories: existing ? current.categories.map((item) => item.id === category.id ? next : item) : [...current.categories, next] };
    });
    await persist("category.upsert", category);
  }, [persist]);

  const archiveCategory = useCallback(async (id: string) => {
    setState((current) => ({ ...current, categories: current.categories.map((category) => category.id === id ? { ...category, archived: true } : category) }));
    await persist("category.archive", { id });
  }, [persist]);

  const upsertIncomeType = useCallback(async (incomeType: IncomeTypeInput) => {
    setState((current) => ({ ...current, categories: upsertIncomeTypeInCategories(current.categories, incomeType) }));
    await persist("income-type.upsert", incomeType);
  }, [persist]);

  const archiveIncomeType = useCallback(async (id: string) => {
    setState((current) => ({ ...current, categories: archiveIncomeTypeInCategories(current.categories, id) }));
    await persist("income-type.archive", { id });
  }, [persist]);

  const upsertFinanceGroup = useCallback(async (group: FinanceGroupInput) => {
    setState((current) => {
      const existing = current.groupAllocations.find((item) => item.id === group.id);
      const next: GroupAllocation = existing
        ? { ...existing, ...group, archived: false }
        : { ...group, targetPercent: 0, includedInPlan: false, archived: false, isDefault: false };
      return { ...current, groupAllocations: existing ? current.groupAllocations.map((item) => item.id === group.id ? next : item) : [...current.groupAllocations, next] };
    });
    await persist("finance-group.upsert", group);
  }, [persist]);

  const archiveFinanceGroup = useCallback(async (groupKey: string, destinationGroupKey?: string, archiveCategories = false) => {
    setState((current) => ({
      ...current,
      groupAllocations: current.groupAllocations.map((group) => group.group === groupKey ? { ...group, archived: true, includedInPlan: false, targetPercent: 0 } : group),
      categories: current.categories.map((category) => {
        if (category.kind !== "expense" || category.group !== groupKey || category.archived) return category;
        if (destinationGroupKey) return { ...category, group: destinationGroupKey };
        return archiveCategories ? { ...category, archived: true } : category;
      }),
    }));
    await persist("finance-group.archive", { groupKey, destinationGroupKey, archiveCategories });
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

  const updateGroupAllocations = useCallback(async (allocations: Array<Pick<GroupAllocation, "group" | "targetPercent" | "includedInPlan" | "sortOrder">>) => {
    setState((current) => ({
      ...current,
      groupAllocations: current.groupAllocations.map((group) => {
        const allocation = allocations.find((item) => item.group === group.group);
        return allocation ? { ...group, ...allocation } : group;
      }),
    }));
    await persist("allocation.set", allocations);
  }, [persist]);

  const listTransactions = useCallback(async ({ limit = 20, cursor = null, filter = "all", query = "" }: { limit?: number; cursor?: TransactionCursor | null; filter?: TransactionListFilter; query?: string } = {}): Promise<TransactionPage> => {
    const safeLimit = Math.min(100, Math.max(1, Math.round(limit)));
    const client = createClient();
    if (!client || !userId || userId === "demo" || !navigator.onLine) {
      return localTransactionPage(stateRef.current, { limit: safeLimit, cursor, filter, query });
    }

    const { data, error } = await client.rpc("get_transactions_page", {
      p_limit: safeLimit,
      p_cursor_occurred_on: cursor?.occurredOn ?? null,
      p_cursor_created_at: cursor?.createdAt ?? null,
      p_cursor_id: cursor?.id ?? null,
      p_kind: filter,
      p_query: query,
    });
    if (error) throw error;
    const payload = (data ?? {}) as TransactionPageRowResult;
    const rows = payload.items ?? [];
    const items = rows.map(transactionFromRow);
    const related = rows.flatMap((row) => row.transfer_pair ? [transactionFromRow(row.transfer_pair)] : []);
    setState((current) => ({ ...current, transactions: mergeTransactions(current.transactions, [...items, ...related]) }));
    return {
      items,
      related,
      hasMore: Boolean(payload.hasMore),
      nextCursor: payload.nextCursor ?? null,
      source: "remote",
    };
  }, [userId]);

  const exportTransactions = useCallback(async ({ filter = "all", query = "" }: { filter?: TransactionListFilter; query?: string } = {}) => {
    const exported: Transaction[] = [];
    const seen = new Set<string>();
    let cursor: TransactionCursor | null = null;
    for (let pageNumber = 0; pageNumber < 10000; pageNumber += 1) {
      const page = await listTransactions({ limit: 100, cursor, filter, query });
      for (const transaction of [...page.items, ...page.related]) {
        if (!seen.has(transaction.id)) {
          seen.add(transaction.id);
          exported.push(transaction);
        }
      }
      if (!page.hasMore || !page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return exported.sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }, [listTransactions]);

  const getFinanceReport = useCallback(async (endMonth = currentMonthStart(), months = 12): Promise<FinanceReport> => {
    const client = createClient();
    if (!client || !userId || userId === "demo" || !navigator.onLine) return fallbackReport(stateRef.current, endMonth, months);
    const { data, error } = await client.rpc("get_finance_report", { p_end_month: endMonth, p_months: months });
    if (error) throw error;
    const report = data as ReportRow;
    return {
      startMonth: report.startMonth,
      endMonth: report.endMonth,
      months: (report.months ?? []).map((month) => ({ month: month.month, income: Number(month.income), expense: Number(month.expense), balance: Number(month.balance) })),
      groups: (report.groups ?? []).map((group) => ({ group: group.group, name: group.name, color: group.color, expense: Number(group.expense), targetPercent: Number(group.targetPercent), includedInPlan: group.includedInPlan, archived: group.archived })),
      source: "remote",
    };
  }, [userId]);

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
    upsertCategory,
    archiveCategory,
    upsertIncomeType,
    archiveIncomeType,
    upsertFinanceGroup,
    archiveFinanceGroup,
    updateBudget,
    updateProfile,
    updateGroupAllocations,
    listTransactions,
    exportTransactions,
    getFinanceReport,
    syncNow,
  }), [state, hydrated, online, pendingCount, syncError, addTransaction, updateTransaction, deleteTransaction, addAccount, addCategory, upsertCategory, archiveCategory, upsertIncomeType, archiveIncomeType, upsertFinanceGroup, archiveFinanceGroup, updateBudget, updateProfile, updateGroupAllocations, listTransactions, exportTransactions, getFinanceReport, syncNow]);

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

function identityFromUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): FinanceIdentity {
  const email = user.email ?? "";
  const metadata = user.user_metadata ?? {};
  const text = (value: unknown) => typeof value === "string" ? value : "";
  return {
    id: user.id,
    email,
    displayName: text(metadata.full_name) || text(metadata.name) || email.split("@")[0] || "Usuario",
    avatarUrl: text(metadata.avatar_url) || text(metadata.picture) || undefined,
  };
}

function profileFallbackState(identity: FinanceIdentity): FinanceState {
  return {
    ...emptyFinanceState,
    profile: {
      id: identity.id,
      email: identity.email,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
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
    icon: input.icon,
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
