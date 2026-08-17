export type TransactionKind = "income" | "expense" | "transfer_out" | "transfer_in";
export type AccountType = "checking" | "savings" | "cash" | "credit" | "investment";

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  initialBalance: number;
  color: string;
  archived?: boolean;
};

export type Category = {
  id: string;
  name: string;
  group: "needs" | "wants" | "savings" | "investments" | "debts" | "income";
  color: string;
  icon: string;
  kind: "income" | "expense";
  isDefault?: boolean;
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
  occurredOn: string;
  createdAt: string;
  syncStatus?: "synced" | "pending" | "error";
};

export type Budget = {
  id: string;
  categoryId: string;
  month: string;
  amount: number;
};

export type FinanceState = {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
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
  occurredOn: string;
};

export type QueueItem = {
  id: string;
  operation: "transaction.create" | "transaction.delete" | "budget.upsert" | "account.create" | "category.create";
  payload: unknown;
  createdAt: string;
};
