import { demoFinanceState } from "../../src/lib/finance/demo-data";
import type {
  Account,
  AccountEntity,
  Budget,
  Category,
  FinanceState,
  FinancialTarget,
  FinancialTargetEntry,
  MonthlyBudgetPlan,
  RecurringOccurrence,
  RecurringRule,
  Transaction,
} from "../../src/lib/finance/types";

export const STRESS_TRANSACTION_COUNT = 10_000;

const accountBlueprints: Array<Pick<Account, "name" | "type" | "initialBalance" | "color" | "icon">> = [
  { name: "Patrimonio familiar de muy largo plazo", type: "investment", initialBalance: 8_750_000_000_000, color: "#8b5cf6", icon: "chart-no-axes-combined" },
  { name: "Cuenta operativa empresarial principal", type: "checking", initialBalance: 150_000_000_000, color: "#2563eb", icon: "bank:bancolombia" },
  { name: "Crédito corporativo internacional", type: "credit", initialBalance: -975_000_000_000, color: "#ef4444", icon: "credit-card" },
  { name: "Reserva líquida de emergencias", type: "savings", initialBalance: 48_500_000_000, color: "#10b981", icon: "piggy-bank" },
  { name: "Caja menor", type: "cash", initialBalance: 95_000_000, color: "#f59e0b", icon: "banknote" },
  { name: "Cuenta conjunta para gastos del hogar", type: "savings", initialBalance: 12_600_000_000, color: "#06b6d4", icon: "wallet-cards" },
  { name: "Fondo para educación de la familia", type: "investment", initialBalance: 6_800_000_000, color: "#ec4899", icon: "landmark" },
  { name: "Cuenta de viajes y experiencias", type: "savings", initialBalance: 3_450_000_000, color: "#14b8a6", icon: "plane" },
  { name: "Tarjeta de compras recurrentes", type: "credit", initialBalance: -286_500_000, color: "#f97316", icon: "credit-card" },
  { name: "Efectivo en moneda local", type: "cash", initialBalance: 26_800_000, color: "#84cc16", icon: "coins" },
  { name: "Cuenta de ahorro para impuestos", type: "savings", initialBalance: 18_900_000_000, color: "#6366f1", icon: "shield-check" },
  { name: "Inversiones alternativas de alta volatilidad", type: "investment", initialBalance: 725_000_000_000, color: "#a855f7", icon: "trending-up" },
];

const expenseBlueprints = [
  ["Alimentación y mercado del hogar", "needs", "utensils"],
  ["Vivienda, administración y servicios", "needs", "home"],
  ["Transporte cotidiano y viajes", "needs", "car"],
  ["Salud, bienestar y medicamentos", "needs", "heart-pulse"],
  ["Educación y formación profesional", "needs", "book-open"],
  ["Entretenimiento digital y experiencias", "wants", "sparkles"],
  ["Restaurantes, cafés y domicilios", "wants", "coffee"],
  ["Ropa, tecnología y compras personales", "wants", "shopping-cart"],
  ["Vacaciones y actividades recreativas", "wants", "plane"],
  ["Fondo de emergencia familiar", "savings", "shield-check"],
  ["Ahorro para proyectos de largo plazo", "savings", "piggy-bank"],
  ["Inversiones diversificadas", "investments", "chart-no-axes-combined"],
  ["Aportes voluntarios a pensión", "investments", "landmark"],
  ["Pago de tarjetas de crédito", "debts", "credit-card"],
  ["Créditos y obligaciones financieras", "debts", "hand-coins"],
] as const;

const incomeBlueprints = [
  ["Salario y compensación mensual", "briefcase"],
  ["Honorarios y proyectos independientes", "laptop"],
  ["Rendimientos e intereses", "trending-up"],
  ["Ventas, bonos y otros ingresos", "coins"],
] as const;

const colors = ["#2563eb", "#06b6d4", "#10b981", "#84cc16", "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#8b5cf6"];

