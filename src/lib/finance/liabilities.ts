import type {
  LiabilityKind,
  LiabilityObligation,
  LiabilityObligationInput,
  LiabilityObligationStatus,
  LiabilityOverviewItem,
  LiabilityPaymentRecordingMode,
  LiabilityPaymentStrategy,
  LiabilityStatus,
  ObligationCharge,
  ObligationRateInput,
  ObligationScheduleInput,
} from "@/lib/finance/types";
import { applyObligationPrepayment, generateObligationSchedule } from "@/lib/finance/obligations";

export function liabilityKindLabel(kind: LiabilityKind) {
  return ({
    credit_card: "Tarjeta de crédito",
    loan: "Crédito",
    personal_debt: "Deuda personal",
    bnpl: "Compra financiada",
    revolving_credit: "Crédito rotativo",
    other: "Otra deuda",
  } as const)[kind];
}

export function liabilityStatusLabel(status: LiabilityStatus) {
  return ({ active: "Activa", paused: "Pausada", settled: "Pagada", archived: "Archivada" } as const)[status];
}

export function liabilityObligationStatusLabel(status: LiabilityObligationStatus) {
  return ({
    projected: "Calculada",
    open: "Pendiente",
    due: "Por pagar",
    partial: "Pago parcial",
    paid: "Pagada",
    overdue: "Vencida",
    waived: "Perdonada",
    cancelled: "Cancelada",
  } as const)[status];
}

export function liabilityPaymentStrategyLabel(strategy: LiabilityPaymentStrategy) {
  return ({
    fixed: "Un valor fijo",
    minimum_due: "El pago mínimo",
    statement_total: "Todo el extracto",
    current_balance: "Todo el saldo pendiente",
  } as const)[strategy];
}

export function liabilityRecordingModeLabel(mode: LiabilityPaymentRecordingMode) {
  return mode === "auto_post" ? "Registrar automáticamente" : "Recordarme para confirmarlo";
}

export function actionableLiabilityObligations(obligations: LiabilityObligation[], today: string) {
  return obligations
    .filter((item) => !["paid", "waived", "cancelled"].includes(item.status))
    .toSorted((left, right) => {
      const leftOverdue = left.dueOn < today ? 0 : 1;
      const rightOverdue = right.dueOn < today ? 0 : 1;
      return leftOverdue - rightOverdue || left.dueOn.localeCompare(right.dueOn) || (left.sequenceNumber ?? 0) - (right.sequenceNumber ?? 0);
    });
}

export function nextLiabilityObligation(obligations: LiabilityObligation[], today: string) {
  return actionableLiabilityObligations(obligations, today)[0];
}

/**
 * Splits a real installment payment without counting interest or fees as
 * principal reduction. Contractual costs are consumed first, matching the
 * payment waterfall used by the projection engine. Credit-card statements
 * should opt out because their charges are already part of the card ledger.
 */
export function liabilityPaymentBreakdown(input: {
  amount: number;
  allocated?: number;
  interestDue?: number;
  feeDue?: number;
  includeContractCosts?: boolean;
}) {
  const amount = Math.max(input.amount, 0);
  if (!input.includeContractCosts) return { principal: amount, interest: 0, fee: 0 };

  let previouslyAllocated = Math.max(input.allocated ?? 0, 0);
  const feeDue = Math.max(input.feeDue ?? 0, 0);
  const interestDue = Math.max(input.interestDue ?? 0, 0);
  const previousFee = Math.min(previouslyAllocated, feeDue);
  previouslyAllocated -= previousFee;
  const previousInterest = Math.min(previouslyAllocated, interestDue);
  const feeRemaining = feeDue - previousFee;
  const interestRemaining = interestDue - previousInterest;

  const fee = Math.min(amount, feeRemaining);
  const interest = Math.min(Math.max(amount - fee, 0), interestRemaining);
  return { principal: Math.max(amount - fee - interest, 0), interest, fee };
}

/**
 * Rebuilds only the still-editable future of a fixed-rate loan after an extra
 * capital payment. Confirmed history is never rewritten. Variable, indexed,
 * manual and card contracts intentionally return undefined because they need
 * a new creditor snapshot before Moneva can calculate them safely.
 */
