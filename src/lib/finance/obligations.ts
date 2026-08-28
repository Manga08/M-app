import type {
  ObligationArrears,
  ObligationArrearsInput,
  ObligationCertainty,
  ObligationCharge,
  ObligationCurrencyCode,
  ObligationDayCountBasis,
  ObligationIndexValue,
  ObligationPrepaymentInput,
  ObligationPrepaymentResult,
  ObligationRateConvention,
  ObligationRateInput,
  ObligationRateModel,
  ObligationReconciliationInput,
  ObligationReconciliationResult,
  ObligationSchedule,
  ObligationScheduleCharge,
  ObligationScheduleInput,
  ObligationScheduleRow,
} from "@/lib/finance/types";

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TEN = BigInt(10);
const RATE_SCALE = BigInt(1_000_000_000_000);
const MAX_INSTALLMENTS = 1_200;

export const OBLIGATION_CURRENCY_DECIMALS: Record<ObligationCurrencyCode, number> = {
  COP: 0,
  USD: 2,
  UVR: 8,
};

type GenerateOptions = {
  targetPaymentMinor?: bigint;
  installmentLimit?: number;
};

type ResolvedPeriodTerms = {
  rate: ObligationRateInput;
  effectiveAnnualRatePercent: number;
  certainty: "calculated" | "approximate";
  indexValue?: number;
  previousIndexValue?: number;
};

/**
 * Converts between Colombia's common credit-rate conventions. Inputs and the
 * result are percentages: 12 means 12%, never 0.12.
 */
export function convertObligationRate(
  input: ObligationRateInput,
  target: ObligationRateConvention,
  targetPeriodsPerYear?: number,
) {
  const annualEffective = rateToEffectiveAnnualDecimal(input);
  let result: number;

  if (target === "EA") result = annualEffective;
  else if (target === "EM") result = Math.pow(1 + annualEffective, 1 / 12) - 1;
  else if (target === "NMV") result = (Math.pow(1 + annualEffective, 1 / 12) - 1) * 12;
  else {
    const periods = validatePeriodsPerYear(targetPeriodsPerYear, "La base nominal de destino");
    result = (Math.pow(1 + annualEffective, 1 / periods) - 1) * periods;
  }

  return stableDecimal(result * 100, 12);
}

/** Effective rate for an arbitrary contractual period. */
export function effectiveObligationRate(
  input: ObligationRateInput,
  options: { periodsPerYear?: number; days?: number; dayCountBasis?: ObligationDayCountBasis },
) {
  const annualEffective = rateToEffectiveAnnualDecimal(input);
  if (options.days !== undefined) {
    if (!Number.isInteger(options.days) || options.days < 0) {
      throw new Error("Los días del periodo deben ser un entero no negativo.");
    }
    const basis = options.dayCountBasis ?? input.dayCountBasis ?? 365;
    return Math.pow(1 + annualEffective, options.days / basis) - 1;
  }
  return effectiveRateForPeriodsPerYear(input, validateEffectivePeriodsPerYear(options.periodsPerYear));
}

/** UVR is a unit of account. It is converted only with the value for the date. */
export function convertUvrToCop(units: number, uvrValue: number, roundingDecimals = 0) {
  assertNonNegativeAmount(units, "Las unidades UVR");
  assertPositiveFinite(uvrValue, "El valor de la UVR");
  validateDecimals(roundingDecimals);
  return fromMinor(
    multiplyMinorByDecimal(toMinor(units, 8), uvrValue, roundingDecimals - 8),
    roundingDecimals,
  );
}

export function generateObligationSchedule(input: ObligationScheduleInput): ObligationSchedule {
  return generateSchedule(input, {});
}

/**
 * Default interest is intentionally isolated from current interest, insurance,
 * fees and collection costs. It is calculated only over overdue principal.
 */
