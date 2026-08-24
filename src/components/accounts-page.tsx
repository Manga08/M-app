"use client";

import { useState } from "react";
import { Archive, BadgeDollarSign, LoaderCircle, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { FinanceIconPicker } from "@/components/finance-icon-picker";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { PaginationControls } from "@/components/pagination-controls";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormControl, FormControlAdornment, FormControlInput, InputControl, SelectControl } from "@/components/ui/form-control";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountBalance, currencyFormatter } from "@/lib/finance/calculations";
import { availableTone, financialToneClass } from "@/lib/finance/financial-status";
import { bankIconBySlug } from "@/lib/finance/bank-icon-catalog";
import { FinanceIcon, suggestFinanceIcon } from "@/lib/finance/icon-catalog";
import { activeIncomeTypes } from "@/lib/finance/income-types";
import { announceMutation, announceMutationError } from "@/lib/finance/mutation-feedback";
import { formatMoneyInput, parseMoneyInput } from "@/lib/finance/money-input";
import type { AccountType, Category, IncomeTypeInput } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const typeLabel: Record<AccountType, string> = { checking: "Cuenta corriente", savings: "Ahorros", cash: "Efectivo", credit: "Crédito", investment: "Inversión" };
const typeIcon: Record<AccountType, string> = { checking: "building", savings: "landmark", cash: "banknote", credit: "wallet", investment: "chart-no-axes-combined" };
const incomePalette = ["#38d39f", "#22c55e", "#14b8a6", "#60a5fa", "#a78bfa", "#f59e0b"];

