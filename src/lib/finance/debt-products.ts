import type {
  LiabilityKind,
  ObligationAmortizationMethod,
  ObligationPrepaymentStrategy,
} from "@/lib/finance/types";

export type DebtProductType =
  | "person"
  | "consumer"
  | "vehicle"
  | "mortgage_cop"
  | "mortgage_uvr"
  | "payroll"
  | "education"
  | "business"
  | "bnpl"
  | "other";

export type DebtCalculationMethod = ObligationAmortizationMethod | "zero_interest";
export type DebtPaymentFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly" | "quarterly" | "yearly" | "irregular";

export type DebtProductPreset = {
  value: DebtProductType;
  label: string;
  shortLabel: string;
  description: string;
  example: string;
  icon: string;
  calculationMethod: DebtCalculationMethod;
  paymentFrequency: DebtPaymentFrequency;
  prepaymentStrategy: ObligationPrepaymentStrategy;
  indexName?: "UVR";
  showCreditor: boolean;
};

/**
 * The product name only changes the questions and sensible defaults. It never
 * changes a balance by itself; the linked account and ledger stay authoritative.
 */
export const debtProductPresets: readonly DebtProductPreset[] = [
  {
    value: "person",
    label: "Préstamo de una persona",
    shortLabel: "Persona",
    description: "Dinero prestado por un familiar, amigo u otra persona.",
    example: "Ej. Préstamo de mamá",
    icon: "person",
    calculationMethod: "zero_interest",
    paymentFrequency: "monthly",
    prepaymentStrategy: "reduce_term",
    showCreditor: true,
  },
  {
    value: "consumer",
    label: "Crédito de banco o cooperativa",
    shortLabel: "Crédito",
    description: "Libre inversión, consumo u otro préstamo con cuotas.",
    example: "Ej. Libre inversión Bancolombia",
    icon: "landmark",
    calculationMethod: "constant_payment",
    paymentFrequency: "monthly",
    prepaymentStrategy: "reduce_term",
    showCreditor: true,
  },
  {
    value: "vehicle",
    label: "Crédito de vehículo",
    shortLabel: "Vehículo",
    description: "Financiación para carro, moto u otro vehículo.",
    example: "Ej. Crédito del carro",
    icon: "car",
    calculationMethod: "constant_payment",
    paymentFrequency: "monthly",
    prepaymentStrategy: "reduce_term",
    showCreditor: true,
  },
  {
    value: "mortgage_cop",
    label: "Crédito de vivienda en pesos",
    shortLabel: "Vivienda COP",
    description: "Crédito hipotecario cuyo saldo está expresado en pesos.",
    example: "Ej. Crédito de mi apartamento",
    icon: "house",
    calculationMethod: "constant_payment",
    paymentFrequency: "monthly",
    prepaymentStrategy: "reduce_term",
    showCreditor: true,
  },
  {
    value: "mortgage_uvr",
    label: "Crédito de vivienda en UVR",
    shortLabel: "Vivienda UVR",
    description: "El saldo cambia con la UVR; Moneva separa ese ajuste de los intereses.",
    example: "Ej. Hipoteca UVR",
    icon: "building",
    calculationMethod: "constant_payment",
    paymentFrequency: "monthly",
    prepaymentStrategy: "reduce_term",
    indexName: "UVR",
    showCreditor: true,
  },
  {
    value: "payroll",
    label: "Libranza o descuento de nómina",
    shortLabel: "Libranza",
    description: "La cuota se descuenta directamente de tu salario o pensión.",
    example: "Ej. Libranza de nómina",
    icon: "commission",
    calculationMethod: "constant_payment",
    paymentFrequency: "monthly",
    prepaymentStrategy: "reduce_term",
    showCreditor: true,
  },
  {
    value: "education",
    label: "Crédito educativo",
    shortLabel: "Educación",
    description: "Financiación de matrícula, estudios o formación.",
    example: "Ej. Crédito de la universidad",
    icon: "education",
    calculationMethod: "constant_payment",
    paymentFrequency: "monthly",
    prepaymentStrategy: "reduce_term",
    showCreditor: true,
  },
  {
    value: "business",
    label: "Crédito para negocio",
    shortLabel: "Negocio",
    description: "Capital de trabajo, microcrédito o financiación empresarial.",
    example: "Ej. Crédito del emprendimiento",
    icon: "briefcase",
    calculationMethod: "constant_payment",
    paymentFrequency: "monthly",
    prepaymentStrategy: "reduce_term",
    showCreditor: true,
  },
  {
    value: "bnpl",
    label: "Compra financiada",
    shortLabel: "Compra a plazos",
    description: "Compra ahora y paga después, financiación directa o crédito de comercio.",
    example: "Ej. Celular a cuotas",
    icon: "shopping",
    calculationMethod: "zero_interest",
    paymentFrequency: "monthly",
    prepaymentStrategy: "reduce_term",
    showCreditor: true,
  },
  {
    value: "other",
    label: "Otra deuda",
    shortLabel: "Otra",
    description: "Un acuerdo que no encaja en las opciones anteriores.",
    example: "Ej. Deuda por pagar",
    icon: "circle-dollar-sign",
    calculationMethod: "manual",
    paymentFrequency: "irregular",
    prepaymentStrategy: "reduce_term",
    showCreditor: true,
  },
] as const;

export function debtProductPreset(value: string | undefined) {
  return debtProductPresets.find((item) => item.value === value) ?? debtProductPresets.at(-1)!;
}

export function debtCalculationLabel(method: DebtCalculationMethod) {
  if (method === "zero_interest") return "Sin intereses";
  if (method === "constant_payment") return "Cuota parecida cada periodo";
  if (method === "constant_principal") return "El mismo abono a capital";
  if (method === "interest_only") return "Intereses y capital al final";
  if (method === "balloon") return "Pago grande al final";
  return "Calendario escrito por ti";
}

export function debtFrequencyLabel(frequency: DebtPaymentFrequency) {
  if (frequency === "weekly") return "Cada semana";
  if (frequency === "biweekly") return "Cada 14 días";
  if (frequency === "semimonthly") return "Dos veces al mes";
  if (frequency === "monthly") return "Cada mes";
  if (frequency === "quarterly") return "Cada tres meses";
  if (frequency === "yearly") return "Cada año";
  return "Fechas irregulares";
}

export function debtNeedsRate(method: DebtCalculationMethod) {
  return method !== "zero_interest" && method !== "manual";
}

export function debtProductLiabilityKind(product: DebtProductType): Exclude<LiabilityKind, "credit_card"> {
  if (product === "person") return "personal_debt";
  if (product === "bnpl") return "bnpl";
  if (product === "other") return "other";
  return "loan";
}