export function recalculateFixedLiabilityPrepayment(input: {
  item: LiabilityOverviewItem;
  obligations: LiabilityObligation[];
  paidOn: string;
  principalAfterPayment: number;
  extraPrincipal: number;
}): LiabilityObligationInput[] | undefined {
  const { item, paidOn } = input;
  const terms = item.currentTerms;
  if (!terms || item.kind === "credit_card" || terms.variableRate || terms.prepaymentStrategy === "manual"
    || terms.calculationMethod === "manual" || terms.amortizationMethod === "manual"
    || terms.paymentFrequency === "irregular" || !(input.extraPrincipal > 0.01)) return undefined;

  const editableFuture = input.obligations
    .filter((row) => row.accountId === item.accountId && row.source === "contract"
      && ["projected", "open"].includes(row.status) && row.dueOn > paidOn)
    .toSorted((left, right) => left.dueOn.localeCompare(right.dueOn)
      || (left.sequenceNumber ?? 0) - (right.sequenceNumber ?? 0));
  if (!editableFuture.length) return undefined;

  const ratePeriod = item.currentRates.find((rate) => rate.rateKind === "principal");
  if (ratePeriod?.rateBasis === "fixed_amount") return undefined;
  const rate = fixedRateInput(ratePeriod);
  const charges: ObligationCharge[] = [];
  if (terms.periodicInsurance > 0) charges.push({ id: "insurance", name: "Seguro", kind: "insurance", calculation: "fixed", amount: terms.periodicInsurance });
  if (terms.periodicFee > 0) charges.push({ id: "fee", name: "Otros cargos", kind: "fee", calculation: "fixed", amount: terms.periodicFee });
  const principalAfterPayment = Math.max(input.principalAfterPayment, 0);
  const principalBeforeExtra = principalAfterPayment + input.extraPrincipal;
  if (!(principalBeforeExtra > 0)) return [];

  const scheduleInput: ObligationScheduleInput = {
    principal: principalBeforeExtra,
    currencyCode: item.currencyCode,
    startOn: paidOn,
    firstDueOn: editableFuture[0].dueOn,
    installmentCount: editableFuture.length,
    paymentFrequency: terms.paymentFrequency,
    intervalCount: Math.max(1, terms.intervalCount),
    firstDueDay: Number(editableFuture[0].dueOn.slice(8, 10)),
    interestAccrual: "periodic",
    charges,
    amortization: terms.amortizationMethod,
    rate: { kind: "fixed", rate },
  };
  const original = generateObligationSchedule(scheduleInput);
  const recalculated = applyObligationPrepayment(scheduleInput, original, {
    on: paidOn,
    amount: input.extraPrincipal,
    strategy: terms.prepaymentStrategy,
  }).futureSchedule;
  const firstSequence = editableFuture[0].sequenceNumber ?? 1;

  return recalculated.rows.map((row, index) => {
    const previous = editableFuture[index];
    const totalDue = row.total;
    return {
      id: previous?.id ?? crypto.randomUUID(),
      accountId: item.accountId,
      kind: "loan_installment",
      sequenceNumber: firstSequence + index,
      periodStart: row.periodStart,
      periodEnd: row.dueOn,
      dueOn: row.dueOn,
      principalDue: row.principal,
      interestDue: row.interest,
      feeDue: row.insurance + row.fees + row.otherCharges,
      minimumDue: Math.min(terms.contractualMinimum ?? totalDue, totalDue),
      totalDue,
      status: "projected",
      source: "contract",
      version: previous?.version,
    };
  });
}

function fixedRateInput(rate: LiabilityOverviewItem["currentRates"][number] | undefined): ObligationRateInput {
  if (!rate) return { percent: 0, convention: "EA" };
  if (rate.rateBasis === "monthly") return { percent: rate.reportedValue, convention: "EM" };
  if (rate.rateBasis === "nominal_annual") return { percent: rate.reportedValue, convention: "NMV" };
  return { percent: rate.reportedValue, convention: "EA" };
}
