"use client";

import * as React from "react";
import {
  Banknote,
  CalendarClock,
  ChevronDown,
  CircleDollarSign,
  HandCoins,
  Landmark,
  ReceiptText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { FinanceDataStateBadge, type FinanceDataState } from "@/components/finance-data-state";
import { DateControl, InputControl, SelectControl } from "@/components/ui/form-control";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  debtCalculationLabel,
  debtFrequencyLabel,
  debtNeedsRate,
  debtProductPreset,
  debtProductPresets,
  type DebtCalculationMethod,
  type DebtPaymentFrequency,
  type DebtProductPreset,
  type DebtProductType,
} from "@/lib/finance/debt-products";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import { formatMoneyInputValue, parseMoneyInput } from "@/lib/finance/money-input";
import { convertObligationRate, generateObligationSchedule } from "@/lib/finance/obligations";
import type {
  LiabilityCalculationMethod,
  LiabilityKind,
  LiabilityRateBasis,
  ObligationCharge,
  ObligationCurrencyCode,
  ObligationPaymentFrequency,
  ObligationPrepaymentStrategy,
  ObligationRateInput,
  ObligationSchedule,
  ObligationScheduleInput,
} from "@/lib/finance/types";
import { cn } from "@/lib/utils";

type DebtKind = Exclude<LiabilityKind, "credit_card">;
type MoneyCurrency = Exclude<ObligationCurrencyCode, "UVR">;

/**
 * Input-facing model for the V2 debt editor. Numeric values stay numeric so the
 * caller can persist them without parsing presentation strings. `productType`
 * is the friendly preset; `debtType` is the stable liability classification.
 */
export type DebtPlanDraft = {
  productType: DebtProductType;
  debtType: DebtKind;
  /** Ledger account that represents the debt itself. */
  liabilityAccountId?: string;
  creditor?: string;
  currencyCode: MoneyCurrency;
  principal?: number;
  /** COP per USD when the liability account is created in USD. */
  openingExchangeRate?: number;
  termsStartOn: string;
  paymentFrequency: DebtPaymentFrequency;
  intervalCount: number;
  calculationMethod: LiabilityCalculationMethod;
  amortizationMethod: DebtCalculationMethod;
  firstDueOn: string;
  installmentCount?: number;
  scheduledPayment?: number;
  minimumPayment?: number;
  periodicFee?: number;
  periodicInsurance?: number;
  variableRate: boolean;
  indexName?: string;
  /** Manual reference used only to preview an indexed balance such as UVR. */
  indexReferenceValue?: number;
  spreadRate?: number;
  rateBasis: LiabilityRateBasis;
  rateValue?: number;
  effectiveAnnualRate?: number;
  prepaymentStrategy: ObligationPrepaymentStrategy | "manual";
  /** Kept for the integrating form, which owns the actual account options. */
  fundingAccountId?: string;
  /** Needed by the local semimonthly preview; persistence may add it later. */
  secondDueDay?: number;
};

export type DebtPlanPreview =
  | { state: "empty"; message: string }
  | { state: "error"; message: string }
  | {
      state: "ready";
      certainty: FinanceDataState;
      schedule: ObligationSchedule;
      displayCurrency: MoneyCurrency;
      firstPayment: number;
      totalPayments: number;
      totalInterest: number;
      totalCharges: number;
      remainingPrincipal: number;
      lastDueOn: string;
      effectiveAnnualRate?: number;
    };

export function createDebtPlanDraft({
  currencyCode = "COP",
  startOn = new Date().toISOString().slice(0, 10),
}: {
  currencyCode?: MoneyCurrency;
  startOn?: string;
} = {}): DebtPlanDraft {
  const preset = debtProductPreset("consumer");
  return {
    productType: preset.value,
    debtType: debtKindForProduct(preset.value),
    currencyCode,
    termsStartOn: startOn,
    firstDueOn: addMonthsIso(startOn, 1),
    paymentFrequency: preset.paymentFrequency,
    intervalCount: 1,
    calculationMethod: liabilityCalculationFor(preset.calculationMethod),
    amortizationMethod: preset.calculationMethod,
    installmentCount: 12,
    periodicFee: 0,
    periodicInsurance: 0,
    variableRate: false,
    rateBasis: "effective_annual",
    prepaymentStrategy: preset.prepaymentStrategy,
  };
}

export function applyDebtProductPreset(value: DebtPlanDraft, productType: DebtProductType): DebtPlanDraft {
  const preset = debtProductPreset(productType);
  const indexed = preset.indexName === "UVR";
  return {
    ...value,
    productType,
    debtType: debtKindForProduct(productType),
    currencyCode: indexed ? "COP" : value.currencyCode,
    paymentFrequency: preset.paymentFrequency,
    calculationMethod: liabilityCalculationFor(preset.calculationMethod),
    amortizationMethod: preset.calculationMethod,
    variableRate: indexed,
    indexName: preset.indexName,
    indexReferenceValue: indexed ? value.indexReferenceValue : undefined,
    spreadRate: indexed ? value.spreadRate : undefined,
    rateValue: preset.calculationMethod === "zero_interest" ? 0 : value.rateValue,
    effectiveAnnualRate: preset.calculationMethod === "zero_interest" ? 0 : value.effectiveAnnualRate,
    prepaymentStrategy: preset.prepaymentStrategy,
  };
}