export function calculateObligationArrears(input: ObligationArrearsInput): ObligationArrears {
  validateIsoDate(input.dueOn, "La fecha de vencimiento");
  validateIsoDate(input.asOf, "La fecha de corte");
  assertNonNegativeAmount(input.overduePrincipal, "El capital vencido");
  const decimals = decimalsFor(input.currencyCode, input.roundingDecimals);
  const daysLate = Math.max(0, daysBetween(input.dueOn, input.asOf));
  const basis = input.defaultRate.dayCountBasis ?? 365;
  const dailyAccumulatedRate = effectiveObligationRate(input.defaultRate, { days: daysLate, dayCountBasis: basis });
  const principalMinor = toMinor(input.overduePrincipal, decimals);
  const defaultInterestMinor = multiplyMinorByRate(principalMinor, dailyAccumulatedRate);
  const currentInterestMinor = optionalMinor(input.currentInterest, decimals, "Los intereses corrientes");
  const insuranceMinor = optionalMinor(input.insurance, decimals, "Los seguros");
  const feesMinor = optionalMinor(input.fees, decimals, "Los cargos");
  const collectionMinor = optionalMinor(input.collectionCosts, decimals, "Los costos de cobranza");
  const totalMinor = principalMinor
    + currentInterestMinor
    + defaultInterestMinor
    + insuranceMinor
    + feesMinor
    + collectionMinor;

  return {
    currencyCode: input.currencyCode,
    daysLate,
    overduePrincipal: fromMinor(principalMinor, decimals),
    currentInterest: fromMinor(currentInterestMinor, decimals),
    defaultInterest: fromMinor(defaultInterestMinor, decimals),
    insurance: fromMinor(insuranceMinor, decimals),
    fees: fromMinor(feesMinor, decimals),
    collectionCosts: fromMinor(collectionMinor, decimals),
    total: fromMinor(totalMinor, decimals),
  };
}

/**
 * Applies a payment in the safe order charges -> due interest -> principal.
 * Rows on or before the payment date are immutable; only the future is rebuilt.
 */
export function applyObligationPrepayment(
  input: ObligationScheduleInput,
  schedule: ObligationSchedule,
  payment: ObligationPrepaymentInput,
): ObligationPrepaymentResult {
  if (input.amortization === "manual") {
    throw new Error("Un calendario manual requiere que el usuario entregue el nuevo calendario.");
  }
  validateIsoDate(payment.on, "La fecha del abono");
  assertPositiveFinite(payment.amount, "El abono");
  const decimals = decimalsFor(input.currencyCode, input.roundingDecimals);
  const lockedRows = schedule.rows.filter((row) => row.dueOn <= payment.on);
  const futureRows = schedule.rows.filter((row) => row.dueOn > payment.on);
  const projectedPrincipal = lockedRows.at(-1)?.closingPrincipal ?? input.principal;
  let available = toMinor(payment.amount, decimals);
  const chargesDue = optionalMinor(payment.dueCharges, decimals, "Los cargos vencidos");
  const interestDue = optionalMinor(payment.dueInterest, decimals, "Los intereses vencidos");
  const principalDue = toMinor(projectedPrincipal, decimals);
  const appliedToCharges = minBigInt(available, chargesDue);
  available -= appliedToCharges;
  const appliedToInterest = minBigInt(available, interestDue);
  available -= appliedToInterest;
  const appliedToPrincipal = minBigInt(available, principalDue);
  available -= appliedToPrincipal;
  const remainingPrincipal = principalDue - appliedToPrincipal;

  let futureSchedule: ObligationSchedule;
  if (remainingPrincipal === ZERO) {
    futureSchedule = emptySchedule(input.currencyCode);
  } else {
    if (!futureRows.length) {
      throw new Error("No existe un periodo futuro donde recalcular el saldo restante.");
    }
    const nextNumber = futureRows[0].installmentNumber;
    let installmentCount = futureRows.length;
    const nextInput = copyScheduleInput(input, {
      principal: fromMinor(remainingPrincipal, decimals),
      startOn: payment.on,
      firstDueOn: futureRows[0].dueOn,
      installmentCount,
    });

    if (payment.strategy === "reduce_term" && input.amortization === "constant_principal") {
      const referencePrincipal = toMinor(futureRows[0].principal, decimals);
      if (referencePrincipal > ZERO) {
        installmentCount = Number(ceilDiv(remainingPrincipal, referencePrincipal));
        nextInput.installmentCount = Math.max(1, Math.min(futureRows.length, installmentCount));
      }
    }

    const options: GenerateOptions = {};
    if (payment.strategy === "reduce_term" && input.amortization === "constant_payment") {
      const referencePayment = toMinor(futureRows[0].principal + futureRows[0].interest, decimals);
      options.targetPaymentMinor = referencePayment;
      options.installmentLimit = futureRows.length;
    }
    futureSchedule = renumberSchedule(generateSchedule(nextInput, options), nextNumber);
  }

  return {
    strategy: payment.strategy,
    paidOn: payment.on,
    amount: fromMinor(toMinor(payment.amount, decimals), decimals),
    appliedToCharges: fromMinor(appliedToCharges, decimals),
    appliedToInterest: fromMinor(appliedToInterest, decimals),
    appliedToPrincipal: fromMinor(appliedToPrincipal, decimals),
    unappliedAmount: fromMinor(available, decimals),
    lockedRows,
    futureSchedule,
  };
}

