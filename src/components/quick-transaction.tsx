"use client";

import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, CalendarDays, CreditCard, Landmark, Sparkles, Tag } from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { toast } from "sonner";
import { FinanceIconPicker } from "@/components/finance-icon-picker";
import { useFinance } from "@/components/finance-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputControl, SelectControl } from "@/components/ui/form-control";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { accountBalance, categorySpend, currencyFormatter, localIsoDate } from "@/lib/finance/calculations";
import { FinanceIcon, suggestFinanceIcon } from "@/lib/finance/icon-catalog";
import type { TransactionInput } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

type FormState = {
  type: TransactionInput["type"];
  amount: string;
  accountId: string;
  destinationAccountId: string;
  categoryId: string;
  occurredOn: string;
  merchant: string;
  description: string;
  note: string;
  icon: string;
};

export function QuickTransaction({ open, transactionId, onOpenChange }: { open: boolean; transactionId?: string; onOpenChange: (open: boolean) => void }) {
  const { profile, accounts, categories, transactions, budgets, snapshot, currentMonth, addTransaction, updateTransaction } = useFinance();
  const selected = transactions.find((transaction) => transaction.id === transactionId);
  const transferPair = selected?.transferGroupId ? transactions.find((transaction) => transaction.transferGroupId === selected.transferGroupId && transaction.id !== selected.id) : undefined;
  const initialType: TransactionInput["type"] = selected?.kind.startsWith("transfer") ? "transfer" : selected?.kind === "income" ? "income" : "expense";
  const [form, setForm] = useState<FormState>(() => selected ? formFromTransaction(selected, transferPair, accounts) : emptyForm(accounts[0]?.id, accounts[1]?.id, categories.find((category) => category.kind === "expense" && !category.archived)?.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iconTouched, setIconTouched] = useState(Boolean(selected?.icon));
  const availableCategories = useMemo(() => categories.filter((category) => !category.archived && category.kind === (form.type === "income" ? "income" : "expense")), [categories, form.type]);
  const amount = parseMoney(form.amount);
  const money = currencyFormatter(profile?.currencyCode);
  const account = accounts.find((item) => item.id === form.accountId);
  const destination = accounts.find((item) => item.id === form.destinationAccountId);
  const category = categories.find((item) => item.id === form.categoryId);
  const displayIcon = form.icon || category?.icon || (form.type === "income" ? "coins" : "receipt");
  const budget = budgets.find((item) => item.categoryId === form.categoryId && item.month === currentMonth);
  const previousExpense = selected?.kind === "expense" && selected.categoryId === form.categoryId ? selected.amount : 0;
  const spentAfter = form.type === "expense" && category ? Math.max(0, categorySpend(transactions, category.id, currentMonth, snapshot) - previousExpense + amount) : 0;
  const balanceAfter = account ? accountBalance(account, transactions, snapshot) + balanceDelta(form.type, amount, selected?.amount ?? 0, Boolean(transactionId)) : 0;

  function changeType(type: TransactionInput["type"]) {
    if (transactionId) return;
    const nextCategory = categories.find((categoryItem) => !categoryItem.archived && categoryItem.kind === (type === "income" ? "income" : "expense"));
    setForm((current) => ({ ...current, type, categoryId: nextCategory?.id ?? "", icon: nextCategory?.icon ?? "" }));
    setIconTouched(false);
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: TransactionInput = {
      type: form.type,
      amount,
      accountId: form.accountId,
      destinationAccountId: form.type === "transfer" ? form.destinationAccountId : undefined,
      categoryId: form.type !== "transfer" ? form.categoryId : undefined,
      description: form.description.trim() || (form.type === "income" ? "Ingreso" : form.type === "expense" ? "Gasto" : "Transferencia"),
      merchant: form.merchant.trim() || undefined,
      note: form.note.trim() || undefined,
      icon: form.type === "transfer" ? undefined : displayIcon,
      occurredOn: form.occurredOn,
    };
    const validation = validate(input);
    if (validation) { setError(validation); return; }
    setSaving(true);
    try {
      if (transactionId) await updateTransaction(transactionId, input);
      else await addTransaction(input);
      toast.success(transactionId ? "Movimiento actualizado" : "Movimiento registrado");
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No pudimos guardar el movimiento.");
    } finally {
      setSaving(false);
    }
  }

  return <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
    <DialogContent showCloseButton={!saving} className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:p-0 max-sm:pb-0">
      <form onSubmit={submit} className="relative flex min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,.55fr)]">
        <div className="mobile-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-40 pt-5 min-[360px]:px-5 sm:px-8 sm:pb-8 sm:pt-7">
          <DialogHeader className="pr-10"><p className="text-xs font-medium uppercase tracking-[.14em] text-primary">{transactionId ? "Editar movimiento" : "Nuevo movimiento"}</p><DialogTitle className="text-2xl tracking-[-.035em] sm:text-3xl">{transactionId ? "Ajusta los detalles" : "¿Qué pasó con tu dinero?"}</DialogTitle><DialogDescription>{transactionId ? "Los saldos y presupuestos se recalculan al guardar." : "Regístralo una vez; Moneva actualiza todo lo demás."}</DialogDescription></DialogHeader>

          <div className="mt-7 grid grid-cols-3 gap-1 rounded-2xl bg-secondary/60 p-1" role="group" aria-label="Tipo de movimiento">{([
            { value: "expense", label: "Gasto", icon: ArrowUpRight },
            { value: "income", label: "Ingreso", icon: ArrowDownLeft },
            { value: "transfer", label: "Transferencia", icon: ArrowRightLeft },
          ] as const).map(({ value, label, icon: Icon }) => <button key={value} type="button" disabled={Boolean(transactionId) && initialType !== value} onClick={() => changeType(value)} className={cn("flex min-h-14 items-center justify-center gap-2 rounded-xl px-1.5 text-xs font-medium text-muted-foreground transition-[color,background-color,box-shadow,transform] duration-150 active:scale-[.98] max-[359px]:flex-col max-[359px]:gap-1 max-[359px]:text-[11px] sm:text-sm", form.type === value && "bg-background text-primary shadow-sm ring-1 ring-foreground/6", transactionId && initialType !== value && "cursor-not-allowed opacity-35")}><Icon className="size-4" />{label}</button>)}</div>

          <div className="mt-7"><Label htmlFor="transaction-amount">Monto</Label><InputControl id="transaction-amount" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" required placeholder="0" leading={<span className="text-xl font-medium">$</span>} containerClassName="mt-2 h-[72px] rounded-[20px] bg-secondary/35" className="pr-4 text-3xl font-medium tracking-[-.04em]" /></div>

          <m.div key={form.type} initial={{ opacity: 0.68, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }} className="mt-6 grid gap-5 sm:grid-cols-2">
            <FieldSelect label={form.type === "transfer" ? "Desde" : "Cuenta"} value={form.accountId} onChange={(value) => setForm({ ...form, accountId: value })} icon={<CreditCard className="size-4" />} options={accounts.map((item) => ({ value: item.id, label: item.name }))} />
            {form.type === "transfer" ? <FieldSelect label="Hacia" value={form.destinationAccountId} onChange={(value) => setForm({ ...form, destinationAccountId: value })} icon={<Landmark className="size-4" />} options={accounts.map((item) => ({ value: item.id, label: item.name }))} /> : <FieldSelect label="Categoría" value={form.categoryId} onChange={(value) => { const next = categories.find((item) => item.id === value); setForm({ ...form, categoryId: value, icon: iconTouched ? form.icon : next?.icon ?? "" }); }} icon={<Tag className="size-4" />} options={availableCategories.map((item) => ({ value: item.id, label: item.name }))} />}
            <div><Label htmlFor="transaction-date">Fecha</Label><InputControl id="transaction-date" type="date" value={form.occurredOn} onChange={(event) => setForm({ ...form, occurredOn: event.target.value })} required leading={<CalendarDays />} containerClassName="mt-2" /></div>
            {form.type !== "transfer" ? <div><div className="flex items-center justify-between gap-3"><Label htmlFor="transaction-merchant">Comercio <span className="text-muted-foreground">(opcional)</span></Label><span className="text-[10px] text-muted-foreground">Icono editable</span></div><div className="mt-2 flex h-[52px] min-w-0 items-center overflow-hidden rounded-[14px] border border-input bg-secondary/25 transition-[border-color,box-shadow,background-color] focus-within:border-ring focus-within:bg-background focus-within:ring-3 focus-within:ring-ring/30"><FinanceIconPicker embedded value={displayIcon} onValueChange={(icon) => { setForm({ ...form, icon }); setIconTouched(true); }} /><Input id="transaction-merchant" value={form.merchant} onChange={(event) => { const merchant = event.target.value; const suggestion = suggestFinanceIcon(merchant); setForm({ ...form, merchant, icon: !iconTouched && suggestion ? suggestion : form.icon }); }} maxLength={120} className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-4 shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent" placeholder="Ej. Spotify" /></div><p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">Toca el icono para personalizarlo; reconocemos comercios y bancos automáticamente.</p></div> : <div className="hidden sm:block" />}
          </m.div>

          <div className="mt-5"><Label htmlFor="transaction-description">Descripción</Label><Input id="transaction-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={200} className="mt-2 h-12" placeholder={form.type === "transfer" ? "Ej. Pasar a ahorros" : "Ej. Cena con amigos"} /></div>
          <div className="mt-5"><Label htmlFor="transaction-note">Nota <span className="text-muted-foreground">(opcional)</span></Label><Textarea id="transaction-note" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} maxLength={1000} className="mt-2 min-h-20 resize-none" placeholder="Algo que quieras recordar" /></div>
          <AnimatePresence>{error ? <m.p initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: 0.14 }} role="alert" className="mt-5 rounded-xl border border-destructive/35 bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</m.p> : null}</AnimatePresence>
        </div>

        <aside className="hidden border-l bg-secondary/28 p-7 lg:flex lg:flex-col">
          <div><p className="text-xs font-medium uppercase tracking-[.14em] text-muted-foreground">Impacto antes de guardar</p><span className="mt-5 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><FinanceIcon name={displayIcon} className="size-6" /></span><m.p key={amount} initial={{ opacity: .55, y: 3 }} animate={{ opacity: 1, y: 0 }} className="mt-4 text-4xl font-medium tracking-[-.055em]">{money.format(amount || 0)}</m.p><p className="mt-2 text-sm text-muted-foreground">{form.type === "transfer" ? "Mueve dinero sin alterar ingresos ni gastos." : form.type === "income" ? "Se suma a tu ingreso y al saldo de la cuenta." : "Se descuenta de la cuenta y consume presupuesto."}</p></div>
          <div className="mt-8 space-y-5 border-y py-6"><PreviewLine label={account?.name || "Cuenta"} value={money.format(balanceAfter)} note="saldo estimado" />{form.type === "transfer" && destination ? <PreviewLine label={destination.name} value={money.format(accountBalance(destination, transactions, snapshot) + amount - (transactionId ? selected?.amount ?? 0 : 0))} note="saldo estimado" /> : null}{form.type === "expense" && category ? <PreviewLine label={category.name} value={budget ? `${Math.round((spentAfter / Math.max(budget.amount, 1)) * 100)}%` : "Sin límite"} note={budget ? `${money.format(spentAfter)} de ${money.format(budget.amount)}` : "categoría sin presupuesto"} /> : null}</div>
          <div className="mt-auto pt-7"><p className="flex items-center gap-2 text-xs text-muted-foreground"><Sparkles className="size-4 text-primary" />Vista previa calculada en tiempo real</p><Button type="submit" className="mt-4 h-12 w-full rounded-full" disabled={saving}>{saving ? "Guardando…" : transactionId ? "Guardar cambios" : actionLabel(form.type)}</Button></div>
        </aside>

        <div className="absolute inset-x-0 bottom-0 z-10 border-t bg-popover/96 px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_44px_-34px_rgba(0,0,0,.7)] backdrop-blur-xl lg:hidden"><div className="mx-auto max-w-xl"><div className="mb-2 flex min-w-0 items-center justify-between gap-4 px-1"><p className="truncate text-xs text-muted-foreground">{form.type === "transfer" ? "Entre cuentas" : account?.name || "Selecciona una cuenta"}</p><p className="shrink-0 text-sm font-medium tabular-nums">{money.format(amount || 0)}</p></div><Button type="submit" className="h-12 w-full rounded-2xl" disabled={saving}>{saving ? "Guardando…" : transactionId ? "Guardar cambios" : actionLabel(form.type)}</Button></div></div>
      </form>
    </DialogContent>
  </Dialog>;
}

