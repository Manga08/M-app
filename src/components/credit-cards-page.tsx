"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, CreditCard, LoaderCircle, Pencil, Plus, ShieldCheck, WalletCards } from "lucide-react";
import { FinanceIdentityField, FINANCE_IDENTITY_COLORS } from "@/components/finance-identity-field";
import { useFinance } from "@/components/finance-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateControl, InputControl, SelectControl } from "@/components/ui/form-control";
import { FormDialogActions, FormDialogBody, FormDialogContent } from "@/components/ui/form-dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { accountBalance, currencyFormatter, localIsoDate } from "@/lib/finance/calculations";
import {
  creditCardAvailable,
  creditCardCycle,
  creditCardDebt,
  creditCardUrgency,
  creditCardUtilization,
} from "@/lib/finance/credit-cards";
import { getOfficialTrm } from "@/lib/finance/exchange-rate";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import { announceMutation, announceMutationError } from "@/lib/finance/mutation-feedback";
import { formatMoneyInput, formatMoneyInputValue, parseMoneyInput } from "@/lib/finance/money-input";
import type { Account, CreditCardInput, CreditCardNetwork, CreditCardProfile } from "@/lib/finance/types";
import { usePortfolioValuation } from "@/lib/finance/use-portfolio-valuation";
import { cn } from "@/lib/utils";

const networkOptions: Array<{ value: CreditCardNetwork; label: string; icon: string }> = [
  { value: "visa", label: "Visa", icon: "brand:visa" },
  { value: "mastercard", label: "Mastercard", icon: "brand:mastercard" },
  { value: "amex", label: "American Express", icon: "credit-card" },
  { value: "diners", label: "Diners Club", icon: "credit-card" },
  { value: "other", label: "Otra red", icon: "credit-card" },
];

type CardEditor = {
  account?: Account;
  card?: CreditCardProfile;
};

export function CreditCardsPage() {
  const { accountEntities, accounts, creditCards, transactions, snapshot, profile } = useFinance();
  const [editor, setEditor] = useState<CardEditor | null>(null);
  const activeCards = useMemo(() => creditCards.flatMap((card) => {
    const account = accounts.find((candidate) => candidate.id === card.accountId && !candidate.archived);
    if (!account) return [];
    const balance = accountBalance(account, transactions, snapshot);
    const debt = creditCardDebt(balance);
    const cycle = creditCardCycle(card);
    return [{ card, account, debt, available: creditCardAvailable(card.creditLimit, debt), utilization: creditCardUtilization(card.creditLimit, debt), cycle }];
  }).sort((a, b) => creditCardUrgency(a.cycle, a.debt) - creditCardUrgency(b.cycle, b.debt) || b.utilization - a.utilization), [accounts, creditCards, snapshot, transactions]);
  const reportingMoney = currencyFormatter(profile?.currencyCode ?? "COP");
  const portfolio = usePortfolioValuation({ accounts, entities: accountEntities, transactions, snapshot, reportingCurrencyCode: profile?.currencyCode ?? "COP", valuationDate: localIsoDate(new Date(), profile?.timezone) });
  const reportingDebt = activeCards.reduce((sum, item) => sum + Math.max(0, -(portfolio.accounts.find((valuation) => valuation.account.id === item.account.id)?.reportingBalance ?? 0)), 0);
  const dueSoon = activeCards.filter((item) => item.debt > 0 && item.cycle.daysUntilDue <= 7).length;

  return <>
    <section aria-labelledby="card-summary-title" className="border-y py-6 sm:py-7">
      <h2 id="card-summary-title" className="sr-only">Resumen de tarjetas</h2>
      <div className="grid gap-5 sm:grid-cols-3 sm:divide-x">
        <SummaryValue label="Deuda total estimada" value={`${activeCards.some((item) => item.account.currencyCode !== profile?.currencyCode) ? "≈ " : ""}${reportingMoney.format(reportingDebt)}`} detail={`${activeCards.length} ${activeCards.length === 1 ? "tarjeta activa" : "tarjetas activas"}`} />
        <SummaryValue label="Pagos próximos" value={String(dueSoon)} detail={dueSoon ? "en los próximos 7 días" : "sin vencimientos cercanos"} className="sm:pl-6" />
        <SummaryValue label="Privacidad" value="Solo 4 dígitos" detail="Moneva nunca solicita PAN, CVV ni PIN" className="sm:pl-6" />
      </div>
    </section>

    <section className="pt-7 lg:pt-10" aria-labelledby="credit-cards-title">
      <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 id="credit-cards-title" className="text-xl font-medium tracking-tight">Tus tarjetas</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">La deuda sale del libro mayor. El cupo, el corte y el pago solo ayudan a interpretarla.</p>
        </div>
        <Button className="h-11 rounded-full max-sm:w-full" onClick={() => setEditor({})}><Plus className="size-4" />Nueva tarjeta</Button>
      </div>

      {activeCards.length ? <div className="border-y" role="list">
        {activeCards.map((item) => <CardRow key={item.card.accountId} {...item} onEdit={() => setEditor({ account: item.account, card: item.card })} />)}
      </div> : <button type="button" onClick={() => setEditor({})} className="flex min-h-44 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 text-center transition-colors duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] hover:border-primary/40">
        <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><WalletCards className="size-6" /></span>
        <span><span className="block font-medium">Añade tu primera tarjeta</span><span className="mt-1 block max-w-md text-sm leading-6 text-muted-foreground">Verás deuda, cupo disponible, corte y próximo pago sin guardar información sensible.</span></span>
      </button>}
    </section>

    <CreditCardDialog key={editor?.account?.id ?? (editor ? "new" : "closed")} open={editor !== null} account={editor?.account} card={editor?.card} entities={accountEntities.filter((entity) => !entity.archived)} onOpenChange={(open) => !open && setEditor(null)} onSaved={() => setEditor(null)} />
  </>;
}