/**
 * Reconciles against a statement or creditor snapshot. Historical rows are
 * returned unchanged and only dates strictly after `asOf` are recalculated.
 */
export function reconcileObligationSchedule(
  input: ObligationScheduleInput,
  schedule: ObligationSchedule,
  reconciliation: ObligationReconciliationInput,
): ObligationReconciliationResult {
  if (input.amortization === "manual") {
    throw new Error("Un calendario manual requiere un nuevo calendario confirmado.");
  }
  validateIsoDate(reconciliation.asOf, "La fecha de conciliación");
  assertNonNegativeAmount(reconciliation.confirmedPrincipal, "El capital confirmado");
  const decimals = decimalsFor(input.currencyCode, input.roundingDecimals);
  const lockedRows = schedule.rows.filter((row) => row.dueOn <= reconciliation.asOf);
  const oldFutureRows = schedule.rows.filter((row) => row.dueOn > reconciliation.asOf);
  const projectedMinor = toMinor(lockedRows.at(-1)?.closingPrincipal ?? input.principal, decimals);
  const confirmedMinor = toMinor(reconciliation.confirmedPrincipal, decimals);

  let futureSchedule = emptySchedule(input.currencyCode);
  if (confirmedMinor > ZERO) {
    const nextDueOn = oldFutureRows[0]?.dueOn ?? addMonthsAnchored(reconciliation.asOf, 1, isoDay(reconciliation.asOf));
    const count = Math.max(1, oldFutureRows.length);
    const nextInput = copyScheduleInput(input, {
      principal: fromMinor(confirmedMinor, decimals),
      startOn: reconciliation.asOf,
      firstDueOn: nextDueOn,
      installmentCount: count,
    });
    futureSchedule = renumberSchedule(generateSchedule(nextInput, {}), oldFutureRows[0]?.installmentNumber ?? lockedRows.length + 1);
  }

  return {
    asOf: reconciliation.asOf,
    certainty: "confirmed",
    sourceReference: reconciliation.sourceReference,
    projectedPrincipal: fromMinor(projectedMinor, decimals),
    confirmedPrincipal: fromMinor(confirmedMinor, decimals),
    principalDifference: fromMinor(confirmedMinor - projectedMinor, decimals),
    confirmedAccruedInterest: fromMinor(optionalMinor(reconciliation.confirmedAccruedInterest, decimals, "El interés confirmado"), decimals),
    confirmedInsurance: fromMinor(optionalMinor(reconciliation.confirmedInsurance, decimals, "El seguro confirmado"), decimals),
    confirmedFees: fromMinor(optionalMinor(reconciliation.confirmedFees, decimals, "Los cargos confirmados"), decimals),
    lockedRows,
    futureSchedule,
  };
}