function isoMonth(monthOffset: number) {
  const date = new Date(Date.UTC(2026, 7 - monthOffset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function createEntities(): AccountEntity[] {
  return [
    { id: "stress-entity-bank", name: "Entidad financiera con un nombre excepcionalmente largo", color: "#2563eb", icon: "landmark", sortOrder: 0, version: 1 },
    { id: "stress-entity-wallet", name: "Billeteras y bolsillos digitales", color: "#06b6d4", icon: "wallet-cards", sortOrder: 1, version: 1 },
    { id: "stress-entity-invest", name: "Plataforma de inversiones internacionales", color: "#8b5cf6", icon: "chart-no-axes-combined", sortOrder: 2, version: 1 },
  ];
}

function createAccounts(): Account[] {
  const entityIds = ["stress-entity-invest", "stress-entity-bank", "stress-entity-bank", "stress-entity-wallet"];
  const usdAccounts = new Set([0, 2, 6, 11]);
  return accountBlueprints.map((account, index) => ({
    ...account,
    id: `stress-account-${index + 1}`,
    currencyCode: usdAccounts.has(index) ? "USD" : "COP",
    openingBalanceDate: "2022-01-01",
    openingExchangeRate: usdAccounts.has(index) ? 4_050 : 1,
    entityId: index === 4 ? undefined : entityIds[index % entityIds.length],
    archived: index === 10,
    archivedAt: index === 10 ? "2026-07-31T12:00:00.000Z" : undefined,
    version: 1,
  }));
}

function createCategories(): Category[] {
  const expenses = expenseBlueprints.map(([name, group, icon], index) => ({
    id: `stress-expense-category-${index + 1}`,
    name,
    group,
    mainCategoryId: group,
    color: colors[index % colors.length],
    icon,
    kind: "expense" as const,
    sortOrder: index,
  }));
  const incomes = incomeBlueprints.map(([name, icon], index) => ({
    id: `stress-income-category-${index + 1}`,
    name,
    group: "income",
    color: colors[(index + 2) % colors.length],
    icon,
    kind: "income" as const,
    sortOrder: index,
  }));
  return [...incomes, ...expenses];
}

function amountFor(index: number) {
  if (index <= 1) return 4_500_000_000_000;
  if (index === 2) return 875_000_000_000;
  if (index === 3) return 100_000_000_000;
  if (index === 48) return 3_500_000_000_000;
  return 18_900 + ((index * 97_531 + (index % 23) * 10_000_019) % 987_000_000);
}

function createTransactions(accounts: Account[], categories: Category[], count: number): Transaction[] {
  const expenseCategories = categories.filter((category) => category.kind === "expense");
  const incomeCategories = categories.filter((category) => category.kind === "income");
  const rows: Transaction[] = [];

  for (let index = 0; index < count; index += 1) {
    const transferPairIndex = Math.floor(index / 50);
    const isTransferOut = index % 50 === 0;
    const isTransferIn = index % 50 === 1;
    const isIncome = !isTransferOut && !isTransferIn && (index % 8 === 2 || index === 48);
    const month = isoMonth(index % 48);
    const day = String((index % 28) + 1).padStart(2, "0");
    const occurredOn = `${month}-${day}`;
    const createdAt = `${occurredOn}T${String(index % 24).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00.000Z`;
    const amount = amountFor(index);
    const source = accounts[index % accounts.length];
    const destination = accounts[(index + 3) % accounts.length];
    const category = isIncome ? incomeCategories[index % incomeCategories.length] : expenseCategories[index % expenseCategories.length];
    const longTail = index % 211 === 0 ? " — descripción extraordinariamente extensa para comprobar truncamiento, lectura y jerarquía visual sin romper la cuadrícula" : "";

    const transactionAccount = isTransferIn ? destination : source;
    const nativeCurrencyCode = transactionAccount.currencyCode ?? "COP";
    const exchangeRate = nativeCurrencyCode === "USD" ? 4_050 + (index % 320) : 1;
    rows.push({
      id: `stress-transaction-${String(index + 1).padStart(5, "0")}`,
      kind: isTransferOut ? "transfer_out" : isTransferIn ? "transfer_in" : isIncome ? "income" : "expense",
      amount,
      accountId: isTransferIn ? destination.id : source.id,
      categoryId: isTransferOut || isTransferIn ? undefined : category.id,
      transferGroupId: isTransferOut || isTransferIn ? `stress-transfer-${String(transferPairIndex + 1).padStart(4, "0")}` : undefined,
      description: `${isTransferOut || isTransferIn ? "Transferencia patrimonial" : isIncome ? "Ingreso registrado" : "Compra y pago registrado"} ${index + 1}${longTail}`,
      merchant: index % 17 === 0 ? "Comercio con un nombre deliberadamente largo para validar la interfaz" : `Comercio ${String((index % 137) + 1).padStart(3, "0")}`,
      note: index % 137 === 0 ? "Nota extensa con referencias, aclaraciones y contexto financiero para una prueba visual realista." : undefined,
      icon: isIncome ? "coins" : isTransferOut || isTransferIn ? "hand-coins" : category.icon,
      occurredOn,
      createdAt,
      syncStatus: "synced",
      nativeCurrencyCode,
      baseCurrencyCode: "COP",
      baseAmount: amount * exchangeRate,
      exchangeRate,
      exchangeRateDate: occurredOn,
      exchangeRateSource: nativeCurrencyCode === "USD" ? "provider" : "same_currency",
      referenceExchangeRate: nativeCurrencyCode === "USD" ? exchangeRate : 1,
      referenceRateSource: nativeCurrencyCode === "USD" ? "sfc_trm" : undefined,
      version: 1,
    });
  }

  return rows.sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

function createBudgets(categories: Category[]): { budgets: Budget[]; plans: MonthlyBudgetPlan[]; months: string[] } {
  const expenses = categories.filter((category) => category.kind === "expense");
  const months = Array.from({ length: 48 }, (_, index) => `${isoMonth(index)}-01`);
  const budgets = months.flatMap((month, monthIndex) => expenses.map((category, categoryIndex) => ({
    id: `stress-budget-${month}-${categoryIndex + 1}`,
    categoryId: category.id,
    month,
    amount: 75_000_000 + ((monthIndex + 1) * (categoryIndex + 7) * 31_337) % 9_500_000_000,
  })));
  const plans = months.map((month, index) => ({ month, incomeTarget: 250_000_000_000 + index * 2_500_000_000, source: "historical" as const }));
  return { budgets, plans, months };
}

function createTargets(accounts: Account[], categories: Category[]): { targets: FinancialTarget[]; entries: FinancialTargetEntry[] } {
  const expenseCategories = categories.filter((category) => category.kind === "expense");
  const targets: FinancialTarget[] = Array.from({ length: 18 }, (_, index) => ({
    id: `stress-target-${index + 1}`,
    mode: index % 4 === 0 ? "pay_down" : "accumulate",
    kind: index % 4 === 0 ? "debt" : index % 3 === 0 ? "investment" : "savings",
    status: index < 12 ? "active" : "completed",
    title: index % 5 === 0 ? `Objetivo financiero de nombre especialmente largo ${index + 1}` : `Objetivo financiero ${index + 1}`,
    description: "Escenario de alta escala para comprobar avances, porcentajes y cifras financieras grandes.",
    targetAmount: 150_000_000_000 + index * 275_000_000_000,
    initialProgress: 12_500_000_000 + index * 1_250_000_000,
    progressAmount: 12_500_000_000 + index * 1_250_000_000,
    startsOn: "2024-01-01",
    targetDate: "2032-12-31",
    priority: index + 1,
    color: colors[index % colors.length],
    icon: index % 4 === 0 ? "landmark" : "flag",
    accountId: accounts[index % accounts.length].id,
    categoryId: expenseCategories[index % expenseCategories.length].id,
    trackingMode: "movements",
    createdAt: "2024-01-01T12:00:00.000Z",
    updatedAt: "2026-08-25T12:00:00.000Z",
    completedAt: index >= 12 ? "2026-07-01T12:00:00.000Z" : undefined,
    syncStatus: "synced",
  }));
  const entries: FinancialTargetEntry[] = Array.from({ length: 360 }, (_, index) => ({
    id: `stress-target-entry-${index + 1}`,
    targetId: targets[index % targets.length].id,
    kind: index % 7 === 0 ? "withdrawal" : "contribution",
    effect: index % 7 === 0 ? "reverse" : "advance",
    amount: 5_000_000 + (index * 1_337_777) % 650_000_000,
    occurredOn: `${isoMonth(index % 48)}-${String((index % 28) + 1).padStart(2, "0")}`,
    createdAt: `${isoMonth(index % 48)}-15T12:00:00.000Z`,
    syncStatus: "synced",
  }));
  return { targets, entries };
}

function createRecurring(accounts: Account[], categories: Category[]): { rules: RecurringRule[]; occurrences: RecurringOccurrence[] } {
  const expenseCategories = categories.filter((category) => category.kind === "expense");
  const incomeCategories = categories.filter((category) => category.kind === "income");
  const rules: RecurringRule[] = Array.from({ length: 36 }, (_, index) => {
    const income = index % 7 === 0;
    return {
      id: `stress-rule-${index + 1}`,
      kind: income ? "income" : "expense",
      amount: 950_000 + index * 125_000_000,
      accountId: accounts[index % accounts.length].id,
      categoryId: (income ? incomeCategories : expenseCategories)[index % (income ? incomeCategories.length : expenseCategories.length)].id,
      description: `${income ? "Ingreso" : "Suscripción"} programado ${index + 1}`,
      merchant: `Servicio recurrente ${index + 1}`,
      icon: income ? "briefcase" : "repeat-2",
      cadence: "monthly",
      intervalCount: 1,
      startsOn: "2026-01-01",
      anchorDay: (index % 28) + 1,
      postingPolicy: "scheduled_date",
      timezone: "America/Bogota",
      autoPost: true,
      includeInBudget: !income,
      includeInIncomeTarget: income,
      status: "active",
      nextRunOn: `2026-08-${String((index % 28) + 1).padStart(2, "0")}`,
      createdAt: "2026-01-01T12:00:00.000Z",
      updatedAt: "2026-08-25T12:00:00.000Z",
      syncStatus: "synced",
    } satisfies RecurringRule;
  });
  const occurrences: RecurringOccurrence[] = Array.from({ length: 432 }, (_, index) => {
    const rule = rules[index % rules.length];
    const month = isoMonth(index % 12);
    const day = String(rule.anchorDay).padStart(2, "0");
    return {
      id: `stress-occurrence-${index + 1}`,
      ruleId: rule.id,
      kind: rule.kind,
      scheduledOn: `${month}-${day}`,
      effectiveOn: `${month}-${day}`,
      amount: rule.amount,
      accountId: rule.accountId,
      categoryId: rule.categoryId,
      description: rule.description,
      merchant: rule.merchant,
      icon: rule.icon,
      status: month === "2026-08" ? "planned" : "posted",
      createdAt: `${month}-01T12:00:00.000Z`,
    } satisfies RecurringOccurrence;
  });
  return { rules, occurrences };
}

export function createStressFinanceState(transactionCount = STRESS_TRANSACTION_COUNT): FinanceState {
  const accounts = createAccounts();
  const accountEntities = createEntities();
  const categories = createCategories();
  const transactions = createTransactions(accounts, categories, transactionCount);
  const { budgets, plans, months } = createBudgets(categories);
  const { targets, entries } = createTargets(accounts, categories);
  const { rules, occurrences } = createRecurring(accounts, categories);

  return {
    ...structuredClone(demoFinanceState),
    profile: {
      ...structuredClone(demoFinanceState.profile!),
      id: "demo",
      displayName: "Valentín Prueba de Escala",
      themeMode: "dark",
      colorTheme: "crimson",
    },
    accounts,
    accountEntities,
    categories,
    transactions,
    recurringRules: rules,
    recurringOccurrences: occurrences,
    financialTargets: targets,
    financialTargetEntries: entries,
    financialTargetDebts: targets.filter((target) => target.mode === "pay_down").map((target, index) => ({
      targetId: target.id,
      creditor: `Entidad financiera ${index + 1}`,
      annualInterestRate: 18.5 + index,
      minimumPayment: 850_000_000 + index * 50_000_000,
      dueDay: (index % 28) + 1,
    })),
    budgets,
    monthlyBudgetPlans: plans,
    budgetMonthsLoaded: months,
    snapshot: undefined,
  };
}