function SummaryValue({ label, value, detail, className }: { label: string; value: string; detail: string; className?: string }) {
  return <div className={className}><p className="text-xs uppercase tracking-[.12em] text-muted-foreground">{label}</p><p className="mt-2 text-[clamp(1.4rem,5vw,2rem)] font-medium tracking-[-.04em] tabular-nums">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div>;
}

function CardRow({ account, card, debt, available, utilization, cycle, onEdit }: { account: Account; card: CreditCardProfile; debt: number; available: number; utilization: number; cycle: ReturnType<typeof creditCardCycle>; onEdit: () => void }) {
  const money = currencyFormatter(account.currencyCode ?? "COP");
  const network = networkOptions.find((option) => option.value === card.network)?.label ?? "Tarjeta";
  const urgency = debt > 0 && cycle.daysUntilDue <= 7;
  return <article role="listitem" className="group relative border-b last:border-b-0">
    <Link href={`/cuentas/tarjetas/${account.id}`} className="grid min-h-32 gap-5 px-1 py-5 outline-none transition-colors duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] hover:bg-secondary/20 focus-visible:bg-secondary/25 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(220px,1fr)_minmax(200px,.85fr)_minmax(180px,.75fr)] sm:items-center sm:px-3">
      <div className="flex min-w-0 items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl" style={{ backgroundColor: `${account.color}1f`, color: account.color }}><FinanceIcon name={account.icon || "credit-card"} className="size-6" /></span>
        <span className="min-w-0"><span className="block truncate font-medium">{account.name}</span><span className="mt-1 block text-xs text-muted-foreground">{network}{card.lastFour ? ` · •••• ${card.lastFour}` : ""} · {account.currencyCode ?? "COP"}</span></span>
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-4"><span className="text-xs text-muted-foreground">Cupo usado</span><span className="text-sm font-medium tabular-nums">{Math.round(utilization * 100)}%</span></div>
        <Progress className="mt-2" value={Math.min(100, utilization * 100)} label={`Uso del cupo de ${account.name}`} valueText={`${Math.round(utilization * 100)}%, ${money.format(debt)} de ${money.format(card.creditLimit)}`} indicatorClassName={utilization >= .9 ? "bg-destructive" : utilization >= .7 ? "bg-warning" : undefined} />
        <p className="mt-2 text-xs text-muted-foreground">{money.format(available)} disponibles</p>
      </div>
      <div className="flex items-end justify-between gap-4 sm:block sm:text-right">
        <div><p className="text-lg font-medium tabular-nums">{money.format(debt)}</p><p className="mt-1 text-xs text-muted-foreground">deuda actual</p></div>
        <div className={cn("text-xs", urgency ? "text-destructive" : "text-muted-foreground")}><p>{cycle.daysUntilCutoff === 0 ? "Corta hoy" : `Corte en ${cycle.daysUntilCutoff} días`}</p><p className="mt-1">Pago {formatDate(cycle.dueOn)}</p></div>
      </div>
    </Link>
    <Button type="button" variant="ghost" size="icon" aria-label={`Editar ${account.name}`} className="absolute right-1 top-2 size-10 rounded-full sm:right-3" onClick={onEdit}><Pencil className="size-4" /></Button>
  </article>;
}