function generateSchedule(input: ObligationScheduleInput, options: GenerateOptions): ObligationSchedule {
  validateScheduleInput(input);
  if (input.amortization === "manual") return generateManualSchedule(input);

  const decimals = decimalsFor(input.currencyCode, input.roundingDecimals);
  const originalPrincipal = toMinor(input.principal, decimals);
  let balance = originalPrincipal;
  let previousDueOn = input.startOn;
  const dueDates = buildDueDates(input, options.installmentLimit ?? input.installmentCount);
  const rows: ObligationScheduleRow[] = [];
  const installmentLimit = options.installmentLimit ?? input.installmentCount;
  const constantPrincipalBase = originalPrincipal / BigInt(input.installmentCount);
  let constantPrincipalRemainder = originalPrincipal % BigInt(input.installmentCount);

  for (let index = 0; index < installmentLimit; index += 1) {
    if (balance === ZERO) break;
    const installmentNumber = index + 1;
    const dueOn = dueDates[index];
    const terms = resolvePeriodTerms(input.rate, previousDueOn, dueOn);
    const periodRate = periodEffectiveRate(terms.rate, input, previousDueOn, dueOn);
    let openingPrincipal = balance;
    let indexAdjustment = ZERO;

    if (input.rate.kind === "indexed" && input.rate.principalMode === "balance_adjustment") {
      const previousIndex = terms.previousIndexValue;
      const currentIndex = terms.indexValue;
      if (!previousIndex || !currentIndex) throw new Error("Faltan valores del índice para ajustar el capital.");
      const adjusted = multiplyMinorByRatio(balance, currentIndex / previousIndex);
      indexAdjustment = adjusted - balance;
      balance = adjusted;
      openingPrincipal = balance;
    }

    const interest = multiplyMinorByRate(openingPrincipal, periodRate);
    const remainingPeriods = Math.max(1, input.installmentCount - index);
    let principal: bigint;

    if (options.targetPaymentMinor !== undefined) {
      if (options.targetPaymentMinor <= interest) {
        throw new Error("El pago objetivo no alcanza a cubrir el interés del periodo.");
      }
      principal = minBigInt(balance, options.targetPaymentMinor - interest);
    } else if (input.amortization === "constant_payment") {
      const payment = annuityPaymentMinor(balance, periodRate, remainingPeriods);
      principal = minBigInt(balance, maxBigInt(ZERO, payment - interest));
      if (index === installmentLimit - 1) principal = balance;
    } else if (input.amortization === "constant_principal") {
      const extra = constantPrincipalRemainder > ZERO ? ONE : ZERO;
      if (constantPrincipalRemainder > ZERO) constantPrincipalRemainder -= ONE;
      principal = minBigInt(balance, constantPrincipalBase + extra);
      if (index === installmentLimit - 1) principal = balance;
    } else if (input.amortization === "balloon") {
      principal = index === installmentLimit - 1 ? balance : ZERO;
    } else {
      principal = ZERO;
    }

    if ((input.amortization === "constant_payment" || input.amortization === "constant_principal")
      && principal === ZERO
      && balance > ZERO) {
      throw new Error("La cuota calculada no amortiza capital con la precisión elegida.");
    }

    const charges = calculateCharges(input.charges ?? [], installmentNumber, openingPrincipal, decimals);
    const chargeTotals = summarizeCharges(charges, decimals);
    balance -= principal;
    const rowTotal = principal + interest + chargeTotals.totalMinor;
    const indexValue = terms.indexValue;
    const reporting = input.currencyCode === "UVR" && indexValue
      ? {
          reportingCurrencyCode: "COP" as const,
          reportingTotal: convertUvrToCop(fromMinor(rowTotal, decimals), indexValue),
          reportingClosingPrincipal: convertUvrToCop(fromMinor(balance, decimals), indexValue),
        }
      : {};

    rows.push({
      installmentNumber,
      periodStart: previousDueOn,
      dueOn,
      currencyCode: input.currencyCode,
      certainty: terms.certainty,
      openingPrincipal: fromMinor(openingPrincipal, decimals),
      indexAdjustment: fromMinor(indexAdjustment, decimals),
      principal: fromMinor(principal, decimals),
      interest: fromMinor(interest, decimals),
      charges,
      insurance: chargeTotals.insurance,
      fees: chargeTotals.fees,
      otherCharges: chargeTotals.other,
      total: fromMinor(rowTotal, decimals),
      closingPrincipal: fromMinor(balance, decimals),
      effectiveAnnualRatePercent: terms.effectiveAnnualRatePercent,
      indexValue,
      ...reporting,
    });
    previousDueOn = dueOn;
  }

  return summarizeSchedule(input.currencyCode, rows, balance, decimals);
}

function generateManualSchedule(input: Extract<ObligationScheduleInput, { amortization: "manual" }>): ObligationSchedule {
  const decimals = decimalsFor(input.currencyCode, input.roundingDecimals);
  let balance = toMinor(input.principal, decimals);
  let previousDueOn = input.startOn;
  const rows: ObligationScheduleRow[] = [];

  for (const [index, payment] of input.manualPayments.entries()) {
    validateIsoDate(payment.dueOn, `La fecha de la cuota ${index + 1}`);
    if (payment.dueOn <= previousDueOn) throw new Error("Las fechas del calendario manual deben avanzar.");
    const principal = toMinor(assertNonNegativeAmount(payment.principal, "El capital manual"), decimals);
    if (principal > balance) throw new Error("El calendario manual no puede amortizar más capital del pendiente.");
    const interest = optionalMinor(payment.interest, decimals, "El interés manual");
    const charges: ObligationScheduleCharge[] = (payment.charges ?? []).map((charge) => ({
      ...charge,
      amount: fromMinor(toMinor(assertNonNegativeAmount(charge.amount, "El cargo manual"), decimals), decimals),
    }));
    const chargeTotals = summarizeCharges(charges, decimals);
    balance -= principal;
    const totalMinor = principal + interest + chargeTotals.totalMinor;
    const indexValue = input.rate?.kind === "indexed"
      ? resolveIndexValue(input.rate.indexValues, payment.dueOn).value
      : undefined;
    const reporting = input.currencyCode === "UVR" && indexValue
      ? {
          reportingCurrencyCode: "COP" as const,
          reportingTotal: convertUvrToCop(fromMinor(totalMinor, decimals), indexValue),
          reportingClosingPrincipal: convertUvrToCop(fromMinor(balance, decimals), indexValue),
        }
      : {};

    rows.push({
      installmentNumber: index + 1,
      periodStart: previousDueOn,
      dueOn: payment.dueOn,
      currencyCode: input.currencyCode,
      certainty: "manual",
      openingPrincipal: fromMinor(balance + principal, decimals),
      indexAdjustment: 0,
      principal: fromMinor(principal, decimals),
      interest: fromMinor(interest, decimals),
      charges,
      insurance: chargeTotals.insurance,
      fees: chargeTotals.fees,
      otherCharges: chargeTotals.other,
      total: fromMinor(totalMinor, decimals),
      closingPrincipal: fromMinor(balance, decimals),
      indexValue,
      ...reporting,
    });
    previousDueOn = payment.dueOn;
  }
  return summarizeSchedule(input.currencyCode, rows, balance, decimals);
}

