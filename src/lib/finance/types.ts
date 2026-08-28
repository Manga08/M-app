export type TransactionKind = "income" | "expense" | "transfer_out" | "transfer_in" | "adjustment_in" | "adjustment_out";
export type RecurringRuleKind = "income" | "expense" | "transfer";
export type RecurringCadence = "weekly" | "monthly" | "semimonthly" | "yearly";
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
export type CreditCardNetwork = "visa" | "mastercard" | "amex" | "diners" | "other";
export type CreditCardFinancingType = "no_interest" | "known_rate" | "unknown";
export type CreditCardStatementStatus = "open" | "due" | "paid" | "overdue" | "reconciled";
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
  schemaVersion?: number;
};

/**
 * Optional institution/wallet grouping. It never owns money or movements;
 * balances continue to live exclusively in Account.
 */
export type AccountEntity = {
  id: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  archived?: boolean;
  version?: number;
};

export type AccountEntityInput = Pick<AccountEntity, "id" | "name" | "color" | "icon" | "sortOrder"> & {
  version?: number;
};

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  initialBalance: number;
  color: string;
  icon?: string;
  archived?: boolean;
  archivedAt?: string;
  /** ISO 4217; defaults to the profile reporting currency for legacy local data. */
  currencyCode?: string;
  /** Projection assumption only; it never changes the real balance. */
  expectedAnnualReturn?: number;
  /** Date at which the opening stock becomes part of the account history. */
  openingBalanceDate?: string;
  /** Reporting-currency value of one account-currency unit at opening. */
  openingExchangeRate?: number;
  /** Optional visual grouping; the entity itself never carries a balance. */
  entityId?: string;
  version?: number;
};

export type CreditCardProfile = {
  accountId: string;
  network: CreditCardNetwork;
  lastFour?: string;
  creditLimit: number;
  cutoffDay: number;
  dueDay: number;
  annualFee: number;
  purchaseRateEa?: number;
  cashAdvanceRateEa?: number;
  version?: number;
};

export type CreditCardStatement = {
  id: string;
  accountId: string;
  periodStart: string;
  periodEnd: string;
  cutoffOn: string;
  dueOn: string;
  totalDue: number;
  minimumDue: number;
  purchases: number;
  advances: number;
  interest: number;
  fees: number;
  payments: number;
  refunds: number;
  status: CreditCardStatementStatus;
  reconciledAt?: string;
  reconciliationTransactionId?: string;
  reconciliationExchangeRate?: number;
  reconciliationExchangeRateSource?: "manual" | "provider" | "imported";
  version?: number;
};

export type CreditCardStatementInput = Omit<CreditCardStatement, "id" | "status" | "reconciledAt" | "version"> & {
  id?: string;
  /** Saving and reconciling are deliberately different user actions. */
  saveMode: "open" | "reconcile";
};

export type LiabilityReconciliationPreview = {
  accountId: string;
  cutoffOn: string;
  currencyCode: "COP" | "USD";
  /** Debt already posted before applying the statement's explicit charges. */
  ledgerDebtBeforeStatementCharges: number;
  ledgerBalance: number;
  /** Debt after projecting only the missing statement interest and fees. */
  ledgerDebt: number;
  reportingBalance: number;
  statementTotal: number;
  postedInterest: number;
  postedFees: number;
  interestToPost: number;
  feesToPost: number;
  difference: number;
  adjustmentKind?: "adjustment_in" | "adjustment_out";
  isBalanced: boolean;
  /** USD postings need the bank's exact COP valuation even when the final difference is zero. */
  requiresExchangeRate: boolean;
};

export type CreditCardPurchasePlan = {
  id: string;
  accountId: string;
  transactionId: string;
  installmentCount: number;
  financingType: CreditCardFinancingType;
  annualEffectiveRate?: number;
  firstDueOn: string;
  status: "active" | "completed" | "cancelled";
};

