export type TransactionKind = "income" | "expense" | "transfer_out" | "transfer_in";
export type AccountType = "checking" | "savings" | "cash" | "credit" | "investment";
export type ExpenseGroup = string;
export type ThemeMode = "light" | "dark" | "system";
export type ColorTheme = "moneva" | "crimson" | "ocean" | "violet" | "amber";

export type FinanceProfile = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  currencyCode: string;
  timezone: string;
  weekStartsOn: number;
  monthStartsOn: number;
  themeMode: ThemeMode;
  colorTheme: ColorTheme;
};

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  initialBalance: number;
  color: string;
  icon?: string;
  archived?: boolean;
};

export type Category = {
  id: string;
  name: string;
  group: ExpenseGroup | "income";
  color: string;
  icon: string;
  kind: "income" | "expense";
  isDefault?: boolean;
  archived?: boolean;
};

export type Transaction = {
  id: string;
  kind: TransactionKind;
  amount: number;
  accountId: string;
  categoryId?: string;
  transferGroupId?: string;
  description: string;
  merchant?: string;
  note?: string;
  icon?: string;
  occurredOn: string;
  createdAt: string;
  syncStatus?: "synced" | "pending" | "error";
  /** Identifica exactamente qué entrada WAL produjo esta versión local. */
  pendingOperationId?: string;
};

export type FinanceSnapshot = {
  month: string;
  income: number;
  expense: number;
  accountBalances: Record<string, number>;
  categorySpending: Record<string, number>;
};

export type TransactionCursor = {
  occurredOn: string;
  createdAt: string;
  id: string;
};

export type TransactionListFilter = "all" | "expense" | "income" | "transfer";

export type TransactionPage = {
  items: Transaction[];
  related: Transaction[];
  hasMore: boolean;
  nextCursor: TransactionCursor | null;
  source: "remote" | "local";
};

export type FinanceReportMonth = {
  month: string;
  income: number;
  expense: number;
  balance: number;
};

export type FinanceReportGroup = {
  group: ExpenseGroup;
  name: string;
  color: string;
  expense: number;
  targetPercent: number;
  includedInPlan: boolean;
  archived: boolean;
};

export type FinanceReport = {
  startMonth: string;
  endMonth: string;
  months: FinanceReportMonth[];
  groups: FinanceReportGroup[];
  source: "remote" | "local";
  /** Indica si el periodo se calculó con todo el historial o con una caché local parcial. */
  coverage: "complete" | "partial";
};

export type Budget = {
  id: string;
  categoryId: string;
  month: string;
  amount: number;
};

export type GroupAllocation = {
  id: string;
  group: ExpenseGroup;
  name: string;
  color: string;
  icon: string;
  targetPercent: number;
  includedInPlan: boolean;
  sortOrder: number;
  archived?: boolean;
  isDefault?: boolean;
};

export type FinanceGroupInput = Pick<GroupAllocation, "id" | "group" | "name" | "color" | "icon" | "sortOrder">;
export type GroupAllocationWrite = Pick<GroupAllocation, "group" | "targetPercent" | "includedInPlan" | "sortOrder">;
export type ArchiveFinanceGroupInput = {
  groupKey: ExpenseGroup;
  allocations: GroupAllocationWrite[];
  destinationGroupKey?: ExpenseGroup;
  archiveCategories?: boolean;
};
export type CategoryInput = Pick<Category, "id" | "name" | "group" | "color" | "icon">;
export type IncomeTypeInput = Pick<Category, "id" | "name" | "color" | "icon">;

export type FinanceState = {
  profile: FinanceProfile | null;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  groupAllocations: GroupAllocation[];
  snapshot?: FinanceSnapshot;
};

export type TransactionInput = {
  type: "income" | "expense" | "transfer";
  amount: number;
  accountId: string;
  destinationAccountId?: string;
  categoryId?: string;
  description: string;
  merchant?: string;
  note?: string;
  icon?: string;
  occurredOn: string;
};

export type QueueItem = {
  id: string;
  userId: string;
  operation: "transaction.create" | "transaction.update" | "transaction.import" | "transaction.delete" | "budget.upsert" | "account.create" | "category.create" | "category.upsert" | "category.archive" | "income-type.upsert" | "income-type.archive" | "finance-group.upsert" | "finance-group.archive" | "profile.update" | "allocation.set";
  payload: unknown;
  createdAt: string;
  /** Orden durable asignado dentro de la misma transacción que estado + WAL. */
  sequence?: number;
  attempts?: number;
  lastError?: string;
};

export type ProfileInput = Pick<FinanceProfile, "displayName" | "currencyCode" | "timezone" | "weekStartsOn" | "monthStartsOn" | "themeMode" | "colorTheme">;