export function AccountsPage() {
  const { profile, accounts, categories, transactions, financialTargets, snapshot, mutate } = useFinance();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [incomeTypePage, setIncomeTypePage] = useState(1);
  const [incomeTypeDialog, setIncomeTypeDialog] = useState<Category | "new" | null>(null);
  const [accountName, setAccountName] = useState("");
  const [initialBalance, setInitialBalance] = useState("0");
  const [accountType, setAccountType] = useState<AccountType>("checking");
  const [accountIcon, setAccountIcon] = useState(typeIcon.checking);
  const [accountColor, setAccountColor] = useState("#34d399");
  const [iconTouched, setIconTouched] = useState(false);
  const money = currencyFormatter(profile?.currencyCode);
  const balances = accounts.map((account) => ({ account, balance: accountBalance(account, transactions, snapshot) }));
  const total = balances.reduce((sum, item) => sum + item.balance, 0);
  const positiveBalanceTotal = balances.reduce((sum, item) => sum + Math.max(0, item.balance), 0);
  const balanceSegments = balances.filter((item) => item.balance > 0);
  let segmentEnd = 0;
  const balanceGradient = positiveBalanceTotal > 0
    ? `conic-gradient(${balanceSegments.map(({ account, balance }) => {
      const start = segmentEnd;
      segmentEnd += (balance / positiveBalanceTotal) * 100;
      return `${account.color} ${start}% ${segmentEnd}%`;
    }).join(", ")})`
    : "conic-gradient(var(--muted) 0 100%)";
  const distributionTitle = accounts.length === 0 ? "Aún sin cuentas" : accounts.length === 1 ? "Una base clara" : "Dinero distribuido";
  const distributionText = accounts.length === 0
    ? "Crea una cuenta para empezar a ubicar tu dinero."
    : accounts.length === 1
      ? "Todo tu patrimonio está concentrado en una cuenta."
      : `Tu dinero está repartido entre ${accounts.length} cuentas.`;
  const pageCount = Math.max(1, Math.ceil(balances.length / 8));
  const visibleBalances = balances.slice((page - 1) * 8, page * 8);
  const incomeTypes = activeIncomeTypes(categories);
  const incomeTypePageCount = Math.max(1, Math.ceil(incomeTypes.length / 8));
  const safeIncomeTypePage = Math.min(incomeTypePage, incomeTypePageCount);
  const visibleIncomeTypes = incomeTypes.slice((safeIncomeTypePage - 1) * 8, safeIncomeTypePage * 8);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await mutate.addAccount({ name: accountName.trim(), type: accountType, initialBalance: parseMoneyInput(initialBalance), color: accountColor, icon: accountIcon });
      announceMutation(result, "Cuenta creada"); setOpen(false);
    } catch (error) {
      announceMutationError(error, "No pudimos crear la cuenta.");
    } finally { setSaving(false); }
  }

  function openCreateAccount() {
    setAccountName("");
    setInitialBalance("0");
    setAccountType("checking");
    setAccountIcon(typeIcon.checking);
    setAccountColor("#34d399");
    setIconTouched(false);
    setOpen(true);
  }

  async function archiveIncomeTypeItem(incomeType: Category) {
    try {
      const result = await mutate.archiveIncomeType(incomeType.id);
      announceMutation(result, `“${incomeType.name}” se archivó sin alterar tu historial`);
    } catch (error) {
      announceMutationError(error, "No pudimos archivar el tipo de ingreso.");
    }
  }

  return <>
    <PageHeader eyebrow="Tu patrimonio" title="Cuentas" description="El saldo de cada lugar donde vive tu dinero. Las transferencias mueven valor entre cuentas sin inflar ingresos o gastos." action={<Button onClick={openCreateAccount} className="rounded-full"><Plus className="size-4" />Nueva cuenta</Button>} />
    <section className="grid gap-8 pb-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14 lg:border-b lg:pb-9">
      <div><p className="text-sm text-muted-foreground">Patrimonio líquido estimado</p><p className={cn("mt-2 text-[clamp(2rem,10vw,5.4rem)] font-medium leading-none tracking-[-0.065em] tabular-nums", financialToneClass[availableTone(total)])}>{money.format(total)}</p><p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">{total > 0 ? "Incluye saldos de efectivo y bancos, menos el saldo usado en productos de crédito." : total === 0 ? "Todavía no hay patrimonio disponible entre tus cuentas." : "Los saldos usados en crédito superan el dinero disponible en tus cuentas."}</p></div>
      <div className="flex items-center gap-5 lg:border-l lg:pl-10"><div className="relative grid size-24 shrink-0 place-items-center rounded-full" style={{ background: balanceGradient }} role="img" aria-label={positiveBalanceTotal > 0 ? `Distribución del saldo positivo entre ${balanceSegments.length} cuentas` : "Aún no hay saldos positivos para distribuir"}><span className="grid size-16 place-items-center rounded-full bg-background text-sm font-medium tabular-nums">{accounts.length}</span></div><div><p className="font-medium">{distributionTitle}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{distributionText}</p></div></div>
    </section>
    <div className="grid min-w-0 gap-9 pt-7 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,.92fr)] xl:gap-14 xl:pt-10">
      <section className="min-w-0"><div className="mb-5"><h2 className="text-xl font-medium tracking-tight">Todas las cuentas</h2><p className="mt-1 text-sm text-muted-foreground">Saldo calculado con tus movimientos.</p></div><div role="list" className="space-y-1 sm:space-y-0">{visibleBalances.map(({ account, balance }) => { const linkedTargets = financialTargets.filter((target) => target.accountId === account.id && target.status !== "archived").length; return <div key={account.id} role="listitem" className="grid min-h-[82px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3 sm:gap-4 sm:border-b"><span className="grid size-11 place-items-center rounded-2xl" style={{ backgroundColor: `${account.color}1f`, color: account.color }}><FinanceIcon name={account.icon || typeIcon[account.type]} className="size-7" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{account.name}</span><span className="block truncate text-xs text-muted-foreground">{typeLabel[account.type]}{linkedTargets ? ` · ${linkedTargets} ${linkedTargets === 1 ? "meta vinculada" : "metas vinculadas"}` : ""}</span></span><span className={cn("text-right text-sm font-medium tabular-nums sm:text-base", financialToneClass[availableTone(balance)])}>{money.format(balance)}<span className="sr-only">, {balance > 0 ? "saldo disponible" : balance === 0 ? "sin saldo" : "saldo negativo"}</span></span></div>; })}</div><PaginationControls page={page} pageCount={pageCount} onPageChange={setPage} total={balances.length} label="cuentas" /></section>
      <section id="tipos-de-ingreso" className="min-w-0 scroll-mt-24">
      <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div><div className="flex items-center gap-2"><BadgeDollarSign className="size-5 text-primary" /><h2 className="text-xl font-medium tracking-tight">Tipos de ingreso</h2></div><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Define cómo quieres clasificar nómina, ventas, bonificaciones u otras entradas. Aparecerán al registrar un ingreso.</p></div>
        <Button variant="outline" className="h-11 shrink-0 rounded-full max-sm:w-full" onClick={() => setIncomeTypeDialog("new")}><Plus className="size-4" />Nuevo tipo</Button>
      </div>
      {visibleIncomeTypes.length ? <div className="space-y-1 sm:divide-y sm:border-y sm:space-y-0">{visibleIncomeTypes.map((incomeType) => <IncomeTypeRow key={incomeType.id} incomeType={incomeType} onEdit={() => setIncomeTypeDialog(incomeType)} onArchive={() => archiveIncomeTypeItem(incomeType)} />)}</div> : <button type="button" onClick={() => setIncomeTypeDialog("new")} className="flex min-h-32 w-full items-center justify-center gap-2 rounded-2xl border border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"><Plus className="size-4" />Crear el primer tipo de ingreso</button>}
      <PaginationControls page={safeIncomeTypePage} pageCount={incomeTypePageCount} onPageChange={setIncomeTypePage} total={incomeTypes.length} label="tipos de ingreso" />
      </section>
    </div>
    <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
      <DialogContent showCloseButton={!saving} className="gap-0 p-6 max-sm:max-h-[88dvh] max-sm:rounded-t-[1.75rem] max-sm:px-6 max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-3xl">
        <DialogHeader className="mb-6 pr-8">
          <p className="text-xs uppercase tracking-[.14em] text-primary">Organiza tu dinero</p>
          <DialogTitle className="pr-0 text-2xl">Nueva cuenta</DialogTitle>
          <DialogDescription>Identifica dónde vive tu dinero y su saldo inicial.</DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={submit}>
          <div>
            <Label htmlFor="account-name">Nombre e icono</Label>
            <FormControl className="mt-2"><FormControlAdornment interactive className="text-primary"><FinanceIconPicker embedded preferredKind="bank" value={accountIcon} onValueChange={(icon) => { setAccountIcon(icon); setAccountColor(iconColor(icon)); setIconTouched(true); }} /></FormControlAdornment><FormControlInput id="account-name" name="name" required maxLength={100} value={accountName} onChange={(event) => { const name = event.target.value; const suggested = suggestFinanceIcon(name); setAccountName(name); if (!iconTouched) { const nextIcon = suggested ?? typeIcon[accountType]; setAccountIcon(nextIcon); setAccountColor(iconColor(nextIcon)); } }} placeholder="Ej. Davivienda" disabled={saving} /></FormControl>
            <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">Reconocemos bancos y billeteras de Colombia; también puedes tocar el icono y elegirlo.</p>
          </div>
          <div>
            <Label htmlFor="account-type">Tipo</Label>
            <SelectControl id="account-type" name="type" value={accountType} onValueChange={(value) => { const nextType = value as AccountType; setAccountType(nextType); if (!iconTouched && !suggestFinanceIcon(accountName)) setAccountIcon(typeIcon[nextType]); }} containerClassName="mt-2" disabled={saving}>
              <option value="checking">Cuenta corriente</option><option value="savings">Ahorros</option><option value="cash">Efectivo</option><option value="credit">Crédito</option><option value="investment">Inversión</option>
            </SelectControl>
          </div>
          <div><Label htmlFor="initial-balance">Saldo inicial</Label><InputControl id="initial-balance" name="initialBalance" type="text" inputMode="decimal" containerClassName="mt-2" className="text-base tabular-nums" value={initialBalance} onChange={(event) => setInitialBalance(formatMoneyInput(event.target.value, profile?.currencyCode, { allowNegative: true }))} disabled={saving} /></div>
          <Button type="submit" className="h-12 w-full rounded-2xl" disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : null}{saving ? "Creando…" : "Crear cuenta"}</Button>
        </form>
      </DialogContent>
    </Dialog>
    <IncomeTypeDialog key={incomeTypeDialog === "new" ? "new" : incomeTypeDialog?.id ?? "closed"} open={incomeTypeDialog !== null} incomeType={incomeTypeDialog === "new" ? undefined : incomeTypeDialog ?? undefined} onOpenChange={(next) => !next && setIncomeTypeDialog(null)} onSave={async (incomeType) => { const result = await mutate.upsertIncomeType(incomeType); setIncomeTypeDialog(null); announceMutation(result, incomeTypeDialog === "new" ? "Tipo de ingreso creado" : "Tipo de ingreso actualizado"); }} />
  </>;
}