export type CreditCardInstallment = {
  id: string;
  planId: string;
  installmentNumber: number;
  dueOn: string;
  principal: number;
  estimatedInterest: number;
  estimatedFee: number;
  status: "planned" | "billed" | "paid" | "cancelled";
  statementId?: string;
};

export type CreditCardInput = {
  accountId?: string;
  name: string;
  color: string;
  icon: string;
  currencyCode: "COP" | "USD";
  entityId?: string;
  openingDebt: number;
  openingBalanceDate: string;
  openingExchangeRate?: number;
  network: CreditCardNetwork;
  lastFour?: string;
  creditLimit: number;
  cutoffDay: number;
  dueDay: number;
  annualFee: number;
  purchaseRateEa?: number;
  cashAdvanceRateEa?: number;
  accountVersion?: number;
  cardVersion?: number;
};

export type CreditCardPurchaseInput = {
  transaction: TransactionInput;
  installmentCount: number;
  financingType: CreditCardFinancingType;
  annualEffectiveRate?: number;
  firstDueOn: string;
};

export type LiabilityKind = "credit_card" | "loan" | "personal_debt" | "bnpl" | "revolving_credit" | "other";
export type LiabilityStatus = "active" | "paused" | "settled" | "archived";
export type LiabilityMigrationStatus = "native" | "migrated" | "needs_review";
export type LiabilityCalculationMethod = "simple" | "amortized" | "revolving" | "statement_balance" | "manual";
export type LiabilityTermSource = "manual" | "statement" | "issuer" | "migration";
export type LiabilityRateKind = "principal" | "purchase" | "cash_advance" | "late" | "other";
export type LiabilityRateBasis = "effective_annual" | "nominal_annual" | "monthly" | "fixed_amount";
export type LiabilityObligationKind = "credit_card_statement" | "loan_installment" | "manual_due";
export type LiabilityObligationStatus = "projected" | "open" | "due" | "partial" | "paid" | "overdue" | "waived" | "cancelled";
export type LiabilityObligationSource = "manual" | "statement" | "contract" | "migration";
export type LiabilityPaymentStrategy = "fixed" | "minimum_due" | "statement_total" | "current_balance";
export type LiabilityPaymentRecordingMode = "manual" | "auto_post";
export type LiabilityPaymentIntentStatus = "planned" | "needs_confirmation" | "confirmed" | "posted" | "skipped" | "failed" | "cancelled";

export type Liability = {
  accountId: string;
  kind: LiabilityKind;
  status: LiabilityStatus;
  creditorName?: string;
  originalPrincipal?: number;
  originatedOn?: string;
  maturityOn?: string;
  legacyTargetId?: string;
  migrationStatus: LiabilityMigrationStatus;
  version: number;
};

export type LiabilityTerms = {
  id: string;
  accountId: string;
  startsOn: string;
  endsOn?: string;
  paymentFrequency: ObligationPaymentFrequency;
  intervalCount: number;
  calculationMethod: LiabilityCalculationMethod;
  amortizationMethod: ObligationAmortizationMethod;
  statementCutoffDay?: number;
  dueDay?: number;
  firstDueOn?: string;
  installmentCount?: number;
  scheduledPayment?: number;
  contractualMinimum?: number;
  periodicFee: number;
  periodicInsurance: number;
  variableRate: boolean;
  indexName?: string;
  spreadRate?: number;
  prepaymentStrategy: ObligationPrepaymentStrategy | "manual";
  source: LiabilityTermSource;
  version: number;
};

export type LiabilityRatePeriod = {
  id: string;
  accountId: string;
  rateKind: LiabilityRateKind;
  rateBasis: LiabilityRateBasis;
  reportedValue: number;
  effectiveAnnualRate?: number;
  startsOn: string;
  endsOn?: string;
  source: LiabilityTermSource;
};

export type LiabilityObligation = {
  id: string;
  accountId: string;
  kind: LiabilityObligationKind;
  sequenceNumber?: number;
  periodStart?: string;
  periodEnd?: string;
  dueOn: string;
  principalDue: number;
  interestDue: number;
  feeDue: number;
  minimumDue: number;
  totalDue: number;
  status: LiabilityObligationStatus;
  source: LiabilityObligationSource;
  version: number;
};