function resolvePeriodTerms(rate: ObligationRateModel, periodStart: string, dueOn: string): ResolvedPeriodTerms {
  if (rate.kind === "fixed") {
    return {
      rate: rate.rate,
      effectiveAnnualRatePercent: convertObligationRate(rate.rate, "EA"),
      certainty: "calculated",
    };
  }

  if (rate.kind === "variable") {
    const snapshots = [...rate.snapshots].sort((a, b) => a.effectiveOn.localeCompare(b.effectiveOn));
    const snapshot = [...snapshots].reverse().find((candidate) => candidate.effectiveOn <= periodStart);
    if (!snapshot) throw new Error(`No hay una tasa ${rate.benchmark} vigente para ${periodStart}.`);
    const isCovered = snapshot.validUntil !== undefined && dueOn <= snapshot.validUntil;
    return {
      rate: snapshot.rate,
      effectiveAnnualRatePercent: convertObligationRate(snapshot.rate, "EA"),
      certainty: snapshot.certainty === "approximate" || !isCovered ? "approximate" : "calculated",
    };
  }

  const current = resolveIndexValue(rate.indexValues, dueOn);
  const previous = resolveIndexValue(rate.indexValues, periodStart);
  const certainty = current.certainty === "approximate"
    || previous.certainty === "approximate"
    || current.on !== dueOn
    ? "approximate"
    : "calculated";
  return {
    rate: rate.rate,
    effectiveAnnualRatePercent: convertObligationRate(rate.rate, "EA"),
    certainty,
    indexValue: current.value,
    previousIndexValue: previous.value,
  };
}

function resolveIndexValue(values: ObligationIndexValue[], on: string) {
  const found = [...values]
    .sort((a, b) => a.on.localeCompare(b.on))
    .reverse()
    .find((candidate) => candidate.on <= on);
  if (!found) throw new Error(`No hay valor de índice vigente para ${on}.`);
  assertPositiveFinite(found.value, "El valor del índice");
  return found;
}

function periodEffectiveRate(
  rate: ObligationRateInput,
  input: Pick<ObligationScheduleInput, "interestAccrual" | "paymentFrequency" | "intervalCount">,
  periodStart: string,
  dueOn: string,
) {
  if (input.interestAccrual === "actual_days") {
    return effectiveObligationRate(rate, {
      days: daysBetween(periodStart, dueOn),
      dayCountBasis: rate.dayCountBasis ?? 365,
    });
  }
  return effectiveRateForPeriodsPerYear(rate, paymentPeriodsPerYear(
    input.paymentFrequency ?? "monthly",
    input.intervalCount ?? 1,
  ));
}

function calculateCharges(
  charges: ObligationCharge[],
  installmentNumber: number,
  openingPrincipal: bigint,
  decimals: number,
): ObligationScheduleCharge[] {
  return charges
    .filter((charge) => installmentNumber >= (charge.fromInstallment ?? 1)
      && installmentNumber <= (charge.toInstallment ?? Number.MAX_SAFE_INTEGER))
    .map((charge) => {
      let amountMinor: bigint;
      if (charge.calculation === "fixed") {
        amountMinor = toMinor(assertNonNegativeAmount(charge.amount ?? 0, `El cargo ${charge.name}`), decimals);
      } else {
        assertNonNegativeAmount(charge.percent ?? 0, `El porcentaje de ${charge.name}`);
        amountMinor = multiplyMinorByRate(openingPrincipal, (charge.percent ?? 0) / 100);
      }
      return { id: charge.id, name: charge.name, kind: charge.kind, amount: fromMinor(amountMinor, decimals) };
    });
}