function emptyForm(accountId = "", destinationAccountId = "", categoryId = ""): FormState {
  return { type: "expense", amount: "", accountId, destinationAccountId, categoryId, occurredOn: localIsoDate(), merchant: "", description: "", note: "", icon: "" };
}

function formFromTransaction(selected: ReturnType<typeof useFinance>["transactions"][number], transferPair: ReturnType<typeof useFinance>["transactions"][number] | undefined, accounts: ReturnType<typeof useFinance>["accounts"]): FormState {
  const type: TransactionInput["type"] = selected.kind.startsWith("transfer") ? "transfer" : selected.kind === "income" ? "income" : "expense";
  const outgoing = selected.kind === "transfer_out" ? selected : transferPair?.kind === "transfer_out" ? transferPair : undefined;
  const incoming = selected.kind === "transfer_in" ? selected : transferPair?.kind === "transfer_in" ? transferPair : undefined;
  return { type, amount: formatInputAmount(selected.amount), accountId: outgoing?.accountId ?? selected.accountId, destinationAccountId: incoming?.accountId ?? accounts.find((item) => item.id !== selected.accountId)?.id ?? "", categoryId: selected.categoryId ?? "", occurredOn: selected.occurredOn, merchant: selected.merchant ?? "", description: selected.description, note: selected.note ?? "", icon: selected.icon ?? "" };
}