export type LiabilityPaymentRule = {
  id: string;
  accountId: string;
  fundingAccountId: string;
  strategy: LiabilityPaymentStrategy;
  fixedAmount?: number;
  maximumAmount?: number;
  daysBeforeDue: number;
  recordingMode: LiabilityPaymentRecordingMode;
  active: boolean;
  /** Internal marker: only target lifecycle may set/clear it. */
  suspendedByTarget?: boolean;
  version: number;
};

export type LiabilityPaymentIntent = {
  id: string;
  accountId: string;
  ruleId?: string;
  obligationId?: string;
  scheduledFor: string;
  plannedAmount: number;
  status: LiabilityPaymentIntentStatus;
  /** Prevents a cancelled intent from being mistaken for a user cancellation. */
  suspendedByTarget?: boolean;
  ledgerEventId?: string;
  failureReason?: string;
  version: number;
};

export type LiabilityOverviewObligation = {
  id: string;
  kind: LiabilityObligationKind;
  sequenceNumber?: number;
  dueOn: string;
  principalDue: number;
  interestDue: number;
  feeDue: number;
  minimumDue: number;
  totalDue: number;
  allocated: number;
  remaining: number;
  status: LiabilityObligationStatus;
  version: number;
};

export type LiabilityOverviewCard = CreditCardProfile & {
  availableCredit: number;
};

export type LiabilityOverviewItem = {
  /** Compatibility domain object used by exports while consumers migrate to flat summary fields. */
  liability: Liability;
  accountId: string;
  accountVersion: number;
  liabilityVersion: number;
  name: string;
  accountName: string;
  kind: LiabilityKind;
  status: LiabilityStatus;
  creditorName?: string;
  currencyCode: "COP" | "USD";
  color: string;
  accountColor: string;
  icon?: string;
  accountIcon?: string;
  entityId?: string;
  originalPrincipal?: number;
  originatedOn?: string;
  maturityOn?: string;
  legacyTargetId?: string;
  migrationStatus: LiabilityMigrationStatus;
  nativeBalance: number;
  nativeDebt: number;
  reportingBalance: number;
  reportingDebt: number;
  reportingApproximate: boolean;
  currentTerms?: LiabilityTerms;
  currentRates: LiabilityRatePeriod[];
  /** Compatibility alias for currentRates. */
  rates: LiabilityRatePeriod[];
  nextObligation?: LiabilityOverviewObligation;
  paymentRule?: LiabilityPaymentRule;
  card?: LiabilityOverviewCard;
};

export type LiabilityOverview = {
  asOf: string;
  reportingCurrencyCode: "COP";
  totalReportingDebt: number;
  items: LiabilityOverviewItem[];
  coverage: "complete" | "partial";
};

export type LiabilityCalendarItem = {
  date: string;
  type: "obligation" | "payment_intent";
  id: string;
  accountId: string;
  liabilityKind: LiabilityKind;
  accountName: string;
  amount: number;
  currencyCode: "COP" | "USD";
  remaining: number;
  minimumDue: number;
  sequenceNumber?: number;
  ledgerEventId?: string;
  status: LiabilityObligationStatus | LiabilityPaymentIntentStatus;
  version: number;
};

export type LiabilityCalendarRange = {
  startDate: string;
  endDate: string;
  items: LiabilityCalendarItem[];
  coverage: "complete" | "partial";
};

export type LiabilityReconciliation = {
  obligationId: string;
  accountId: string;
  reconciledAt: string;
  sourceReference?: string;
  projectedTotal: number;
  confirmedTotal: number;
  difference: number;
  certainty: "confirmed";
};

