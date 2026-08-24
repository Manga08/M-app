import type { FinanceState } from "./types";

const today = "2026-08-17";

export const demoFinanceState: FinanceState = {
  profile: {
    id: "demo",
    email: "demo@moneva.local",
    displayName: "Andrés",
    currencyCode: "COP",
    timezone: "America/Bogota",
    weekStartsOn: 1,
    monthStartsOn: 1,
    themeMode: "system",
    colorTheme: "moneva",
  },
  accounts: [
    { id: "acc-bancolombia", name: "Bancolombia", type: "checking", initialBalance: 3240000, color: "#f4c84a", icon: "bank:bancolombia" },
    { id: "acc-nequi", name: "Nequi", type: "savings", initialBalance: 680000, color: "#c36bf2", icon: "bank:nequi" },
    { id: "acc-cash", name: "Efectivo", type: "cash", initialBalance: 210000, color: "#32c792", icon: "banknote" },
    { id: "acc-visa", name: "Visa terminada en 4242", type: "credit", initialBalance: -410000, color: "#60a5fa", icon: "brand:visa" },
  ],
  categories: [
    { id: "cat-salary", name: "Nómina", group: "income", color: "#38d39f", icon: "briefcase", kind: "income", isDefault: true, sortOrder: 0 },
    { id: "cat-other-income", name: "Otros ingresos", group: "income", color: "#78d8b6", icon: "coins", kind: "income", isDefault: true, sortOrder: 1 },
    { id: "cat-food", name: "Alimentación", group: "needs", color: "#55a8f8", icon: "utensils", kind: "expense", isDefault: true, sortOrder: 0 },
    { id: "cat-home", name: "Vivienda", group: "needs", color: "#55a8f8", icon: "home", kind: "expense", isDefault: true, sortOrder: 1 },
    { id: "cat-transport", name: "Transporte", group: "needs", color: "#55a8f8", icon: "car", kind: "expense", isDefault: true, sortOrder: 2 },
    { id: "cat-health", name: "Salud", group: "needs", color: "#55a8f8", icon: "heart-pulse", kind: "expense", isDefault: true, sortOrder: 3 },
    { id: "cat-fun", name: "Entretenimiento", group: "wants", color: "#fb7185", icon: "sparkles", kind: "expense", isDefault: true, sortOrder: 0 },
    { id: "cat-eating-out", name: "Comidas fuera", group: "wants", color: "#fb7185", icon: "coffee", kind: "expense", isDefault: true, sortOrder: 1 },
    { id: "cat-savings", name: "Fondo de emergencia", group: "savings", color: "#34d399", icon: "piggy-bank", kind: "expense", isDefault: true, sortOrder: 0 },
    { id: "cat-investments", name: "Inversiones", group: "investments", color: "#a78bfa", icon: "chart", kind: "expense", isDefault: true, sortOrder: 0 },
    { id: "cat-debts", name: "Pago de deudas", group: "debts", color: "#fb923c", icon: "landmark", kind: "expense", isDefault: true, sortOrder: 0 },
  ],
  budgets: [
    { id: "bud-food", categoryId: "cat-food", month: "2026-08-01", amount: 900000 },
    { id: "bud-home", categoryId: "cat-home", month: "2026-08-01", amount: 750000 },
    { id: "bud-transport", categoryId: "cat-transport", month: "2026-08-01", amount: 250000 },
    { id: "bud-health", categoryId: "cat-health", month: "2026-08-01", amount: 100000 },
    { id: "bud-fun", categoryId: "cat-fun", month: "2026-08-01", amount: 550000 },
    { id: "bud-eating", categoryId: "cat-eating-out", month: "2026-08-01", amount: 650000 },
    { id: "bud-savings", categoryId: "cat-savings", month: "2026-08-01", amount: 800000 },
    { id: "bud-invest", categoryId: "cat-investments", month: "2026-08-01", amount: 400000 },
    { id: "bud-debt", categoryId: "cat-debts", month: "2026-08-01", amount: 300000 },
  ],
  monthlyBudgetPlans: [
    { month: "2026-08-01", incomeTarget: 4_000_000, source: "manual" },
  ],
  budgetMonthsLoaded: ["2026-08-01"],
  groupAllocations: [
    { id: "allocation-needs", group: "needs", name: "Necesidades", color: "#55a8f8", icon: "home", targetPercent: 50, includedInPlan: true, sortOrder: 0, isDefault: true },
    { id: "allocation-wants", group: "wants", name: "Gustos", color: "#fb7185", icon: "sparkles", targetPercent: 30, includedInPlan: true, sortOrder: 1, isDefault: true },
    { id: "allocation-savings", group: "savings", name: "Ahorros", color: "#34d399", icon: "piggy-bank", targetPercent: 10, includedInPlan: true, sortOrder: 2, isDefault: true },
    { id: "allocation-investments", group: "investments", name: "Inversiones", color: "#a78bfa", icon: "chart-no-axes-combined", targetPercent: 10, includedInPlan: true, sortOrder: 3, isDefault: true },
    { id: "allocation-debts", group: "debts", name: "Deudas", color: "#fb923c", icon: "landmark", targetPercent: 0, includedInPlan: true, sortOrder: 4, isDefault: true },
  ],
  recurringRules: [
    {
      id: "rule-spotify", kind: "expense", amount: 23_900, accountId: "acc-visa", categoryId: "cat-fun",
      description: "Spotify", merchant: "Spotify", icon: "brand:spotify", cadence: "monthly", intervalCount: 1,
      startsOn: "2026-08-20", anchorDay: 20, postingPolicy: "scheduled_date", timezone: "America/Bogota",
      autoPost: true, includeInBudget: true, includeInIncomeTarget: false, status: "active", nextRunOn: "2026-08-20",
      createdAt: "2026-08-01T12:00:00Z", updatedAt: "2026-08-01T12:00:00Z", syncStatus: "synced",
    },
    {
      id: "rule-salary", kind: "income", amount: 4_000_000, accountId: "acc-bancolombia", categoryId: "cat-salary",
      description: "Nómina mensual", merchant: "Empresa", icon: "briefcase", cadence: "monthly", intervalCount: 1,
      startsOn: "2026-09-01", anchorDay: 1, postingPolicy: "month_start", timezone: "America/Bogota",
      autoPost: true, includeInBudget: false, includeInIncomeTarget: true, status: "active", nextRunOn: "2026-09-01",
      createdAt: "2026-08-01T12:00:00Z", updatedAt: "2026-08-01T12:00:00Z", syncStatus: "synced",
    },
  ],
  recurringOccurrences: [
    {
      id: "occ-spotify-aug", ruleId: "rule-spotify", kind: "expense", scheduledOn: "2026-08-20", effectiveOn: "2026-08-20",
      amount: 23_900, accountId: "acc-visa", categoryId: "cat-fun", description: "Spotify", merchant: "Spotify", icon: "brand:spotify",
      status: "planned", createdAt: "2026-08-01T12:00:00Z",
    },
    {
      id: "occ-salary-sep", ruleId: "rule-salary", kind: "income", scheduledOn: "2026-09-01", effectiveOn: "2026-09-01",
      amount: 4_000_000, accountId: "acc-bancolombia", categoryId: "cat-salary", description: "Nómina mensual", merchant: "Empresa", icon: "briefcase",
      status: "planned", createdAt: "2026-08-01T12:00:00Z",
    },
  ],
  financialTargets: [
    {
      id: "target-emergency", mode: "accumulate", kind: "emergency", status: "active",
      title: "Fondo de emergencia", description: "Tres meses de tranquilidad para cualquier imprevisto.",
      targetAmount: 6_000_000, initialProgress: 1_200_000, startsOn: "2026-01-01", targetDate: "2027-02-01",
      priority: 1, color: "#34d399", icon: "shield-check", accountId: "acc-nequi", categoryId: "cat-savings",
      trackingMode: "movements", createdAt: "2026-01-01T12:00:00Z", updatedAt: "2026-08-17T12:00:00Z", syncStatus: "synced",
    },
    {
      id: "target-visa", mode: "pay_down", kind: "debt", status: "active",
      title: "Salir de la tarjeta Visa", description: "Reducir el saldo sin volver a financiar compras nuevas.",
      targetAmount: 1_500_000, initialProgress: 500_000, startsOn: "2026-05-01", targetDate: "2026-12-01",
      priority: 2, color: "#fb923c", icon: "landmark", accountId: "acc-visa", categoryId: "cat-debts",
      trackingMode: "movements", createdAt: "2026-05-01T12:00:00Z", updatedAt: "2026-08-17T12:00:00Z", syncStatus: "synced",
    },
  ],
  financialTargetEntries: [],
  financialTargetDebts: [
    { targetId: "target-visa", creditor: "Visa", annualInterestRate: 24.5, minimumPayment: 180_000, dueDay: 12 },
  ],
  transactions: [
    { id: "tx-payroll", kind: "income", amount: 4000000, accountId: "acc-bancolombia", categoryId: "cat-salary", description: "Nómina de agosto", merchant: "Nómina", occurredOn: today, createdAt: `${today}T13:10:00Z`, syncStatus: "synced" },
    { id: "tx-market", kind: "expense", amount: 186400, accountId: "acc-nequi", categoryId: "cat-food", description: "Mercado semanal", merchant: "Mercado Central", occurredOn: today, createdAt: `${today}T15:42:00Z`, syncStatus: "synced" },
    { id: "tx-spotify", kind: "expense", amount: 23900, accountId: "acc-visa", categoryId: "cat-fun", description: "Spotify", merchant: "Spotify", occurredOn: "2026-08-16", createdAt: "2026-08-16T12:00:00Z", syncStatus: "synced" },
    { id: "tx-rent", kind: "expense", amount: 750000, accountId: "acc-bancolombia", categoryId: "cat-home", description: "Arriendo", merchant: "Administración", occurredOn: "2026-08-05", createdAt: "2026-08-05T14:00:00Z", syncStatus: "synced" },
    { id: "tx-transport", kind: "expense", amount: 172000, accountId: "acc-nequi", categoryId: "cat-transport", description: "Transporte del mes", merchant: "Movilidad", occurredOn: "2026-08-12", createdAt: "2026-08-12T16:20:00Z", syncStatus: "synced" },
    { id: "tx-eating", kind: "expense", amount: 332000, accountId: "acc-visa", categoryId: "cat-eating-out", description: "Restaurantes", merchant: "Varios", occurredOn: "2026-08-11", createdAt: "2026-08-11T19:10:00Z", syncStatus: "synced" },
    { id: "tx-fun", kind: "expense", amount: 354100, accountId: "acc-visa", categoryId: "cat-fun", description: "Entretenimiento", merchant: "Varios", occurredOn: "2026-08-09", createdAt: "2026-08-09T18:00:00Z", syncStatus: "synced" },
    { id: "tx-savings", kind: "expense", amount: 540000, accountId: "acc-bancolombia", categoryId: "cat-savings", financialTargetId: "target-emergency", financialTargetEffect: "advance", description: "Aporte fondo de emergencia", merchant: "Ahorro", occurredOn: "2026-08-03", createdAt: "2026-08-03T14:30:00Z", syncStatus: "synced" },
    { id: "tx-invest", kind: "expense", amount: 320000, accountId: "acc-bancolombia", categoryId: "cat-investments", description: "ETF global", merchant: "Trii", occurredOn: "2026-08-03", createdAt: "2026-08-03T15:00:00Z", syncStatus: "synced" },
    { id: "tx-debt", kind: "expense", amount: 252000, accountId: "acc-bancolombia", categoryId: "cat-debts", description: "Cuota tarjeta", merchant: "Visa", occurredOn: "2026-08-02", createdAt: "2026-08-02T13:00:00Z", syncStatus: "synced" },
  ],
};