function CreditCardDialog({ open, account, card, entities, onOpenChange, onSaved }: { open: boolean; account?: Account; card?: CreditCardProfile; entities: Array<{ id: string; name: string }>; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const { mutate } = useFinance();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(account?.name ?? "");
  const [icon, setIcon] = useState(account?.icon ?? "credit-card");
  const [color, setColor] = useState(account?.color ?? FINANCE_IDENTITY_COLORS[2]);
  const [entityId, setEntityId] = useState(account?.entityId ?? "");
  const [network, setNetwork] = useState<CreditCardNetwork>(card?.network ?? "visa");
  const [lastFour, setLastFour] = useState(card?.lastFour ?? "");
  const [currencyCode, setCurrencyCode] = useState<"COP" | "USD">(account?.currencyCode === "USD" ? "USD" : "COP");
  const [creditLimit, setCreditLimit] = useState(formatMoneyInputValue(card?.creditLimit ?? 0, account?.currencyCode));
  const [openingDebt, setOpeningDebt] = useState("0");
  const [openingDate, setOpeningDate] = useState(localIsoDate());
  const [exchangeRate, setExchangeRate] = useState(account?.openingExchangeRate ? formatMoneyInputValue(account.openingExchangeRate, "USD") : "");
  const [cutoffDay, setCutoffDay] = useState(String(card?.cutoffDay ?? 20));
  const [dueDay, setDueDay] = useState(String(card?.dueDay ?? 5));
  const [annualFee, setAnnualFee] = useState(formatMoneyInputValue(card?.annualFee ?? 0, account?.currencyCode));
  const [purchaseRate, setPurchaseRate] = useState(card?.purchaseRateEa?.toString() ?? "");
  const [advanceRate, setAdvanceRate] = useState(card?.cashAdvanceRateEa?.toString() ?? "");
  const editing = Boolean(account && card);

  useEffect(() => {
    if (!open || editing || currencyCode !== "USD" || exchangeRate) return;
    const controller = new AbortController();
    void getOfficialTrm(openingDate, controller.signal).then((quote) => setExchangeRate(formatMoneyInputValue(quote.rate, "USD"))).catch(() => undefined);
    return () => controller.abort();
  }, [currencyCode, editing, exchangeRate, open, openingDate]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const input: CreditCardInput = {
        accountId: account?.id,
        name: name.trim(), color, icon, currencyCode, entityId: entityId || undefined,
        openingDebt: editing ? 0 : parseMoneyInput(openingDebt),
        openingBalanceDate: openingDate,
        openingExchangeRate: currencyCode === "USD" ? parseMoneyInput(exchangeRate) : 1,
        network, lastFour: lastFour || undefined, creditLimit: parseMoneyInput(creditLimit),
        cutoffDay: Number(cutoffDay), dueDay: Number(dueDay), annualFee: parseMoneyInput(annualFee),
        purchaseRateEa: purchaseRate ? Number(purchaseRate) : undefined,
        cashAdvanceRateEa: advanceRate ? Number(advanceRate) : undefined,
        accountVersion: account?.version, cardVersion: card?.version,
      };
      announceMutation(await mutate.upsertCreditCard(input), editing ? "Tarjeta actualizada" : "Tarjeta creada");
      onSaved();
    } catch (error) {
      announceMutationError(error, editing ? "No pudimos actualizar la tarjeta." : "No pudimos crear la tarjeta.");
    } finally { setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}><FormDialogContent variant="flow" showCloseButton={!saving}><form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}><FormDialogBody>
    <DialogHeader className="mb-7 pr-8"><p className="text-xs uppercase tracking-[.14em] text-primary">Producto de crédito</p><DialogTitle className="text-2xl">{editing ? "Editar tarjeta" : "Nueva tarjeta"}</DialogTitle><DialogDescription>Registra solo lo necesario para entender cupo, ciclo y pagos. Nunca ingreses el número completo, CVV, PIN o credenciales.</DialogDescription></DialogHeader>
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <FinanceIdentityField id="credit-card-name" value={name} onValueChange={setName} icon={icon} onIconChange={setIcon} color={color} onColorChange={setColor} preferredKind="bank" required disabled={saving} placeholder="Ej. Visa Bancolombia" helpText="Usa un alias que puedas reconocer; no escribas el número completo." colorLabel="Color de la tarjeta" />
        <div className="grid gap-5 sm:grid-cols-2"><Field label="Red" htmlFor="credit-card-network"><SelectControl id="credit-card-network" value={network} onValueChange={(value) => { const selected = networkOptions.find((option) => option.value === value); setNetwork(value as CreditCardNetwork); if (selected) setIcon(selected.icon); }}>{networkOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectControl></Field><Field label="Últimos 4 dígitos" optional htmlFor="credit-card-last-four"><InputControl id="credit-card-last-four" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={lastFour} onChange={(event) => setLastFour(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="4242" /></Field></div>
        <Field label="Entidad" optional htmlFor="credit-card-entity"><SelectControl id="credit-card-entity" value={entityId} onValueChange={setEntityId}><option value="">Sin entidad</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</SelectControl></Field>
        <div className="grid gap-5 sm:grid-cols-2"><Field label="Moneda" htmlFor="credit-card-currency"><SelectControl id="credit-card-currency" value={currencyCode} onValueChange={(value) => setCurrencyCode(value as "COP" | "USD")} disabled={editing}><option value="COP">Peso colombiano (COP)</option><option value="USD">Dólar estadounidense (USD)</option></SelectControl></Field><Field label="Cupo total" htmlFor="credit-card-limit"><InputControl id="credit-card-limit" inputMode="decimal" value={creditLimit} onChange={(event) => setCreditLimit(formatMoneyInput(event.target.value, currencyCode))} leading={<span className="text-xs font-medium">{currencyCode === "USD" ? "US$" : "$"}</span>} required /></Field></div>
        {!editing ? <div className="grid gap-5 sm:grid-cols-2"><Field label="Deuda inicial" htmlFor="credit-card-opening-debt"><InputControl id="credit-card-opening-debt" inputMode="decimal" value={openingDebt} onChange={(event) => setOpeningDebt(formatMoneyInput(event.target.value, currencyCode))} leading={<span className="text-xs font-medium">{currencyCode === "USD" ? "US$" : "$"}</span>} /></Field><Field label="Fecha del saldo" htmlFor="credit-card-opening-date"><DateControl id="credit-card-opening-date" value={openingDate} onValueChange={setOpeningDate} required /></Field></div> : null}
        {!editing && currencyCode === "USD" ? <Field label="Tasa inicial" htmlFor="credit-card-exchange-rate"><InputControl id="credit-card-exchange-rate" inputMode="decimal" value={exchangeRate} onChange={(event) => setExchangeRate(formatMoneyInput(event.target.value, "USD"))} leading={<span className="text-xs font-medium">COP</span>} required /><p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">COP por USD para valorar la deuda inicial. Puedes reemplazar la referencia por la tasa real.</p></Field> : null}
      </div>
      <div className="space-y-5 lg:border-l lg:pl-7">
        <div><p className="text-sm font-medium">Ciclo de facturación</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Si el mes tiene menos días, Moneva usa su último día válido.</p></div>
        <div className="grid grid-cols-2 gap-4"><Field label="Día de corte" htmlFor="credit-card-cutoff"><InputControl id="credit-card-cutoff" type="number" min={1} max={31} value={cutoffDay} onChange={(event) => setCutoffDay(event.target.value)} required /></Field><Field label="Día de pago" htmlFor="credit-card-due"><InputControl id="credit-card-due" type="number" min={1} max={31} value={dueDay} onChange={(event) => setDueDay(event.target.value)} required /></Field></div>
        <div className="rounded-2xl bg-secondary/30 p-4"><div className="flex items-start gap-3"><CalendarClock className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="text-sm font-medium">Moneva proyectará el ciclo</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Los valores del extracto seguirán marcados como estimados hasta que los concilies.</p></div></div></div>
        <details className="group border-y py-4"><summary className="coarse-target flex cursor-pointer list-none items-center justify-between text-sm font-medium">Costos y tasas <span className="text-xs font-normal text-muted-foreground group-open:hidden">Opcional</span><span className="hidden text-xs font-normal text-muted-foreground group-open:inline">Ocultar</span></summary><div className="mt-5 space-y-5"><Field label="Cuota de manejo anual" optional htmlFor="credit-card-annual-fee"><InputControl id="credit-card-annual-fee" inputMode="decimal" value={annualFee} onChange={(event) => setAnnualFee(formatMoneyInput(event.target.value, currencyCode))} leading={<span className="text-xs font-medium">{currencyCode === "USD" ? "US$" : "$"}</span>} /></Field><div className="grid gap-5 sm:grid-cols-2"><Field label="Compras E.A." optional htmlFor="credit-card-purchase-rate"><InputControl id="credit-card-purchase-rate" inputMode="decimal" value={purchaseRate} onChange={(event) => setPurchaseRate(event.target.value)} trailing={<span className="text-xs font-medium">%</span>} /></Field><Field label="Avances E.A." optional htmlFor="credit-card-advance-rate"><InputControl id="credit-card-advance-rate" inputMode="decimal" value={advanceRate} onChange={(event) => setAdvanceRate(event.target.value)} trailing={<span className="text-xs font-medium">%</span>} /></Field></div></div></details>
        <div className="flex items-start gap-3 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /><p>Estos datos se cifran en la copia local y se aíslan por usuario mediante RLS en Supabase.</p></div>
      </div>
    </div>
  </FormDialogBody><FormDialogActions><Button type="submit" className="h-12 w-full rounded-2xl sm:w-auto sm:min-w-40" disabled={saving || !name.trim() || !(parseMoneyInput(creditLimit) > 0)}>{saving ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <CreditCard className="size-4" />}{saving ? "Guardando…" : editing ? "Guardar tarjeta" : "Crear tarjeta"}</Button><Button type="button" variant="outline" className="h-12 w-full rounded-2xl sm:w-auto" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button></FormDialogActions></form></FormDialogContent></Dialog>;
}

function Field({ label, optional, htmlFor, children }: { label: string; optional?: boolean; htmlFor: string; children: React.ReactNode }) {
  return <div><Label htmlFor={htmlFor}>{label}{optional ? <span className="text-muted-foreground"> (opcional)</span> : null}</Label><div className="mt-2">{children}</div></div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