/** Pure adapter used by the UI and unit tests. It never mutates or persists. */
export function buildDebtPlanPreview(value: DebtPlanDraft): DebtPlanPreview {
  if (!positive(value.principal)) return { state: "empty", message: "Escribe el saldo para ver una proyección." };
  if (value.minimumPayment !== undefined && value.minimumPayment < 0) return { state: "error", message: "El pago mínimo no puede ser negativo." };
  if (!value.termsStartOn || !value.firstDueOn) return { state: "empty", message: "Completa las fechas del plan." };
  if (!positiveInteger(value.installmentCount)) return { state: "empty", message: "Indica cuántas cuotas quieres proyectar." };
  if (value.paymentFrequency === "irregular") {
    return { state: "empty", message: "Un calendario irregular se confirma cuota por cuota al guardar la deuda." };
  }
  if (debtNeedsRate(value.amortizationMethod) && value.rateValue === undefined) {
    return { state: "empty", message: "Escribe la tasa informada para calcular sin inventarla." };
  }
  if (value.indexName === "UVR" && !positive(value.indexReferenceValue)) {
    return { state: "empty", message: "Escribe un valor UVR de referencia para simular en pesos." };
  }

  try {
    const input = scheduleInput(value);
    const schedule = generateObligationSchedule(input);
    const reportingInCop = input.currencyCode === "UVR";
    const rows = schedule.rows;
    const totalPayments = reportingInCop
      ? rows.reduce((total, row) => total + (row.reportingTotal ?? 0), 0)
      : schedule.totalPayments;
    const remainingPrincipal = reportingInCop
      ? rows.at(-1)?.reportingClosingPrincipal ?? value.principal!
      : schedule.remainingPrincipal;
    const firstPayment = reportingInCop ? rows[0]?.reportingTotal ?? 0 : rows[0]?.total ?? 0;
    const certainty: FinanceDataState = schedule.certainty === "approximate"
      ? "estimated"
      : schedule.certainty;

    return {
      state: "ready",
      certainty,
      schedule,
      displayCurrency: reportingInCop ? "COP" : value.currencyCode,
      firstPayment,
      totalPayments,
      totalInterest: reportingInCop
        ? schedule.totalInterest * value.indexReferenceValue!
        : schedule.totalInterest,
      totalCharges: reportingInCop
        ? (schedule.totalInsurance + schedule.totalFees + schedule.totalOtherCharges) * value.indexReferenceValue!
        : schedule.totalInsurance + schedule.totalFees + schedule.totalOtherCharges,
      remainingPrincipal,
      lastDueOn: rows.at(-1)?.dueOn ?? value.firstDueOn,
      effectiveAnnualRate: previewEffectiveAnnualRate(value),
    };
  } catch (error) {
    return { state: "error", message: error instanceof Error ? error.message : "No pudimos calcular esta proyección." };
  }
}

/** Keeps a contractual minimum inside the amount that is actually due. */
export function boundedDebtMinimumDue(minimumPayment: number | undefined, totalDue: number) {
  if (!Number.isFinite(totalDue) || totalDue < 0) throw new Error("La cuota calculada no es válida.");
  if (minimumPayment !== undefined && (!Number.isFinite(minimumPayment) || minimumPayment < 0)) {
    throw new Error("El pago mínimo no puede ser negativo.");
  }
  return Math.min(minimumPayment ?? totalDue, totalDue);
}

export function debtRateWasCleared(value: Pick<DebtPlanDraft, "rateValue" | "effectiveAnnualRate">, hadPersistedRate: boolean) {
  return hadPersistedRate && value.rateValue === undefined && value.effectiveAnnualRate === undefined;
}

