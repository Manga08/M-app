"use client";

import { useState } from "react";
import { Archive, BadgeDollarSign, ChevronRight, LoaderCircle, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { FinanceIconPicker } from "@/components/finance-icon-picker";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { PaginationControls } from "@/components/pagination-controls";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SelectControl } from "@/components/ui/form-control";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountBalance, currencyFormatter } from "@/lib/finance/calculations";
import { bankIconBySlug } from "@/lib/finance/bank-icon-catalog";
import { FinanceIcon, suggestFinanceIcon } from "@/lib/finance/icon-catalog";
import { activeIncomeTypes } from "@/lib/finance/income-types";
import { formatMoneyInput, parseMoneyInput } from "@/lib/finance/money-input";
import type { AccountType, Category, IncomeTypeInput } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const typeLabel: Record<AccountType, string> = { checking: "Cuenta corriente", savings: "Ahorros", cash: "Efectivo", credit: "Crédito", investment: "Inversión" };
const typeIcon: Record<AccountType, string> = { checking: "building", savings: "landmark", cash: "banknote", credit: "wallet", investment: "chart-no-axes-combined" };
const incomePalette = ["#38d39f", "#22c55e", "#14b8a6", "#60a5fa", "#a78bfa", "#f59e0b"];

export function AccountsPage() {
  const { profile, accounts, categories, transactions, snapshot, addAccount, upsertIncomeType, archiveIncomeType } = useFinance();
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
      await addAccount({ name: accountName.trim(), type: accountType, initialBalance: parseMoneyInput(initialBalance), color: accountColor, icon: accountIcon });
      toast.success("Cuenta creada"); setOpen(false);
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
    await archiveIncomeType(incomeType.id);
    toast.success(`“${incomeType.name}” se archivó sin alterar tu historial`);
  }

  return <>
    <PageHeader eyebrow="Tu patrimonio" title="Cuentas" description="El saldo de cada lugar donde vive tu dinero. Las transferencias mueven valor entre cuentas sin inflar ingresos o gastos." action={<Button onClick={openCreateAccount} className="rounded-full"><Plus className="size-4" />Nueva cuenta</Button>} />
    <section className="grid gap-8 border-b pb-9 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
      <div><p className="text-sm text-muted-foreground">Patrimonio líquido estimado</p><p className="mt-2 text-[clamp(2rem,10vw,5.4rem)] font-medium leading-none tracking-[-0.065em] tabular-nums">{money.format(total)}</p><p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Incluye saldos de efectivo y bancos, menos el saldo usado en productos de crédito.</p></div>
      <div className="flex items-center gap-5 lg:border-l lg:pl-10"><div className="relative grid size-24 shrink-0 place-items-center rounded-full" style={{ background: "conic-gradient(#34d399 0 56%, #a78bfa 56% 72%, #60a5fa 72% 91%, #fb923c 91%)" }}><span className="grid size-16 place-items-center rounded-full bg-background text-sm font-medium">{accounts.length}<br /></span></div><div><p className="font-medium">Diversificado</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Tu dinero está distribuido en {accounts.length} cuentas.</p></div></div>
    </section>
    <section className="pt-8"><div className="mb-5"><h2 className="text-xl font-medium tracking-tight">Todas las cuentas</h2><p className="mt-1 text-sm text-muted-foreground">Saldo calculado con tus movimientos.</p></div><div>{visibleBalances.map(({ account, balance }) => <button key={account.id} type="button" className="grid min-h-[82px] w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 border-b py-3 text-left transition-colors hover:bg-foreground/[0.025] active:bg-secondary/55 sm:gap-4"><span className="grid size-11 place-items-center rounded-2xl" style={{ backgroundColor: `${account.color}1f`, color: account.color }}><FinanceIcon name={account.icon || typeIcon[account.type]} className="size-7" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{account.name}</span><span className="block truncate text-xs text-muted-foreground">{typeLabel[account.type]}</span></span><span className={cn("text-right text-sm font-medium tabular-nums sm:text-base", balance < 0 && "text-destructive")}>{money.format(balance)}</span><ChevronRight className="hidden size-4 text-muted-foreground sm:block" /></button>)}</div><PaginationControls page={page} pageCount={pageCount} onPageChange={setPage} total={balances.length} label="cuentas" /></section>
    <section className="mt-10 border-t pb-6 pt-8">
      <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><div className="flex items-center gap-2"><BadgeDollarSign className="size-5 text-primary" /><h2 className="text-xl font-medium tracking-tight">Tipos de ingreso</h2></div><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Define cómo quieres clasificar nómina, ventas, bonificaciones u otras entradas. Aparecerán al registrar un ingreso.</p></div>
        <Button variant="outline" className="h-11 shrink-0 rounded-full max-sm:w-full" onClick={() => setIncomeTypeDialog("new")}><Plus className="size-4" />Nuevo tipo</Button>
      </div>
      {visibleIncomeTypes.length ? <div className="divide-y border-y">{visibleIncomeTypes.map((incomeType) => <IncomeTypeRow key={incomeType.id} incomeType={incomeType} onEdit={() => setIncomeTypeDialog(incomeType)} onArchive={() => archiveIncomeTypeItem(incomeType)} />)}</div> : <button type="button" onClick={() => setIncomeTypeDialog("new")} className="flex min-h-32 w-full items-center justify-center gap-2 rounded-2xl border border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"><Plus className="size-4" />Crear el primer tipo de ingreso</button>}
      <PaginationControls page={safeIncomeTypePage} pageCount={incomeTypePageCount} onPageChange={setIncomeTypePage} total={incomeTypes.length} label="tipos de ingreso" />
    </section>
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
            <div className="mt-2 flex h-[52px] min-w-0 items-center overflow-hidden rounded-[14px] border border-input bg-secondary/25 transition-[border-color,box-shadow,background-color] focus-within:border-ring focus-within:bg-background focus-within:ring-3 focus-within:ring-ring/30">
              <FinanceIconPicker embedded preferredKind="bank" value={accountIcon} onValueChange={(icon) => { setAccountIcon(icon); setAccountColor(iconColor(icon)); setIconTouched(true); }} />
              <Input id="account-name" name="name" required value={accountName} onChange={(event) => { const name = event.target.value; const suggested = suggestFinanceIcon(name); setAccountName(name); if (!iconTouched) { const nextIcon = suggested ?? typeIcon[accountType]; setAccountIcon(nextIcon); setAccountColor(iconColor(nextIcon)); } }} className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-4 shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent" placeholder="Ej. Davivienda" disabled={saving} />
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">Reconocemos bancos y billeteras de Colombia; también puedes tocar el icono y elegirlo.</p>
          </div>
          <div>
            <Label htmlFor="account-type">Tipo</Label>
            <SelectControl id="account-type" name="type" value={accountType} onChange={(event) => { const nextType = event.target.value as AccountType; setAccountType(nextType); if (!iconTouched && !suggestFinanceIcon(accountName)) setAccountIcon(typeIcon[nextType]); }} containerClassName="mt-2" disabled={saving}>
              <option value="checking">Cuenta corriente</option><option value="savings">Ahorros</option><option value="cash">Efectivo</option><option value="credit">Crédito</option><option value="investment">Inversión</option>
            </SelectControl>
          </div>
          <div><Label htmlFor="initial-balance">Saldo inicial</Label><Input id="initial-balance" name="initialBalance" type="text" inputMode="decimal" className="mt-2 h-12 text-base tabular-nums" value={initialBalance} onChange={(event) => setInitialBalance(formatMoneyInput(event.target.value, profile?.currencyCode, { allowNegative: true }))} disabled={saving} /></div>
          <Button type="submit" className="h-12 w-full rounded-2xl" disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : null}{saving ? "Creando…" : "Crear cuenta"}</Button>
        </form>
      </DialogContent>
    </Dialog>
    <IncomeTypeDialog key={incomeTypeDialog === "new" ? "new" : incomeTypeDialog?.id ?? "closed"} open={incomeTypeDialog !== null} incomeType={incomeTypeDialog === "new" ? undefined : incomeTypeDialog ?? undefined} onOpenChange={(next) => !next && setIncomeTypeDialog(null)} onSave={async (incomeType) => { await upsertIncomeType(incomeType); setIncomeTypeDialog(null); toast.success(incomeTypeDialog === "new" ? "Tipo de ingreso creado" : "Tipo de ingreso actualizado"); }} />
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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try { await onSave({ id: incomeType?.id ?? crypto.randomUUID(), name: name.trim(), color, icon }); }
    finally { setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}><DialogContent showCloseButton={!saving} className="max-sm:max-h-[92dvh] sm:max-w-md"><form onSubmit={submit}><DialogHeader><p className="text-xs uppercase tracking-[.14em] text-primary">Clasifica tus entradas</p><DialogTitle>{incomeType ? "Editar tipo de ingreso" : "Nuevo tipo de ingreso"}</DialogTitle><DialogDescription>El nombre y el icono aparecerán en el formulario de movimientos y en tu historial.</DialogDescription></DialogHeader><div className="space-y-5 py-5"><div className="space-y-2"><Label htmlFor="income-type-name">Nombre</Label><Input id="income-type-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="Ej. Nómina, ventas o bonificación" disabled={saving} autoFocus /></div><div className="space-y-2"><Label>Color</Label><div className="flex flex-wrap gap-3">{incomePalette.map((item) => <button key={item} type="button" onClick={() => setColor(item)} className="size-10 rounded-full transition-transform duration-150 active:scale-95" style={{ backgroundColor: item, outline: color === item ? `2px solid ${item}` : undefined, outlineOffset: color === item ? 3 : undefined }} aria-label={`Usar color ${item}`} aria-pressed={color === item} disabled={saving} />)}</div></div><div className="space-y-2"><Label>Icono</Label><FinanceIconPicker value={icon} onValueChange={setIcon} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button><Button type="submit" disabled={!name.trim() || saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : null}{saving ? "Guardando…" : incomeType ? "Guardar cambios" : "Crear tipo"}</Button></DialogFooter></form></DialogContent></Dialog>;
}