function summarizeCharges(charges: ObligationScheduleCharge[], decimals: number) {
  let insuranceMinor = ZERO;
  let feesMinor = ZERO;
  let otherMinor = ZERO;
  for (const charge of charges) {
    const amount = toMinor(charge.amount, decimals);
    if (charge.kind === "insurance") insuranceMinor += amount;
    else if (charge.kind === "fee" || charge.kind === "tax") feesMinor += amount;
    else otherMinor += amount;
  }
  return {
    insurance: fromMinor(insuranceMinor, decimals),
    fees: fromMinor(feesMinor, decimals),
    other: fromMinor(otherMinor, decimals),
    totalMinor: insuranceMinor + feesMinor + otherMinor,
  };
}

function summarizeSchedule(
  currencyCode: ObligationCurrencyCode,
  rows: ObligationScheduleRow[],
  remainingPrincipalMinor: bigint,
  decimals: number,
): ObligationSchedule {
  const sum = (selector: (row: ObligationScheduleRow) => number) => rows.reduce(
    (total, row) => total + toMinor(selector(row), decimals),
    ZERO,
  );
  const certainty: ObligationCertainty = rows.every((row) => row.certainty === "manual")
    ? "manual"
    : rows.some((row) => row.certainty === "approximate")
      ? "approximate"
      : "calculated";
  return {
    currencyCode,
    certainty,
    rows,
    totalPrincipal: fromMinor(sum((row) => row.principal), decimals),
    totalInterest: fromMinor(sum((row) => row.interest), decimals),
    totalInsurance: fromMinor(sum((row) => row.insurance), decimals),
    totalFees: fromMinor(sum((row) => row.fees), decimals),
    totalOtherCharges: fromMinor(sum((row) => row.otherCharges), decimals),
    totalPayments: fromMinor(sum((row) => row.total), decimals),
    remainingPrincipal: fromMinor(remainingPrincipalMinor, decimals),
  };
}

function annuityPaymentMinor(principal: bigint, periodRate: number, periods: number) {
  if (periodRate === 0) return ceilDiv(principal, BigInt(periods));
  const factor = periodRate / (1 - Math.pow(1 + periodRate, -periods));
  return multiplyMinorByRate(principal, factor);
}

function rateToEffectiveAnnualDecimal(input: ObligationRateInput) {
  assertNonNegativeAmount(input.percent, "La tasa");
  const decimal = input.percent / 100;
  if (input.convention === "EA") return decimal;
  if (input.convention === "EM") return Math.pow(1 + decimal, 12) - 1;
  if (input.convention === "NMV") return Math.pow(1 + decimal / 12, 12) - 1;
  const periods = validatePeriodsPerYear(
    input.periodsPerYear ?? input.dayCountBasis,
    "La base de la tasa nominal",
  );
  return Math.pow(1 + decimal / periods, periods) - 1;
}

function validateScheduleInput(input: ObligationScheduleInput) {
  assertPositiveFinite(input.principal, "El capital");
  validateIsoDate(input.startOn, "La fecha inicial");
  validateIsoDate(input.firstDueOn, "La primera fecha de pago");
  if (input.firstDueOn <= input.startOn) throw new Error("La primera cuota debe ser posterior a la fecha inicial.");
  if (!Number.isInteger(input.installmentCount) || input.installmentCount < 1 || input.installmentCount > MAX_INSTALLMENTS) {
    throw new Error(`El número de cuotas debe estar entre 1 y ${MAX_INSTALLMENTS}.`);
  }
  decimalsFor(input.currencyCode, input.roundingDecimals);
  const frequency = input.paymentFrequency ?? (input.amortization === "manual" ? "irregular" : "monthly");
  const interval = input.intervalCount ?? 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 120) {
    throw new Error("El intervalo de pago debe estar entre 1 y 120.");
  }
  if (input.firstDueDay !== undefined) validateDueDay(input.firstDueDay, "El día principal de pago");
  if (frequency === "irregular" && input.amortization !== "manual") {
    throw new Error("Una frecuencia irregular requiere un calendario manual.");
  }
  if (frequency === "semimonthly") {
    validateDueDay(input.firstDueDay ?? isoDay(input.firstDueOn), "El primer día quincenal");
    validateDueDay(input.secondDueDay, "El segundo día quincenal");
    if ((input.firstDueDay ?? isoDay(input.firstDueOn)) === input.secondDueDay) {
      throw new Error("Los dos días quincenales deben ser distintos.");
    }
  }
  if (input.amortization === "manual" && input.manualPayments.length !== input.installmentCount) {
    throw new Error("El número de pagos manuales debe coincidir con el número de cuotas.");
  }
  if (input.rate?.kind === "indexed" && input.rate.index === "UVR" && input.rate.principalMode !== "unit") {
    throw new Error("La UVR debe mantenerse como unidad; no se indexa dos veces el capital.");
  }
  if (input.currencyCode === "UVR" && input.rate?.kind !== "indexed") {
    throw new Error("Una obligación en UVR requiere su serie de valores UVR.");
  }
}

