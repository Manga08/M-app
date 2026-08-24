export type TransactionKind = "income" | "expense" | "transfer_out" | "transfer_in";
export type RecurringRuleKind = "income" | "expense" | "transfer";
export type RecurringCadence = "weekly" | "monthly" | "yearly";
export type RecurringPostingPolicy = "scheduled_date" | "month_start";
export type RecurringRuleStatus = "active" | "paused" | "archived";
export type RecurringOccurrenceStatus = "planned" | "posted" | "skipped" | "failed" | "cancelled";
export type FinancialTargetMode = "accumulate" | "pay_down";
export type FinancialTargetKind = "savings" | "emergency" | "investment" | "purchase" | "debt" | "other";
export type FinancialTargetStatus = "active" | "paused" | "completed" | "archived";
export type FinancialTargetTrackingMode = "manual" | "movements";
export type FinancialTargetEffect = "advance" | "reverse";
export type FinancialTargetEntryKind = "contribution" | "withdrawal" | "payment" | "interest" | "fee" | "adjustment";
export type AccountType = "checking" | "savings" | "cash" | "credit" | "investment";
export type ExpenseGroup = string;
export type ThemeMode = "light" | "dark" | "system";
export type ColorTheme = "moneva" | "crimson" | "ocean" | "violet" | "amber" | "custom";

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
  customThemeColor: string;
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
  /** Orden visual; las copias locales antiguas pueden no incluirlo. */
  sortOrder?: number;
};