export type LiabilityInput = {
  account: {
    id: string;
    name: string;
    color: string;
    icon?: string;
    currencyCode: "COP" | "USD";
    entityId?: string;
    openingDebt: number;
    openingBalanceDate: string;
    openingExchangeRate?: number;
    version?: number;
  };
  liability: Omit<Liability, "accountId" | "migrationStatus" | "version"> & {
    accountId: string;
    version?: number;
  };
};

export type LiabilityTermsInput = Omit<LiabilityTerms, "version"> & {
  version?: number;
  rates: Array<Omit<LiabilityRatePeriod, "accountId">>;
};

export type LiabilityObligationInput = Omit<LiabilityObligation, "version"> & { version?: number };

export type LiabilityAdjustmentInput = {
  id: string;
  role: "interest" | "fee" | "refund" | "forgiveness" | "adjustment";
  kind: "expense" | "adjustment_in" | "adjustment_out";
  amount: number;
  categoryId?: string;
  description?: string;
  merchant?: string;
  note?: string;
  icon?: string;
  occurredOn?: string;
  exchangeRate?: number;
  exchangeRateDate?: string;
  exchangeRateSource?: "same_currency" | "manual" | "provider" | "imported";
  referenceExchangeRate?: number;
  referenceRateSource?: "sfc_trm" | "manual" | "imported";
};

export type LiabilityObligationWriteInput = {
  obligation: LiabilityObligationInput;
  /** Optimistic-lock version currently stored remotely; separate from the local next version. */
  expectedVersion?: number;
  /** Legacy card detail kept while the specialized card UI is migrated. */
  statement?: CreditCardStatement;
  adjustments?: LiabilityAdjustmentInput[];
  reconcileDifference?: boolean;
};

export type LiabilityReconciliationInput = Omit<LiabilityObligationWriteInput, "reconcileDifference"> & {
  reconcileDifference: true;
};

export type LiabilityPaymentRuleInput = Omit<LiabilityPaymentRule, "version"> & { version?: number };

export type LiabilityPaymentInput = {
  id?: string;
  accountId: string;
  fundingAccountId: string;
  liabilityAmount: number;
  fundingAmount?: number;
  occurredOn?: string;
  description?: string;
  intentId?: string;
  transferGroupId?: string;
  fundingTransactionId?: string;
  liabilityTransactionId?: string;
  interestTransactionId?: string;
  feeTransactionId?: string;
  fundingExchangeRate: number;
  liabilityExchangeRate: number;
  fundingExchangeRateSource?: "same_currency" | "manual" | "provider" | "imported";
  liabilityExchangeRateSource?: "same_currency" | "manual" | "provider" | "imported";
  allocations?: Array<{
    id?: string;
    obligationId: string;
    amount: number;
    allocatedOn?: string;
  }>;
  /**
   * Optional fixed-rate projection rebuilt after an extra capital payment.
   * The server validates and replaces only editable future obligations.
   */
  futureObligations?: LiabilityObligationInput[];
};

export type LiabilityArchiveInput = {
  accountId: string;
  accountVersion: number;
  liabilityVersion: number;
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
  /** Relación normalizada con la categoría principal; group queda como clave compatible. */
  mainCategoryId?: string;
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
  ledgerEventId?: string;
  /** Specialized liability postings are immutable in the generic editor. */
  liabilityRole?: "purchase" | "drawdown" | "payment" | "interest" | "fee" | "refund" | "cash_advance" | "forgiveness" | "adjustment";
  nativeCurrencyCode?: string;
  baseCurrencyCode?: string;
  baseAmount?: number;
  exchangeRate?: number;
  exchangeRateDate?: string;
  exchangeRateSource?: "same_currency" | "manual" | "provider" | "imported";
  referenceExchangeRate?: number;
  referenceRateSource?: "sfc_trm" | "manual" | "imported";
  version?: number;
};