function copyScheduleInput(
  input: Exclude<ObligationScheduleInput, { amortization: "manual" }>,
  values: Pick<ObligationScheduleInput, "principal" | "startOn" | "firstDueOn" | "installmentCount">,
): Exclude<ObligationScheduleInput, { amortization: "manual" }> {
  return {
    ...input,
    ...values,
    firstDueDay: input.firstDueDay ?? isoDay(input.firstDueOn),
  };
}

function renumberSchedule(schedule: ObligationSchedule, firstNumber: number): ObligationSchedule {
  return {
    ...schedule,
    rows: schedule.rows.map((row, index) => ({ ...row, installmentNumber: firstNumber + index })),
  };
}

function emptySchedule(currencyCode: ObligationCurrencyCode): ObligationSchedule {
  return {
    currencyCode,
    certainty: "calculated",
    rows: [],
    totalPrincipal: 0,
    totalInterest: 0,
    totalInsurance: 0,
    totalFees: 0,
    totalOtherCharges: 0,
    totalPayments: 0,
    remainingPrincipal: 0,
  };
}

function decimalsFor(currency: ObligationCurrencyCode, override?: number) {
  const decimals = override ?? OBLIGATION_CURRENCY_DECIMALS[currency];
  validateDecimals(decimals);
  return decimals;
}

function validateDecimals(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 8) {
    throw new Error("La precisión monetaria debe estar entre 0 y 8 decimales.");
  }
}

function toMinor(value: number, decimals: number) {
  if (!Number.isFinite(value)) throw new Error("El monto debe ser finito.");
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const [whole, fraction = ""] = fixed.split(".");
  const minor = BigInt(`${whole}${fraction.padEnd(decimals, "0")}` || "0");
  return negative ? -minor : minor;
}

function fromMinor(value: bigint, decimals: number) {
  if (decimals === 0) return Number(value);
  return Number(value) / 10 ** decimals;
}

function multiplyMinorByRate(amount: bigint, rate: number) {
  if (!Number.isFinite(rate) || rate < 0) throw new Error("La tasa periódica debe ser válida y no negativa.");
  const scaledRate = BigInt(Math.round(rate * Number(RATE_SCALE)));
  return roundDiv(amount * scaledRate, RATE_SCALE);
}

/** Multiply an amount already scaled to `sourceDecimals` into target decimals. */
function multiplyMinorByDecimal(amount: bigint, multiplier: number, decimalDelta: number) {
  assertNonNegativeAmount(multiplier, "El multiplicador");
  const scaled = BigInt(Math.round(multiplier * Number(RATE_SCALE)));
  let numerator = amount * scaled;
  let denominator = RATE_SCALE;
  if (decimalDelta > 0) numerator *= TEN ** BigInt(decimalDelta);
  else if (decimalDelta < 0) denominator *= TEN ** BigInt(-decimalDelta);
  return roundDiv(numerator, denominator);
}

function multiplyMinorByRatio(amount: bigint, ratio: number) {
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error("La variación del índice debe ser positiva.");
  const scaled = BigInt(Math.round(ratio * Number(RATE_SCALE)));
  return roundDiv(amount * scaled, RATE_SCALE);
}

function optionalMinor(value: number | undefined, decimals: number, label: string) {
  return toMinor(assertNonNegativeAmount(value ?? 0, label), decimals);
}

function roundDiv(numerator: bigint, denominator: bigint) {
  if (denominator <= ZERO) throw new Error("El divisor debe ser positivo.");
  if (numerator >= ZERO) return (numerator + denominator / BigInt(2)) / denominator;
  return -((-numerator + denominator / BigInt(2)) / denominator);
}

function ceilDiv(numerator: bigint, denominator: bigint) {
  if (denominator <= ZERO || numerator < ZERO) throw new Error("La división de cuotas recibió valores inválidos.");
  return (numerator + denominator - ONE) / denominator;
}

function minBigInt(a: bigint, b: bigint) {
  return a < b ? a : b;
}

function maxBigInt(a: bigint, b: bigint) {
  return a > b ? a : b;
}

function assertNonNegativeAmount(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} debe ser un número no negativo.`);
  return value;
}

function assertPositiveFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} debe ser mayor que cero.`);
  return value;
}