function iconColor(icon: string) {
  if (!icon.startsWith("bank:")) return "#34d399";
  return bankIconBySlug.get(icon.slice(5))?.color ?? "#34d399";
}

function IncomeTypeRow({ incomeType, onEdit, onArchive }: { incomeType: Category; onEdit: () => void; onArchive: () => Promise<void> }) {
  return <div className="grid min-h-[72px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
    <span className="grid size-11 place-items-center rounded-2xl" style={{ color: incomeType.color, backgroundColor: `${incomeType.color}18` }}><FinanceIcon name={incomeType.icon} className="size-5" /></span>
    <span className="min-w-0"><span className="block truncate text-sm font-medium">{incomeType.name}</span><span className="block truncate text-xs text-muted-foreground">Disponible al registrar ingresos{incomeType.isDefault ? " · tipo inicial" : ""}</span></span>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Opciones de ${incomeType.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={onEdit}><Pencil />Editar</DropdownMenuItem><DropdownMenuSeparator /><AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={(event) => event.preventDefault()} variant="destructive"><Archive />Archivar</DropdownMenuItem></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Archivar “{incomeType.name}”?</AlertDialogTitle><AlertDialogDescription>Dejará de aparecer al registrar ingresos. Los movimientos anteriores conservarán este tipo y seguirán incluidos en reportes.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void onArchive()}>Archivar tipo</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></DropdownMenuContent></DropdownMenu>
  </div>;
}