export type RecurringRule = {
  id: string;
  kind: RecurringRuleKind;
  amount: number;
  /** Exact native amount credited by a cross-currency transfer. */
  destinationAmount?: number;
  accountId: string;
  destinationAccountId?: string;
  categoryId?: string;
  financialTargetId?: string;
  financialTargetEffect?: FinancialTargetEffect;
  description: string;
  merchant?: string;
  note?: string;
  icon?: string;
  /** Fixed COP-per-USD quote kept until the user edits the schedule. */
  exchangeRate: number;
  exchangeRateDate: string;
  exchangeRateSource: "same_currency" | "manual" | "provider" | "imported";
  referenceExchangeRate?: number;
  referenceRateSource?: "sfc_trm" | "manual" | "imported";
  cadence: RecurringCadence;
  intervalCount: number;
  startsOn: string;
  endsOn?: string;
  anchorDay?: number;
  secondAnchorDay?: number;
  weekday?: number;
  postingPolicy: RecurringPostingPolicy;
  timezone: string;
  autoPost: boolean;
  includeInBudget: boolean;
  includeInIncomeTarget: boolean;
  status: RecurringRuleStatus;
  /** Internal marker used to resume only schedules paused with their target. */
  suspendedByTarget?: boolean;
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
  destinationAmount?: number;
  accountId: string;
  destinationAccountId?: string;
  categoryId?: string;
  financialTargetId?: string;
  financialTargetEffect?: FinancialTargetEffect;
  description: string;
  merchant?: string;
  note?: string;
  icon?: string;
  exchangeRate: number;
  exchangeRateDate: string;
  exchangeRateSource: "same_currency" | "manual" | "provider" | "imported";
  referenceExchangeRate?: number;
  referenceRateSource?: "sfc_trm" | "manual" | "imported";
  status: RecurringOccurrenceStatus;
  suspendedByTarget?: boolean;
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

export type FinancialTargetDebtInput = Omit<FinancialTargetDebtDetails, "targetId"> & {
  liabilityAccountId?: string;
  /** Optional source account for a later payment rule; never becomes target.accountId. */
  fundingAccountId?: string;
  debtType?: Exclude<LiabilityKind, "credit_card">;
  currencyCode?: "COP" | "USD";
  principal?: number;
  openingExchangeRate?: number;
  termId?: string;
  rateId?: string;
  termsStartOn?: string;
  termsEndOn?: string;
  paymentFrequency?: ObligationPaymentFrequency;
  intervalCount?: number;
  calculationMethod?: LiabilityCalculationMethod;
  amortizationMethod?: ObligationAmortizationMethod;
  firstDueOn?: string;
  installmentCount?: number;
  scheduledPayment?: number;
  periodicFee?: number;
  periodicInsurance?: number;
  variableRate?: boolean;
  indexName?: string;
  spreadRate?: number;
  prepaymentStrategy?: ObligationPrepaymentStrategy | "manual";
  rateBasis?: LiabilityRateBasis;
  rateValue?: number;
  effectiveAnnualRate?: number;
  schedule?: LiabilityObligationInput[];
  /** Explicit destructive intent. Undefined fields are otherwise preserved remotely. */
  clearFundingAccount?: boolean;
  clearRate?: boolean;
  clearSchedule?: boolean;
};

export type FinancialTargetInput = Omit<FinancialTarget,
  "id" | "createdAt" | "updatedAt" | "completedAt" | "archivedAt" | "syncStatus" | "pendingOperationId"
> & {
  id?: string;
  debt?: FinancialTargetDebtInput;
};

export type FinancialTargetEntryInput = Omit<FinancialTargetEntry,
  "id" | "createdAt" | "syncStatus" | "pendingOperationId"
> & { id?: string };

export type FinanceSnapshot = {
  month: string;
  income: number;
  expense: number;
  accountBalances: Record<string, number>;
  accountBalancesBase?: Record<string, number>;
  /** All-time movement counts used to enforce immutable account currency even when history is paginated. */
  accountMovementCounts?: Record<string, number>;
  netWorth?: number;
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
  currencyCode: string;
  entityId?: string;
  entityName?: string;
  entityColor?: string;
  entityIcon?: string;
  archived: boolean;
  nativeOpeningBalance: number;
  nativeClosingBalance: number;
  nativeIncome: number;
  nativeExpense: number;
  nativeTransferIn: number;
  nativeTransferOut: number;
  nativeNetFlow: number;
  reportingOpeningBalance: number;
  reportingClosingBalance: number;
  reportingIncome: number;
  reportingExpense: number;
  reportingTransferIn: number;
  reportingTransferOut: number;
  reportingNetFlow: number;
};

export type DetailedReportEntity = {
  key: string;
  id?: string;
  name: string;
  color: string;
  icon: string;
  accountCount: number;
  reportingOpeningBalance: number;
  reportingClosingBalance: number;
  reportingNetFlow: number;
  nativeTotals: Array<{
    currencyCode: string;
    openingBalance: number;
    closingBalance: number;
    netFlow: number;
  }>;
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
  reportingCurrencyCode: string;
  summary: FinanceReportSummary;
  comparison: FinanceReportSummary | null;
  series: DetailedReportSeriesPoint[];
  groups: DetailedReportGroup[];
  incomeTypes: DetailedReportIncomeType[];
  accounts: DetailedReportAccount[];
  entities: DetailedReportEntity[];
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

export type PlannerImportMutationInput = {
  account: Account;
  createAccount: boolean;
  reconcileInitialBalance: boolean;
  categories: CategoryInput[];
  incomeTypes: IncomeTypeInput[];
  transactions: TransactionInput[];
};

export type AccountUpdateInput = {
  account: Account;
  targetBalance?: number;
  adjustmentDate: string;
  exchangeRate?: number;
  referenceExchangeRate?: number;
  referenceRateSource?: "sfc_trm" | "manual" | "imported";
};

export type FinanceState = {
  profile: FinanceProfile | null;
  accountEntities: AccountEntity[];
  accounts: Account[];
  creditCards: CreditCardProfile[];
  creditCardStatements: CreditCardStatement[];
  creditCardPurchasePlans: CreditCardPurchasePlan[];
  creditCardInstallments: CreditCardInstallment[];
  liabilities: Liability[];
  liabilityTerms: LiabilityTerms[];
  liabilityRatePeriods: LiabilityRatePeriod[];
  liabilityObligations: LiabilityObligation[];
  liabilityPaymentRules: LiabilityPaymentRule[];
  liabilityPaymentIntents: LiabilityPaymentIntent[];
  liabilityOverview: LiabilityOverview;
  liabilityCalendar: LiabilityCalendarItem[];
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
  /** Destination amount for cross-currency transfers. */
  destinationAmount?: number;
  /** Optional conversion or transfer fee charged in the source account currency. */
  feeAmount?: number;
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
  exchangeRate?: number;
  exchangeRateDate?: string;
  exchangeRateSource?: "manual" | "provider" | "imported";
  referenceExchangeRate?: number;
  referenceRateSource?: "sfc_trm" | "manual" | "imported";
};

export type RecurringRuleInput = Omit<RecurringRule,
  "id" | "createdAt" | "updatedAt" | "nextRunOn" | "syncStatus" | "pendingOperationId"
> & { id?: string };

export type QueueItem = {
  id: string;
  userId: string;
  operation: "transaction.create" | "transaction.update" | "transaction.import" | "planner.import" | "transaction.delete" | "credit-card.upsert" | "credit-card.purchase.create" | "credit-card.statement.upsert" | "liability.upsert" | "liability.terms.upsert" | "liability.obligation.upsert" | "liability.payment-rule.upsert" | "liability.payment.record" | "liability.archive" | "recurring-rule.upsert" | "recurring-rule.archive" | "recurring-occurrence.update" | "financial-target.upsert" | "financial-target.status" | "financial-target-entry.upsert" | "financial-target-entry.delete" | "budget.upsert" | "budget-plan.set" | "account-entity.upsert" | "account-entity.archive" | "account.create" | "account.update" | "account.archive" | "category.create" | "category.import" | "category.upsert" | "category.archive" | "category.order" | "income-type.upsert" | "income-type.import" | "income-type.archive" | "finance-group.upsert" | "finance-group.archive" | "profile.update" | "allocation.set";
  payload: unknown;
  createdAt: string;
  /** Orden durable asignado dentro de la misma transacción que estado + WAL. */
  sequence?: number;
  attempts?: number;
  lastError?: string;
};

export type ProfileInput = Pick<FinanceProfile, "displayName" | "currencyCode" | "timezone" | "weekStartsOn" | "monthStartsOn" | "themeMode" | "colorTheme" | "customThemeColor">;

/**
 * Confidence is independent from the obligation status. A reconciled snapshot
 * can be confirmed while its future schedule remains calculated or approximate.
 */
export type ObligationCertainty = "confirmed" | "calculated" | "approximate" | "manual";
export type ObligationCurrencyCode = "COP" | "USD" | "UVR";
export type ObligationRateConvention = "EA" | "EM" | "NMV" | "nominal";
export type ObligationDayCountBasis = 360 | 365;
export type ObligationAmortizationMethod =
  | "constant_payment"
  | "constant_principal"
  | "interest_only"
  | "balloon"
  | "manual";
export type ObligationInterestAccrual = "periodic" | "actual_days";
export type ObligationPaymentFrequency =
  | "weekly"
  | "biweekly"
  | "semimonthly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "irregular";
export type ObligationChargeKind = "insurance" | "fee" | "tax" | "collection" | "other";
export type ObligationPrepaymentStrategy = "reduce_term" | "reduce_payment";

/** Percent values are user-facing percentages: 12 means 12%, not 0.12. */
export type ObligationRateInput = {
  percent: number;
  convention: ObligationRateConvention;
  /** Required for a generic nominal rate. NMV always uses twelve periods. */
  periodsPerYear?: number;
  /** Used when daily accrual must choose a contractual 360/365-day basis. */
  dayCountBasis?: ObligationDayCountBasis;
};

export type ObligationRateSnapshot = {
  effectiveOn: string;
  /** Last date covered by this quote. Later periods become approximate. */
  validUntil?: string;
  rate: ObligationRateInput;
  certainty?: Exclude<ObligationCertainty, "manual">;
  referenceValue?: number;
};

export type ObligationIndexValue = {
  on: string;
  value: number;
  certainty?: Exclude<ObligationCertainty, "manual">;
};

export type ObligationRateModel =
  | {
      kind: "fixed";
      rate: ObligationRateInput;
    }
  | {
      kind: "variable";
      benchmark: "IBR" | "DTF" | "IPC" | "other";
      /** Snapshots contain the all-in contractual rate after any spread. */
      snapshots: ObligationRateSnapshot[];
      spreadPercent?: number;
      resetEveryMonths?: number;
    }
  | {
      kind: "indexed";
      index: "UVR" | "IPC" | "other";
      /** Real or contractual interest rate applied after indexation. */
      rate: ObligationRateInput;
      /** UVR uses unit; IPC-style balances may use balance_adjustment. */
      principalMode: "unit" | "balance_adjustment";
      indexValues: ObligationIndexValue[];
    };

export type ObligationCharge = {
  id: string;
  name: string;
  kind: ObligationChargeKind;
  calculation: "fixed" | "opening_balance_percent";
  /** Amount in the obligation currency when calculation is fixed. */
  amount?: number;
  /** Periodic percentage when calculation uses opening balance. */
  percent?: number;
  fromInstallment?: number;
  toInstallment?: number;
};

export type ObligationManualPayment = {
  dueOn: string;
  principal: number;
  interest?: number;
  charges?: Array<Pick<ObligationCharge, "id" | "name" | "kind"> & { amount: number }>;
};

type ObligationScheduleBaseInput = {
  principal: number;
  currencyCode: ObligationCurrencyCode;
  startOn: string;
  firstDueOn: string;
  installmentCount: number;
  /** Defaults to monthly for legacy/local callers. */
  paymentFrequency?: ObligationPaymentFrequency;
  /** Every N weeks, 14-day blocks, months, quarters or years. */
  intervalCount?: number;
  /** Stable primary anchor; defaults to the day in firstDueOn. */
  firstDueDay?: number;
  /** Required by semimonthly; 29-31 clamp to the month's last valid day. */
  secondDueDay?: number;
  interestAccrual?: ObligationInterestAccrual;
  charges?: ObligationCharge[];
  /** Overrides the canonical COP=0, USD=2 and UVR=8 decimal contract. */
  roundingDecimals?: number;
};

export type ObligationScheduleInput = ObligationScheduleBaseInput & (
  | {
      amortization: Exclude<ObligationAmortizationMethod, "manual">;
      rate: ObligationRateModel;
      manualPayments?: never;
    }
  | {
      amortization: "manual";
      rate?: ObligationRateModel;
      manualPayments: ObligationManualPayment[];
    }
);

export type ObligationScheduleCharge = {
  id: string;
  name: string;
  kind: ObligationChargeKind;
  amount: number;
};

export type ObligationScheduleRow = {
  installmentNumber: number;
  periodStart: string;
  dueOn: string;
  currencyCode: ObligationCurrencyCode;
  certainty: ObligationCertainty;
  openingPrincipal: number;
  indexAdjustment: number;
  principal: number;
  interest: number;
  charges: ObligationScheduleCharge[];
  insurance: number;
  fees: number;
  otherCharges: number;
  total: number;
  closingPrincipal: number;
  effectiveAnnualRatePercent?: number;
  indexValue?: number;
  reportingCurrencyCode?: "COP";
  reportingTotal?: number;
  reportingClosingPrincipal?: number;
};

export type ObligationSchedule = {
  currencyCode: ObligationCurrencyCode;
  certainty: ObligationCertainty;
  rows: ObligationScheduleRow[];
  totalPrincipal: number;
  totalInterest: number;
  totalInsurance: number;
  totalFees: number;
  totalOtherCharges: number;
  totalPayments: number;
  remainingPrincipal: number;
};

export type ObligationArrearsInput = {
  currencyCode: ObligationCurrencyCode;
  overduePrincipal: number;
  dueOn: string;
  asOf: string;
  defaultRate: ObligationRateInput;
  currentInterest?: number;
  insurance?: number;
  fees?: number;
  collectionCosts?: number;
  roundingDecimals?: number;
};

export type ObligationArrears = {
  currencyCode: ObligationCurrencyCode;
  daysLate: number;
  overduePrincipal: number;
  currentInterest: number;
  defaultInterest: number;
  insurance: number;
  fees: number;
  collectionCosts: number;
  total: number;
};

export type ObligationPrepaymentInput = {
  on: string;
  amount: number;
  strategy: ObligationPrepaymentStrategy;
  dueInterest?: number;
  dueCharges?: number;
};

export type ObligationPrepaymentResult = {
  strategy: ObligationPrepaymentStrategy;
  paidOn: string;
  amount: number;
  appliedToCharges: number;
  appliedToInterest: number;
  appliedToPrincipal: number;
  unappliedAmount: number;
  lockedRows: ObligationScheduleRow[];
  futureSchedule: ObligationSchedule;
};

export type ObligationReconciliationInput = {
  asOf: string;
  confirmedPrincipal: number;
  confirmedAccruedInterest?: number;
  confirmedInsurance?: number;
  confirmedFees?: number;
  sourceReference?: string;
};

export type ObligationReconciliationResult = {
  asOf: string;
  certainty: "confirmed";
  sourceReference?: string;
  projectedPrincipal: number;
  confirmedPrincipal: number;
  principalDifference: number;
  confirmedAccruedInterest: number;
  confirmedInsurance: number;
  confirmedFees: number;
  lockedRows: ObligationScheduleRow[];
  futureSchedule: ObligationSchedule;
};