function FieldSelect({ label, value, onChange, options, icon }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; icon: React.ReactNode }) {
  const id = `transaction-${label.toLowerCase().replaceAll(" ", "-")}`;
  return <div><Label htmlFor={id}>{label}</Label><SelectControl id={id} value={value} onChange={(event) => onChange(event.target.value)} required leading={icon} containerClassName="mt-2 [&_[data-slot=form-control-leading]]:text-primary"><option value="" disabled>Selecciona</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectControl></div>;
}

function PreviewLine({ label, value, note }: { label: string; value: string; note: string }) { return <div><div className="flex items-baseline justify-between gap-3"><p className="truncate text-sm">{label}</p><p className="shrink-0 font-medium tabular-nums">{value}</p></div><p className="mt-1 text-right text-xs text-muted-foreground">{note}</p></div>; }
function actionLabel(type: TransactionInput["type"]) { return type === "expense" ? "Guardar gasto" : type === "income" ? "Guardar ingreso" : "Transferir"; }
function formatInputAmount(amount: number) { return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(amount); }
function parseMoney(value: string) { const normalized = value.includes(",") ? value.replaceAll(".", "").replace(",", ".") : value.replaceAll(",", ""); return Number(normalized || 0); }
function balanceDelta(type: TransactionInput["type"], amount: number, previous: number, editing: boolean) { const old = editing ? previous : 0; if (type === "income") return amount - old; return -(amount - old); }
function validate(input: TransactionInput) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return "Escribe un monto mayor que cero.";
  if (!input.accountId) return "Selecciona una cuenta.";
  if (!input.occurredOn) return "Selecciona una fecha.";
  if (input.type === "transfer" && !input.destinationAccountId) return "Selecciona la cuenta de destino.";
  if (input.type === "transfer" && input.accountId === input.destinationAccountId) return "La cuenta de origen y destino deben ser diferentes.";
  if (input.type !== "transfer" && !input.categoryId) return "Selecciona una categoría.";
  return null;
}