export function DebtPlanFields({
  value,
  onChange,
  openingStateLocked = false,
}: {
  value: DebtPlanDraft;
  onChange: (value: DebtPlanDraft) => void;
  /** Existing liabilities derive currency and live balance from their ledger. */
  openingStateLocked?: boolean;
}) {
  const prefix = React.useId().replaceAll(":", "");
  const preset = debtProductPreset(value.productType);
  const preview = React.useMemo(() => buildDebtPlanPreview(value), [value]);
  const indexedUvr = value.indexName === "UVR" || value.productType === "mortgage_uvr";

  function commit(next: DebtPlanDraft) {
    onChange(openingStateLocked ? {
      ...next,
      currencyCode: value.currencyCode,
      principal: value.principal,
      openingExchangeRate: value.openingExchangeRate,
    } : next);
  }

  function update(patch: Partial<DebtPlanDraft>) {
    commit({ ...value, ...patch });
  }

  function updateRate(patch: Partial<Pick<DebtPlanDraft, "rateBasis" | "rateValue" | "spreadRate">>) {
    const next = { ...value, ...patch };
    commit({ ...next, effectiveAnnualRate: previewEffectiveAnnualRate(next) });
  }

  return (
    <div className="grid min-w-0 gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] xl:items-start" data-debt-plan-fields data-debt-opening-state={openingStateLocked ? "locked" : "editable"}>
      <div className="min-w-0 space-y-6">
        <section aria-labelledby={`${prefix}-product-title`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id={`${prefix}-product-title`} className="font-medium">¿Qué tipo de deuda es?</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Esto adapta las preguntas; no cambia ningún saldo por sí solo.</p>
            </div>
            <FinanceDataStateBadge state="manual" />
          </div>
          <Label htmlFor={`${prefix}-product`} className="sr-only">Tipo de deuda</Label>
          <SelectControl
            id={`${prefix}-product`}
            containerClassName="mt-4"
            value={value.productType}
            onValueChange={(next) => commit(applyDebtProductPreset(value, next as DebtProductType))}
            leading={<Landmark />}
          >
            {debtProductPresets.map((item) => <option key={item.value} value={item.value} disabled={openingStateLocked && value.currencyCode === "USD" && item.value === "mortgage_uvr"}>{item.label}</option>)}
          </SelectControl>
          <ProductSummary preset={preset} />
        </section>

        <section className="rounded-[22px] bg-secondary/25 p-4 sm:p-5" aria-labelledby={`${prefix}-basic-title`}>
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background text-primary"><Banknote className="size-[18px]" aria-hidden="true" /></span>
            <div>
              <h3 id={`${prefix}-basic-title`} className="font-medium">Datos para empezar</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Con saldo, fecha y cuotas ya puedes probar un plan.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <MoneyField
              id={`${prefix}-principal`}
              label={openingStateLocked ? "Saldo pendiente actual" : indexedUvr ? "Saldo actual en pesos" : "Saldo pendiente"}
              value={value.principal}
              currency={value.currencyCode}
              onChange={(principal) => update({ principal })}
              required
              readOnly={openingStateLocked}
              help={openingStateLocked ? "Se calcula con los movimientos y pagos de esta deuda. Para corregirlo, registra una conciliación; editar el plan no cambia el saldo." : undefined}
            />
            <div>
              <Label htmlFor={`${prefix}-currency`}>Moneda</Label>
              {openingStateLocked ? (
                <InputControl
                  id={`${prefix}-currency`}
                  containerClassName="mt-2 bg-secondary/25"
                  value={value.currencyCode === "USD" ? "Dólar estadounidense · USD" : "Peso colombiano · COP"}
                  leading={<CircleDollarSign />}
                  readOnly
                  aria-readonly="true"
                />
              ) : (
                <SelectControl id={`${prefix}-currency`} containerClassName="mt-2" value={value.currencyCode} disabled={indexedUvr} onValueChange={(currencyCode) => update({ currencyCode: currencyCode as MoneyCurrency })} leading={<CircleDollarSign />}>
                  <option value="COP">Peso colombiano · COP</option>
                  <option value="USD">Dólar estadounidense · USD</option>
                </SelectControl>
              )}
              {openingStateLocked ? <p className="mt-2 text-xs leading-5 text-muted-foreground">La moneda forma parte del historial contable. Si necesitas otra, crea una deuda nueva.</p> : indexedUvr ? <p className="mt-2 text-xs leading-5 text-muted-foreground">La deuda UVR se muestra en pesos usando tu referencia manual.</p> : null}
            </div>
            <div>
              <Label htmlFor={`${prefix}-creditor`}>¿A quién le debes? <span className="text-muted-foreground">(opcional)</span></Label>
              <Input id={`${prefix}-creditor`} className="mt-2 h-[52px] rounded-[14px]" value={value.creditor ?? ""} onChange={(event) => update({ creditor: event.target.value || undefined })} maxLength={120} placeholder="Ej. Banco o persona" />
            </div>
            {value.currencyCode === "USD" ? <div><Label htmlFor={`${prefix}-exchange`}>{openingStateLocked ? "TRM inicial registrada" : "TRM inicial en pesos"}</Label><InputControl id={`${prefix}-exchange`} containerClassName={cn("mt-2", openingStateLocked && "bg-secondary/25")} inputMode="decimal" value={value.openingExchangeRate === undefined ? "" : formatMoneyInputValue(value.openingExchangeRate, "COP")} onChange={openingStateLocked ? undefined : (event) => update({ openingExchangeRate: optionalMoney(event.target.value) })} leading={<span className="text-xs font-semibold">COP</span>} placeholder={openingStateLocked ? "No registrada" : "Ej. 4.100"} required={!openingStateLocked && !value.liabilityAccountId} readOnly={openingStateLocked} aria-readonly={openingStateLocked || undefined} /><p className="mt-2 text-xs leading-5 text-muted-foreground">{openingStateLocked ? "Es la referencia histórica del saldo inicial; las conversiones posteriores conservan su propia tasa." : "Se usa para expresar el saldo inicial en pesos. Podrás actualizar la tasa después."}</p></div> : null}
            <div>
              <Label htmlFor={`${prefix}-first-due`}>Primera fecha de pago</Label>
              <DateControl id={`${prefix}-first-due`} containerClassName="mt-2" value={value.firstDueOn} min={value.termsStartOn} onValueChange={(firstDueOn) => update({ firstDueOn })} required />
            </div>
            <div>
              <Label htmlFor={`${prefix}-installments`}>Número de cuotas</Label>
              <InputControl id={`${prefix}-installments`} containerClassName="mt-2" type="number" inputMode="numeric" min={1} max={1200} value={value.installmentCount ?? ""} onChange={(event) => update({ installmentCount: optionalInteger(event.target.value) })} leading={<ReceiptText />} placeholder="Ej. 24" required />
            </div>
          </div>
        </section>

        <Disclosure title="Cómo se calcula" description={`${debtCalculationLabel(value.amortizationMethod)} · ${debtFrequencyLabel(value.paymentFrequency)}`} icon={<CalendarClock />}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${prefix}-calculation`}>Forma de pago</Label>
              <SelectControl id={`${prefix}-calculation`} containerClassName="mt-2" value={value.amortizationMethod} onValueChange={(method) => updateCalculation(value, method as DebtCalculationMethod, commit)}>
                <option value="zero_interest">Sin intereses</option>
                <option value="constant_payment">Cuota parecida cada periodo</option>
                <option value="constant_principal">El mismo abono a capital</option>
                <option value="interest_only">Intereses y capital al final</option>
                <option value="balloon">Pago grande al final</option>
                <option value="manual">Calendario escrito por mí</option>
              </SelectControl>
            </div>
            <div>
              <Label htmlFor={`${prefix}-frequency`}>Frecuencia</Label>
              <SelectControl id={`${prefix}-frequency`} containerClassName="mt-2" value={value.paymentFrequency} onValueChange={(paymentFrequency) => update({ paymentFrequency: paymentFrequency as DebtPaymentFrequency })}>
                <option value="weekly">Cada semana</option>
                <option value="biweekly">Cada 14 días</option>
                <option value="semimonthly">Dos veces al mes</option>
                <option value="monthly">Cada mes</option>
                <option value="quarterly">Cada tres meses</option>
                <option value="yearly">Cada año</option>
                <option value="irregular">Fechas irregulares</option>
              </SelectControl>
            </div>
            <div>
              <Label htmlFor={`${prefix}-starts`}>El plan empieza</Label>
              <DateControl id={`${prefix}-starts`} containerClassName="mt-2" value={value.termsStartOn} max={value.firstDueOn} onValueChange={(termsStartOn) => update({ termsStartOn })} required />
            </div>
            {value.paymentFrequency === "semimonthly" ? <div><Label htmlFor={`${prefix}-second-day`}>Segundo día del mes</Label><InputControl id={`${prefix}-second-day`} containerClassName="mt-2" type="number" inputMode="numeric" min={1} max={31} value={value.secondDueDay ?? ""} onChange={(event) => update({ secondDueDay: optionalInteger(event.target.value) })} placeholder="Ej. 30" /><p className="mt-2 text-xs leading-5 text-muted-foreground">Si el mes es más corto, se usa su último día.</p></div> : null}
            {value.amortizationMethod === "manual" ? <MoneyField id={`${prefix}-scheduled`} label="Cuota que planeas pagar" value={value.scheduledPayment} currency={value.currencyCode} onChange={(scheduledPayment) => update({ scheduledPayment })} /> : null}
            <MoneyField id={`${prefix}-minimum`} label="Pago mínimo informado" value={value.minimumPayment} currency={value.currencyCode} onChange={(minimumPayment) => update({ minimumPayment })} optional />
          </div>
          {value.amortizationMethod === "manual" ? <p className="mt-4 rounded-xl bg-background/70 px-3.5 py-3 text-xs leading-5 text-muted-foreground">Esta cifra es una guía escrita por ti. Moneva no separa capital e intereses sin un calendario o extracto.</p> : null}
        </Disclosure>

        <Disclosure title="Interés y actualización" description={indexedUvr ? "UVR y tasa real" : value.variableRate ? "Tasa que puede cambiar" : debtNeedsRate(value.amortizationMethod) ? "Tasa informada" : "No aplica interés"} icon={<Sparkles />}>
          {!debtNeedsRate(value.amortizationMethod) ? <p className="text-sm leading-6 text-muted-foreground">Este plan no usa una tasa para la proyección. Puedes cambiar la forma de pago si el contrato sí cobra intereses.</p> : <>
            {!indexedUvr ? <div className="flex min-h-14 items-center justify-between gap-4 rounded-2xl bg-background/70 px-4 py-2"><div><Label htmlFor={`${prefix}-variable`} className="cursor-pointer">La tasa puede cambiar</Label><p className="mt-0.5 text-xs leading-5 text-muted-foreground">Actívalo sólo si el contrato usa una referencia como IBR, DTF o IPC.</p></div><Switch id={`${prefix}-variable`} checked={value.variableRate} onCheckedChange={(variableRate) => update({ variableRate, indexName: variableRate ? value.indexName ?? "IBR" : undefined, spreadRate: variableRate ? value.spreadRate : undefined })} /></div> : null}
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              {value.variableRate ? <div><Label htmlFor={`${prefix}-index`}>{indexedUvr ? "Índice" : "Referencia"}</Label><SelectControl id={`${prefix}-index`} containerClassName="mt-2" value={value.indexName ?? (indexedUvr ? "UVR" : "IBR")} disabled={indexedUvr} onValueChange={(indexName) => update({ indexName })}><option value="UVR">UVR</option><option value="IBR">IBR</option><option value="DTF">DTF</option><option value="IPC">IPC</option><option value="other">Otra referencia</option></SelectControl></div> : null}
              <div>
                <Label htmlFor={`${prefix}-rate-basis`}>Cómo está escrita la tasa</Label>
                <SelectControl id={`${prefix}-rate-basis`} containerClassName="mt-2" value={value.rateBasis} onValueChange={(rateBasis) => updateRate({ rateBasis: rateBasis as LiabilityRateBasis })}>
                  <option value="effective_annual">Efectiva anual · E.A.</option>
                  <option value="monthly">Efectiva mensual</option>
                  <option value="nominal_annual">Nominal anual mes vencido</option>
                </SelectControl>
              </div>
              <PercentField id={`${prefix}-rate`} label={indexedUvr ? "Interés real informado" : value.variableRate ? "Tasa de referencia actual" : "Tasa informada"} value={value.rateValue} onChange={(rateValue) => updateRate({ rateValue })} />
              {value.variableRate && !indexedUvr ? <PercentField id={`${prefix}-spread`} label="Puntos adicionales" value={value.spreadRate} onChange={(spreadRate) => updateRate({ spreadRate })} optional /> : null}
              {indexedUvr ? <div className="sm:col-span-2"><Label htmlFor={`${prefix}-uvr`}>Valor UVR de referencia</Label><InputControl id={`${prefix}-uvr`} containerClassName="mt-2" inputMode="decimal" value={plainNumber(value.indexReferenceValue)} onChange={(event) => update({ indexReferenceValue: optionalDecimal(event.target.value) })} leading={<span className="text-xs font-semibold">UVR</span>} placeholder="Ej. 382,1234" /><p className="mt-2 text-xs leading-5 text-muted-foreground">Se usa sólo para esta simulación. El saldo y la UVR reales quedan <strong className="font-medium text-foreground">Confirmados</strong> cuando concilias el extracto.</p></div> : null}
            </div>
            {previewEffectiveAnnualRate(value) !== undefined ? <p className="mt-4 text-xs leading-5 text-muted-foreground">Referencia calculada: <strong className="font-medium text-foreground">{formatPercent(previewEffectiveAnnualRate(value)!)} E.A.</strong>{value.variableRate ? " Puede cambiar en el próximo periodo." : ""}</p> : null}
          </>}
        </Disclosure>

        <Disclosure title="Seguros y otros cargos" description="Opcional · por cada cuota" icon={<ShieldCheck />}>
          <div className="grid gap-5 sm:grid-cols-2">
            <MoneyField id={`${prefix}-insurance`} label="Seguro por periodo" value={value.periodicInsurance} currency={value.currencyCode} onChange={(periodicInsurance) => update({ periodicInsurance })} optional />
            <MoneyField id={`${prefix}-fee`} label="Otros cargos por periodo" value={value.periodicFee} currency={value.currencyCode} onChange={(periodicFee) => update({ periodicFee })} optional />
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">Registra únicamente cargos repetidos. Mora, cobranza y cobros extraordinarios se concilian cuando aparezcan.</p>
        </Disclosure>

        <Disclosure title="Si haces abonos" description="Opcional · qué debe reducir primero" icon={<HandCoins />}>
          <Label htmlFor={`${prefix}-prepayment`}>Al abonar a capital</Label>
          <SelectControl id={`${prefix}-prepayment`} containerClassName="mt-2" value={value.prepaymentStrategy} onValueChange={(prepaymentStrategy) => update({ prepaymentStrategy: prepaymentStrategy as DebtPlanDraft["prepaymentStrategy"] })}>
            <option value="reduce_term">Terminar antes y mantener la cuota</option>
            <option value="reduce_payment">Bajar la cuota y mantener el plazo</option>
            <option value="manual">Decidirlo con cada abono</option>
          </SelectControl>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Es una preferencia de cálculo. El efecto real se confirma con el acreedor y el siguiente extracto.</p>
          {value.fundingAccountId ? <p className="mt-3 rounded-xl bg-background/70 px-3.5 py-3 text-xs leading-5 text-muted-foreground">La cuenta de pago ya está vinculada en el formulario principal.</p> : null}
        </Disclosure>
      </div>

      <DebtPreviewCard preview={preview} />
    </div>
  );
}

function ProductSummary({ preset }: { preset: DebtProductPreset }) {
  return <div className="mt-3 flex items-start gap-3 rounded-2xl bg-secondary/25 p-3.5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background text-primary"><FinanceIcon name={preset.icon} className="size-[18px]" /></span><div className="min-w-0"><p className="text-sm font-medium">{preset.shortLabel}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{preset.description}</p></div></div>;
}

function Disclosure({ title, description, icon, children }: { title: string; description: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <details className="group rounded-[22px] bg-secondary/25 px-4 py-3.5 sm:px-5"><summary className="coarse-target flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl text-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/40"><span className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-background text-primary [&_svg]:size-4" aria-hidden="true">{icon}</span><span className="min-w-0"><span className="block">{title}</span><span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">{description}</span></span></span><ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" /></summary><div className="mt-5">{children}</div></details>;
}

function DebtPreviewCard({ preview }: { preview: DebtPlanPreview }) {
  if (preview.state !== "ready") {
    return <aside className="min-w-0 rounded-[24px] border border-border/80 bg-card p-5 xl:sticky xl:top-[calc(var(--app-sticky-stack,0px)+1.5rem)]" aria-live="polite"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] uppercase tracking-[.14em] text-primary">Vista previa local</p><h3 className="mt-2 text-lg font-medium">Tu próximo pago</h3></div><FinanceDataStateBadge state="manual" /></div><div className={cn("mt-6 rounded-2xl px-4 py-4 text-sm leading-6", preview.state === "error" ? "bg-destructive/10 text-destructive" : "bg-secondary/35 text-muted-foreground")}><p>{preview.message}</p></div><StateLegend /></aside>;
  }

  const money = moneyFormatter(preview.displayCurrency);
  return <aside className="min-w-0 rounded-[24px] border border-border/80 bg-card p-5 xl:sticky xl:top-[calc(var(--app-sticky-stack,0px)+1.5rem)]" aria-live="polite">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] uppercase tracking-[.14em] text-primary">Vista previa local</p><h3 className="mt-2 text-lg font-medium">Tu próximo pago</h3></div><FinanceDataStateBadge state={preview.certainty} /></div>
    <p className="mt-6 break-words text-[clamp(2rem,8vw,2.75rem)] font-medium leading-none tracking-[-.05em] tabular-nums [overflow-wrap:anywhere]">{money.format(preview.firstPayment)}</p>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">Primera cuota proyectada. Puede variar por redondeos, tasas o cargos del acreedor.</p>
    <dl className="mt-6 grid gap-3 rounded-2xl bg-secondary/25 p-4">
      <PreviewFact label="Total del plan" value={money.format(preview.totalPayments)} />
      <PreviewFact label="Intereses" value={money.format(preview.totalInterest)} />
      <PreviewFact label="Seguros y cargos" value={money.format(preview.totalCharges)} />
      <PreviewFact label="Última fecha" value={dateLabel(preview.lastDueOn)} />
      {preview.remainingPrincipal > 0.01 ? <PreviewFact label="Saldo no cubierto" value={money.format(preview.remainingPrincipal)} tone="warning" /> : null}
    </dl>
    <p className="mt-4 text-xs leading-5 text-muted-foreground">Nada de esta vista se guarda hasta que confirmes el formulario principal.</p>
    <StateLegend />
  </aside>;
}

function StateLegend() {
  return <details className="group mt-5 border-t border-border/70 pt-4"><summary className="coarse-target flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/40">Cómo leer estos datos<ChevronDown className="size-4 transition-transform duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" /></summary><div className="mt-4 space-y-3"><LegendRow state="manual" text="Lo escribiste tú." /><LegendRow state="calculated" text="Sale de los datos que escribiste." /><LegendRow state="estimated" text="Puede cambiar por tasa, UVR o falta de confirmación." /><LegendRow state="confirmed" text="Sólo aparece después de conciliar una fuente como el extracto." /></div></details>;
}

function LegendRow({ state, text }: { state: FinanceDataState; text: string }) {
  return <div className="flex items-start gap-2.5"><FinanceDataStateBadge state={state} /><p className="pt-1 text-xs leading-5 text-muted-foreground">{text}</p></div>;
}

function PreviewFact({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return <div className="flex items-start justify-between gap-4"><dt className="text-xs leading-5 text-muted-foreground">{label}</dt><dd className={cn("break-words text-right text-sm font-medium tabular-nums [overflow-wrap:anywhere]", tone === "warning" && "text-warning")}>{value}</dd></div>;
}

function MoneyField({ id, label, value, currency, onChange, optional, required, readOnly, help }: { id: string; label: string; value?: number; currency: MoneyCurrency; onChange: (value: number | undefined) => void; optional?: boolean; required?: boolean; readOnly?: boolean; help?: string }) {
  const helpId = help ? `${id}-help` : undefined;
  return <div><Label htmlFor={id}>{label}{optional ? <span className="text-muted-foreground"> (opcional)</span> : null}</Label><InputControl id={id} containerClassName={cn("mt-2", readOnly && "bg-secondary/25")} inputMode="decimal" value={value === undefined ? "" : formatMoneyInputValue(value, currency)} onChange={readOnly ? undefined : (event) => onChange(optionalMoney(event.target.value))} leading={<span className="text-xs font-semibold">{currency}</span>} placeholder="0" required={required} readOnly={readOnly} aria-readonly={readOnly || undefined} aria-describedby={helpId} />{help ? <p id={helpId} className="mt-2 text-xs leading-5 text-muted-foreground">{help}</p> : null}</div>;
}

function PercentField({ id, label, value, onChange, optional }: { id: string; label: string; value?: number; onChange: (value: number | undefined) => void; optional?: boolean }) {
  return <div><Label htmlFor={id}>{label}{optional ? <span className="text-muted-foreground"> (opcional)</span> : null}</Label><InputControl id={id} containerClassName="mt-2" inputMode="decimal" value={plainNumber(value)} onChange={(event) => onChange(optionalDecimal(event.target.value))} trailing={<span className="text-xs font-medium">%</span>} placeholder="0" /></div>;
}

function scheduleInput(value: DebtPlanDraft): ObligationScheduleInput {
  const count = value.installmentCount!;
  const charges = periodicCharges(value);
  const uvr = value.indexName === "UVR";
  const principal = uvr ? value.principal! / value.indexReferenceValue! : value.principal!;
  const currencyCode: ObligationCurrencyCode = uvr ? "UVR" : value.currencyCode;
  const common = {
    principal,
    currencyCode,
    startOn: value.termsStartOn,
    firstDueOn: value.firstDueOn,
    installmentCount: count,
    paymentFrequency: value.paymentFrequency as Exclude<ObligationPaymentFrequency, "irregular">,
    intervalCount: Math.max(1, value.intervalCount || 1),
    firstDueDay: Number(value.firstDueOn.slice(8, 10)),
    secondDueDay: value.paymentFrequency === "semimonthly" ? value.secondDueDay ?? defaultSecondDueDay(value.firstDueOn) : undefined,
    interestAccrual: "periodic" as const,
    charges,
  };

  if (value.amortizationMethod === "manual") {
    const skeleton = generateObligationSchedule({
      ...common,
      amortization: "constant_payment",
      rate: uvr ? indexedRate(value) : { kind: "fixed", rate: { percent: 0, convention: "EA" } },
    });
    const chargeTotal = (value.periodicFee ?? 0) + (value.periodicInsurance ?? 0);
    const plannedPrincipal = Math.max(0, (value.scheduledPayment ?? value.principal! / count) - chargeTotal);
    let remaining = principal;
    const manualPayments = skeleton.rows.map((row, index) => {
      const principalPayment = index === skeleton.rows.length - 1 && value.scheduledPayment === undefined
        ? remaining
        : Math.min(remaining, uvr ? plannedPrincipal / value.indexReferenceValue! : plannedPrincipal);
      remaining -= principalPayment;
      return {
        dueOn: row.dueOn,
        principal: principalPayment,
        charges: manualCharges(value, uvr),
      };
    });
    return { ...common, amortization: "manual", rate: uvr ? indexedRate(value) : undefined, manualPayments };
  }

  const amortization = value.amortizationMethod === "zero_interest" ? "constant_payment" : value.amortizationMethod;
  return {
    ...common,
    amortization,
    rate: value.amortizationMethod === "zero_interest" ? { kind: "fixed", rate: { percent: 0, convention: "EA" } } : rateModel(value),
  };
}

function rateModel(value: DebtPlanDraft): Extract<ObligationScheduleInput, { amortization: Exclude<DebtCalculationMethod, "manual" | "zero_interest"> }>["rate"] {
  if (value.indexName === "UVR") return indexedRate(value);
  const rate = rateInput(value, (value.rateValue ?? 0) + (value.variableRate ? value.spreadRate ?? 0 : 0));
  if (!value.variableRate) return { kind: "fixed", rate };
  return {
    kind: "variable",
    benchmark: benchmark(value.indexName),
    spreadPercent: value.spreadRate,
    snapshots: [{ effectiveOn: value.termsStartOn, rate, certainty: "approximate" }],
  };
}

function indexedRate(value: DebtPlanDraft) {
  return {
    kind: "indexed" as const,
    index: "UVR" as const,
    principalMode: "unit" as const,
    rate: rateInput(value, value.rateValue ?? 0),
    indexValues: [{ on: value.termsStartOn, value: value.indexReferenceValue!, certainty: "approximate" as const }],
  };
}

function rateInput(value: DebtPlanDraft, percent: number): ObligationRateInput {
  if (value.rateBasis === "monthly") return { percent, convention: "EM" };
  if (value.rateBasis === "nominal_annual") return { percent, convention: "NMV" };
  return { percent, convention: "EA" };
}

function periodicCharges(value: DebtPlanDraft): ObligationCharge[] {
  const charges: ObligationCharge[] = [];
  if (positive(value.periodicInsurance)) charges.push({ id: "insurance", name: "Seguro", kind: "insurance", calculation: "fixed", amount: value.indexName === "UVR" ? value.periodicInsurance / value.indexReferenceValue! : value.periodicInsurance });
  if (positive(value.periodicFee)) charges.push({ id: "fee", name: "Otros cargos", kind: "fee", calculation: "fixed", amount: value.indexName === "UVR" ? value.periodicFee / value.indexReferenceValue! : value.periodicFee });
  return charges;
}

function manualCharges(value: DebtPlanDraft, uvr: boolean) {
  const divisor = uvr ? value.indexReferenceValue! : 1;
  return [
    positive(value.periodicInsurance) ? { id: "insurance", name: "Seguro", kind: "insurance" as const, amount: value.periodicInsurance! / divisor } : null,
    positive(value.periodicFee) ? { id: "fee", name: "Otros cargos", kind: "fee" as const, amount: value.periodicFee! / divisor } : null,
  ].filter((charge): charge is { id: string; name: string; kind: "insurance" | "fee"; amount: number } => charge !== null);
}

function updateCalculation(value: DebtPlanDraft, amortizationMethod: DebtCalculationMethod, onChange: (value: DebtPlanDraft) => void) {
  onChange({
    ...value,
    amortizationMethod,
    calculationMethod: liabilityCalculationFor(amortizationMethod),
    paymentFrequency: amortizationMethod === "manual" && value.paymentFrequency === undefined ? "irregular" : value.paymentFrequency,
    rateValue: amortizationMethod === "zero_interest" ? 0 : value.rateValue,
    effectiveAnnualRate: amortizationMethod === "zero_interest" ? 0 : value.effectiveAnnualRate,
  });
}

function liabilityCalculationFor(method: DebtCalculationMethod): LiabilityCalculationMethod {
  if (method === "manual") return "manual";
  if (method === "zero_interest") return "simple";
  return "amortized";
}

function debtKindForProduct(product: DebtProductType): DebtKind {
  if (product === "person") return "personal_debt";
  if (product === "bnpl") return "bnpl";
  if (product === "other") return "other";
  return "loan";
}

function benchmark(indexName: string | undefined): "IBR" | "DTF" | "IPC" | "other" {
  if (indexName === "IBR" || indexName === "DTF" || indexName === "IPC") return indexName;
  return "other";
}

function previewEffectiveAnnualRate(value: DebtPlanDraft) {
  if (value.rateValue === undefined) return undefined;
  try {
    return convertObligationRate(rateInput(value, value.rateValue + (value.variableRate && value.indexName !== "UVR" ? value.spreadRate ?? 0 : 0)), "EA");
  } catch {
    return undefined;
  }
}

function moneyFormatter(currencyCode: MoneyCurrency) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: currencyCode, maximumFractionDigits: currencyCode === "COP" ? 0 : 2 });
}

function dateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function addMonthsIso(value: string, months: number) {
  const [year, month, day] = value.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, lastDay))).toISOString().slice(0, 10);
}

function defaultSecondDueDay(firstDueOn: string) {
  const day = Number(firstDueOn.slice(8, 10));
  return day <= 15 ? Math.min(31, day + 15) : Math.max(1, day - 15);
}

function optionalMoney(value: string) {
  if (!value.trim()) return undefined;
  return parseMoneyInput(value);
}

function optionalDecimal(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalInteger(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function plainNumber(value: number | undefined) {
  return value === undefined ? "" : String(value).replace(".", ",");
}

function positive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function positiveInteger(value: number | undefined): value is number {
  return positive(value) && Number.isInteger(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 4 }).format(value) + "%";
}