function validatePeriodsPerYear(value: number | undefined, label: string) {
  if (value === undefined || !Number.isInteger(value) || value < 1 || value > 366) {
    throw new Error(`${label} debe indicar entre 1 y 366 periodos por año.`);
  }
  return value;
}

function validateEffectivePeriodsPerYear(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value) || value <= 0 || value > 366) {
    throw new Error("La periodicidad efectiva debe ser mayor que cero y no superar 366 periodos por año.");
  }
  return value;
}

function effectiveRateForPeriodsPerYear(rate: ObligationRateInput, periodsPerYear: number) {
  const periods = validateEffectivePeriodsPerYear(periodsPerYear);
  return Math.pow(1 + rateToEffectiveAnnualDecimal(rate), 1 / periods) - 1;
}

function paymentPeriodsPerYear(
  frequency: NonNullable<ObligationScheduleInput["paymentFrequency"]>,
  intervalCount: number,
) {
  if (frequency === "weekly") return 52 / intervalCount;
  if (frequency === "biweekly") return 26 / intervalCount;
  if (frequency === "semimonthly") return 24 / intervalCount;
  if (frequency === "monthly") return 12 / intervalCount;
  if (frequency === "quarterly") return 4 / intervalCount;
  if (frequency === "yearly") return 1 / intervalCount;
  throw new Error("Una frecuencia irregular no tiene una tasa periódica automática.");
}

function buildDueDates(input: ObligationScheduleInput, count: number) {
  if (input.amortization === "manual") return input.manualPayments.map((payment) => payment.dueOn);
  const frequency = input.paymentFrequency ?? "monthly";
  const interval = input.intervalCount ?? 1;
  const anchor = input.firstDueDay ?? isoDay(input.firstDueOn);
  const dates = [input.firstDueOn];

  if (frequency === "irregular") {
    throw new Error("Una frecuencia irregular requiere un calendario manual.");
  }
  for (let index = 1; index < count; index += 1) {
    if (frequency === "weekly") {
      dates.push(addDaysIso(input.firstDueOn, index * 7 * interval));
    } else if (frequency === "biweekly") {
      dates.push(addDaysIso(input.firstDueOn, index * 14 * interval));
    } else if (frequency === "monthly") {
      dates.push(addMonthsAnchored(input.firstDueOn, index * interval, anchor));
    } else if (frequency === "quarterly") {
      dates.push(addMonthsAnchored(input.firstDueOn, index * 3 * interval, anchor));
    } else if (frequency === "yearly") {
      dates.push(addMonthsAnchored(input.firstDueOn, index * 12 * interval, anchor));
    } else {
      dates.push(nextSemimonthlyDate(
        dates.at(-1)!,
        anchor,
        input.secondDueDay!,
        interval,
      ));
    }
  }
  return dates;
}

function nextSemimonthlyDate(current: string, firstDay: number, secondDay: number, intervalMonths: number) {
  const currentDate = validateIsoDate(current, "La fecha quincenal");
  const year = currentDate.getUTCFullYear();
  const month = currentDate.getUTCMonth();
  const sameMonth = [...new Set([
    clampedIsoDate(year, month, firstDay),
    clampedIsoDate(year, month, secondDay),
  ])].sort();
  const later = sameMonth.find((candidate) => candidate > current);
  if (later) return later;

  const nextMonth = new Date(Date.UTC(year, month + intervalMonths, 1));
  return [...new Set([
    clampedIsoDate(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), firstDay),
    clampedIsoDate(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), secondDay),
  ])].sort()[0];
}

function validateDueDay(value: number | undefined, label: string) {
  if (value === undefined || !Number.isInteger(value) || value < 1 || value > 31) {
    throw new Error(`${label} debe estar entre 1 y 31.`);
  }
}

function stableDecimal(value: number, decimals: number) {
  return Number(value.toFixed(decimals));
}

function validateIsoDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} debe usar YYYY-MM-DD.`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${label} no es una fecha válida.`);
  }
  return date;
}

function isoDay(value: string) {
  validateIsoDate(value, "La fecha");
  return Number(value.slice(8, 10));
}

function addMonthsAnchored(value: string, months: number, anchorDay: number) {
  const date = validateIsoDate(value, "La fecha del calendario");
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  return clampedIsoDate(first.getUTCFullYear(), first.getUTCMonth(), anchorDay);
}

function clampedIsoDate(year: number, month: number, day: number) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

function addDaysIso(value: string, days: number) {
  const date = validateIsoDate(value, "La fecha del calendario");
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days))
    .toISOString()
    .slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const start = validateIsoDate(from, "La fecha inicial");
  const end = validateIsoDate(to, "La fecha final");
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}