function IncomeTypeDialog({ open, incomeType, onOpenChange, onSave }: { open: boolean; incomeType?: Category; onOpenChange: (open: boolean) => void; onSave: (incomeType: IncomeTypeInput) => Promise<void> }) {
  const [name, setName] = useState(incomeType?.name ?? "");
  const [color, setColor] = useState(incomeType?.color ?? incomePalette[0]);
  const [icon, setIcon] = useState(incomeType?.icon ?? "coins");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSaving(true);
    try { await onSave({ id: incomeType?.id ?? crypto.randomUUID(), name: name.trim(), color, icon }); }
    catch (saveError) { setError(announceMutationError(saveError, "No pudimos guardar el tipo de ingreso.")); }
    finally { setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}><DialogContent showCloseButton={!saving} className="max-sm:max-h-[92dvh] sm:max-w-md"><form onSubmit={submit}><DialogHeader><p className="text-xs uppercase tracking-[.14em] text-primary">Clasifica tus entradas</p><DialogTitle>{incomeType ? "Editar tipo de ingreso" : "Nuevo tipo de ingreso"}</DialogTitle><DialogDescription>El nombre y el icono aparecerán en el formulario de movimientos y en tu historial.</DialogDescription></DialogHeader><div className="space-y-5 py-5"><div className="space-y-2"><Label htmlFor="income-type-name">Nombre</Label><Input id="income-type-name" value={name} onChange={(event) => { setName(event.target.value); setError(null); }} maxLength={100} placeholder="Ej. Nómina, ventas o bonificación" disabled={saving} autoFocus /></div><fieldset className="space-y-2"><legend className="text-sm font-medium">Color</legend><div className="flex flex-wrap gap-3">{incomePalette.map((item) => <button key={item} type="button" onClick={() => setColor(item)} className="size-11 rounded-full ring-1 ring-inset ring-foreground/25 transition-transform duration-150 active:scale-95 motion-reduce:transition-none" style={{ backgroundColor: item, outline: color === item ? "2px solid var(--foreground)" : undefined, outlineOffset: color === item ? 3 : undefined }} aria-label={`Usar color ${item}`} aria-pressed={color === item} disabled={saving} />)}</div></fieldset><div className="space-y-2" role="group" aria-label="Icono del tipo de ingreso"><p className="text-sm font-medium">Icono</p><FinanceIconPicker value={icon} onValueChange={setIcon} /></div>{error ? <p role="alert" className="rounded-xl border border-destructive/35 bg-destructive/8 px-3 py-2 text-sm text-destructive">{error}</p> : null}</div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button><Button type="submit" disabled={!name.trim() || saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : null}{saving ? "Guardando…" : incomeType ? "Guardar cambios" : "Crear tipo"}</Button></DialogFooter></form></DialogContent></Dialog>;
}