export type Transaction = {
  id: string;
  kind: TransactionKind;
  amount: number;
  accountId: string;
  categoryId?: string;
  transferGroupId?: string;
  recurringOccurrenceId?: string;
  financialTargetId?: string;
  financialTargetEffect?: FinancialTargetEffect;
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

export type RecurringRule = {
  id: string;
  kind: RecurringRuleKind;
  amount: number;
  accountId: string;
  destinationAccountId?: string;
  categoryId?: string;
  financialTargetId?: string;
  financialTargetEffect?: FinancialTargetEffect;
  description: string;
  merchant?: string;
  note?: string;
  icon?: string;
  cadence: RecurringCadence;
  intervalCount: number;
  startsOn: string;
  endsOn?: string;
  anchorDay?: number;
  weekday?: number;
  postingPolicy: RecurringPostingPolicy;
  timezone: string;
  autoPost: boolean;
  includeInBudget: boolean;
  includeInIncomeTarget: boolean;
  status: RecurringRuleStatus;
  nextRunOn?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus?: "synced" | "pending" | "error";
  pendingOperationId?: string;
};

export type RecurringOccurrence = {
  id: string;
  ruleId: string;
  kind: RecurringRuleKind;
  scheduledOn: string;
  effectiveOn: string;
  amount: number;
  accountId: string;
  destinationAccountId?: string;
  categoryId?: string;
  financialTargetId?: string;
  financialTargetEffect?: FinancialTargetEffect;
  description: string;
  merchant?: string;
  note?: string;
  icon?: string;
  status: RecurringOccurrenceStatus;
  transactionId?: string;
  transferGroupId?: string;
  failureReason?: string;
  postedAt?: string;
  createdAt: string;
};

export type FinancialTarget = {
  id: string;
  mode: FinancialTargetMode;
  kind: FinancialTargetKind;
  status: FinancialTargetStatus;
  title: string;
  description?: string;
  targetAmount: number;
  initialProgress: number;
  /** Total agregado por la base remota; no es un porcentaje persistido. */
  progressAmount?: number;
  startsOn: string;
  targetDate?: string;
  priority: number;
  color: string;
  icon: string;
  coverPath?: string;
  accountId?: string;
  categoryId?: string;
  trackingMode: FinancialTargetTrackingMode;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  archivedAt?: string;
  syncStatus?: "synced" | "pending" | "error";
  pendingOperationId?: string;
};

export type FinancialTargetEntry = {
  id: string;
  targetId: string;
  kind: FinancialTargetEntryKind;
  effect: FinancialTargetEffect;
  amount: number;
  occurredOn: string;
  note?: string;
  createdAt: string;
  syncStatus?: "synced" | "pending" | "error";
  pendingOperationId?: string;
};

export type FinancialTargetDebtDetails = {
  targetId: string;
  creditor?: string;
  annualInterestRate?: number;
  minimumPayment?: number;
  dueDay?: number;
};

export type FinancialTargetInput = Omit<FinancialTarget,
  "id" | "createdAt" | "updatedAt" | "completedAt" | "archivedAt" | "syncStatus" | "pendingOperationId"
> & {
  id?: string;
  debt?: Omit<FinancialTargetDebtDetails, "targetId">;
};

export type FinancialTargetEntryInput = Omit<FinancialTargetEntry,
  "id" | "createdAt" | "syncStatus" | "pendingOperationId"
> & { id?: string };

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

export type ReportPreset = "month" | "6m" | "12m" | "24m" | "custom" | "months";
export type ReportGranularity = "day" | "week" | "month";
export type ReportComparison = "previous" | "year" | "none";
export type ReportKindFilter = "all" | "expense" | "income" | "transfer";

export type ReportQuery = {
  preset: ReportPreset;
  startDate: string;
  endDate: string;
  selectedMonths: string[];
  comparison: ReportComparison;
  kind: ReportKindFilter;
  groupKeys: string[];
  categoryIds: string[];
  incomeTypeIds: string[];
  accountIds: string[];
  search: string;
  granularity: ReportGranularity;
};

export type FinanceReportSummary = {
  income: number;
  expense: number;
  balance: number;
  savingsRate: number;
  averageDailyExpense: number;
  transactionCount: number;
  budget: number;
  budgetUsage: number;
  budgetVariance: number;
};

export type DetailedReportSeriesPoint = {
  period: string;
  income: number;
  expense: number;
  balance: number;
};

export type DetailedReportCategory = {
  id: string;
  name: string;
  group: string;
  color: string;
  icon: string;
  expense: number;
  budget: number;
  variance: number;
  usage: number;
  transactionCount: number;
};

export type DetailedReportGroup = FinanceReportGroup & {
  budget: number;
  variance: number;
  usage: number;
  transactionCount: number;
  categories: DetailedReportCategory[];
};

export type DetailedReportIncomeType = {
  id: string;
  name: string;
  color: string;
  icon: string;
  income: number;
  percent: number;
  transactionCount: number;
};

export type DetailedReportAccount = {
  id: string;
  name: string;
  type: AccountType;
  color: string;
  icon?: string;
  openingBalance: number;
  closingBalance: number;
  income: number;
  expense: number;
  transferIn: number;
  transferOut: number;
  netFlow: number;
};

export type DetailedReportMerchant = {
  name: string;
  expense: number;
  transactionCount: number;
};

export type DetailedReportWeekday = {
  weekday: number;
  expense: number;
  transactionCount: number;
};

export type DetailedFinanceReport = {
  startDate: string;
  endDate: string;
  selectedMonths: string[];
  granularity: ReportGranularity;
  summary: FinanceReportSummary;
  comparison: FinanceReportSummary | null;
  series: DetailedReportSeriesPoint[];
  groups: DetailedReportGroup[];
  incomeTypes: DetailedReportIncomeType[];
  accounts: DetailedReportAccount[];
  merchants: DetailedReportMerchant[];
  weekdays: DetailedReportWeekday[];
  transactions: Transaction[];
  source: "remote" | "local";
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

export type BudgetPlanSource = "manual" | "current_income" | "previous_month" | "historical" | "imported";

export type MonthlyBudgetPlan = {
  month: string;
  incomeTarget: number;
  source: BudgetPlanSource;
};

export type MonthlyBudgetWrite = {
  id: string;
  categoryId: string;
  amount: number;
};

export type MonthlyBudgetPlanInput = MonthlyBudgetPlan & {
  budgets: MonthlyBudgetWrite[];
};

export type MonthlyBudgetPlanData = {
  plan: MonthlyBudgetPlan | null;
  budgets: Budget[];
  coverage: "complete" | "partial";
  source: "remote" | "local";
};

export type CategoryOrderWrite = {
  id: string;
  sortOrder: number;
};

export type PlanSimulationCategory = Pick<Category, "id" | "name" | "group" | "color" | "icon"> & {
  sortOrder: number;
  archived?: boolean;
  budget: number;
  spent: number;
};

export type PlanSimulationSeed = {
  month: string;
  incomeTarget: number;
  actualIncome: number;
  mainCategories: GroupAllocation[];
  categories: PlanSimulationCategory[];
  source: "remote" | "local";
  coverage: "complete" | "partial";
};
export type CategoryInput = Pick<Category, "id" | "name" | "group" | "color" | "icon">;
export type IncomeTypeInput = Pick<Category, "id" | "name" | "color" | "icon">;

export type FinanceState = {
  profile: FinanceProfile | null;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  recurringOccurrences: RecurringOccurrence[];
  financialTargets: FinancialTarget[];
  financialTargetEntries: FinancialTargetEntry[];
  financialTargetDebts: FinancialTargetDebtDetails[];
  budgets: Budget[];
  monthlyBudgetPlans: MonthlyBudgetPlan[];
  budgetMonthsLoaded: string[];
  groupAllocations: GroupAllocation[];
  snapshot?: FinanceSnapshot;
};

export type TransactionInput = {
  type: "income" | "expense" | "transfer";
  amount: number;
  accountId: string;
  destinationAccountId?: string;
  categoryId?: string;
  financialTargetId?: string;
  financialTargetEffect?: FinancialTargetEffect;
  description: string;
  merchant?: string;
  note?: string;
  icon?: string;
  occurredOn: string;
};

export type RecurringRuleInput = Omit<RecurringRule,
  "id" | "createdAt" | "updatedAt" | "nextRunOn" | "syncStatus" | "pendingOperationId"
> & { id?: string };

export type QueueItem = {
  id: string;
  userId: string;
  operation: "transaction.create" | "transaction.update" | "transaction.import" | "transaction.delete" | "recurring-rule.upsert" | "recurring-rule.archive" | "recurring-occurrence.update" | "financial-target.upsert" | "financial-target.status" | "financial-target-entry.upsert" | "financial-target-entry.delete" | "budget.upsert" | "budget-plan.set" | "account.create" | "category.create" | "category.import" | "category.upsert" | "category.archive" | "category.order" | "income-type.upsert" | "income-type.import" | "income-type.archive" | "finance-group.upsert" | "finance-group.archive" | "profile.update" | "allocation.set";
  payload: unknown;
  createdAt: string;
  /** Orden durable asignado dentro de la misma transacción que estado + WAL. */
  sequence?: number;
  attempts?: number;
  lastError?: string;
};

export type ProfileInput = Pick<FinanceProfile, "displayName" | "currencyCode" | "timezone" | "weekStartsOn" | "monthStartsOn" | "themeMode" | "colorTheme" | "customThemeColor">;
