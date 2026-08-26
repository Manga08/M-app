"use client";

import { useEffect, useState } from "react";
import { Archive, BadgeDollarSign, LoaderCircle, MoreHorizontal, Pencil, Plus, RefreshCw } from "lucide-react";
import { FinanceIdentityField, FINANCE_IDENTITY_COLORS } from "@/components/finance-identity-field";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { PaginationControls } from "@/components/pagination-controls";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DateControl, InputControl, SelectControl } from "@/components/ui/form-control";
import { FormDialogActions, FormDialogBody, FormDialogContent } from "@/components/ui/form-dialog";
import { Label } from "@/components/ui/label";
import { accountBalance, accountBaseBalance, currencyFormatter } from "@/lib/finance/calculations";
import { availableTone, financialToneClass } from "@/lib/finance/financial-status";
import { bankIconBySlug } from "@/lib/finance/bank-icon-catalog";
import { FinanceIcon, suggestFinanceIcon } from "@/lib/finance/icon-catalog";
import { activeIncomeTypes } from "@/lib/finance/income-types";
import { announceMutation, announceMutationError } from "@/lib/finance/mutation-feedback";
import { formatMoneyInput, formatMoneyInputValue, parseMoneyInput } from "@/lib/finance/money-input";
import { getOfficialTrm } from "@/lib/finance/exchange-rate";
import { localIsoDate } from "@/lib/finance/calculations";
import type { Account, AccountType, Category, IncomeTypeInput } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const typeLabel: Record<AccountType, string> = { checking: "Cuenta corriente", savings: "Ahorros", cash: "Efectivo", credit: "Crédito", investment: "Inversión" };
const typeIcon: Record<AccountType, string> = { checking: "building", savings: "landmark", cash: "banknote", credit: "wallet", investment: "chart-no-axes-combined" };

export function AccountsPage() {
  const { profile, accounts, categories, transactions, financialTargets, snapshot, mutate } = useFinance();
  const [open, setOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [incomeTypePage, setIncomeTypePage] = useState(1);
  const [incomeTypeDialog, setIncomeTypeDialog] = useState<Category | "new" | null>(null);
  const [accountName, setAccountName] = useState("");
  const [initialBalance, setInitialBalance] = useState("0");
  const [accountType, setAccountType] = useState<AccountType>("checking");
  const [accountIcon, setAccountIcon] = useState(typeIcon.checking);
  const [accountColor, setAccountColor] = useState("#34d399");
  const [accountCurrency, setAccountCurrency] = useState<"COP" | "USD">("COP");
  const [balanceDate, setBalanceDate] = useState(() => localIsoDate());
  const [exchangeRate, setExchangeRate] = useState("");
  const [referenceRate, setReferenceRate] = useState<number | undefined>();
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [rateTouched, setRateTouched] = useState(false);
  const [iconTouched, setIconTouched] = useState(false);
  const [colorTouched, setColorTouched] = useState(false);
  const money = currencyFormatter(profile?.currencyCode);
  const balances = accounts.map((account) => ({ account, balance: accountBalance(account, transactions, snapshot), baseBalance: accountBaseBalance(account, transactions, snapshot) }));
  const total = snapshot?.netWorth ?? balances.reduce((sum, item) => sum + item.baseBalance, 0);
  const positiveBalanceTotal = balances.reduce((sum, item) => sum + Math.max(0, item.baseBalance), 0);
  const balanceSegments = balances.filter((item) => item.baseBalance > 0);
  let segmentEnd = 0;
  const balanceGradient = positiveBalanceTotal > 0
    ? `conic-gradient(${balanceSegments.map(({ account, baseBalance }) => {
      const start = segmentEnd;
      segmentEnd += (baseBalance / positiveBalanceTotal) * 100;
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

  useEffect(() => {
    if (!open || accountCurrency !== "USD" || !balanceDate) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => setRateLoading(true)).then(() => getOfficialTrm(balanceDate, controller.signal)).then((quote) => {
      setReferenceRate(quote.rate);
      if (!rateTouched) setExchangeRate(formatMoneyInputValue(quote.rate, "USD"));
      setRateError(null);
    }).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRateError(error instanceof Error ? error.message : "No pudimos consultar la TRM.");
    }).finally(() => setRateLoading(false));
    return () => controller.abort();
  }, [accountCurrency, balanceDate, open, rateTouched]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const targetBalance = parseMoneyInput(initialBalance);
      const rate = accountCurrency === "USD" ? parseMoneyInput(exchangeRate) : 1;
      const result = editingAccount
        ? await mutate.updateAccount({
          account: { ...editingAccount, name: accountName.trim(), type: accountType, color: accountColor, icon: accountIcon, currencyCode: accountCurrency },
          targetBalance,
          adjustmentDate: balanceDate,
          exchangeRate: rate,
          referenceExchangeRate: referenceRate,
          referenceRateSource: referenceRate ? "sfc_trm" : undefined,
        })
        : await mutate.addAccount({ name: accountName.trim(), type: accountType, initialBalance: targetBalance, color: accountColor, icon: accountIcon, currencyCode: accountCurrency, openingBalanceDate: balanceDate, openingExchangeRate: rate });
      announceMutation(result, editingAccount ? "Cuenta actualizada" : "Cuenta creada"); setOpen(false);
    } catch (error) {
      announceMutationError(error, "No pudimos crear la cuenta.");
    } finally { setSaving(false); }
  }

  function openCreateAccount() {
    setEditingAccount(null);
    setAccountName("");
    setInitialBalance("0");
    setAccountType("checking");
    setAccountIcon(typeIcon.checking);
    setAccountColor("#34d399");
    setIconTouched(false);
    setColorTouched(false);
    setAccountCurrency("COP");
    setBalanceDate(localIsoDate());
    setExchangeRate(""); setReferenceRate(undefined); setRateTouched(false); setRateError(null);
    setOpen(true);
  }

  function openEditAccount(account: Account, balance: number) {
    setEditingAccount(account);
    setAccountName(account.name); setInitialBalance(formatMoneyInputValue(balance, account.currencyCode));
    setAccountType(account.type); setAccountIcon(account.icon || typeIcon[account.type]); setAccountColor(account.color);
    setAccountCurrency(account.currencyCode === "USD" ? "USD" : "COP"); setBalanceDate(localIsoDate());
    setExchangeRate(account.currencyCode === "USD" && account.openingExchangeRate ? formatMoneyInputValue(account.openingExchangeRate, "USD") : "1");
    setReferenceRate(undefined); setRateTouched(false); setRateError(null); setIconTouched(true); setColorTouched(true); setOpen(true);
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
      <section className="min-w-0"><div className="mb-5"><h2 className="text-xl font-medium tracking-tight">Todas las cuentas</h2><p className="mt-1 text-sm text-muted-foreground">Saldo real por cuenta; los ajustes no se cuentan como ingresos.</p></div><div role="list" className="space-y-1 sm:divide-y sm:space-y-0">{visibleBalances.map(({ account, balance, baseBalance }) => { const linkedTargets = financialTargets.filter((target) => target.accountId === account.id && target.status !== "archived").length; const nativeMoney = currencyFormatter(account.currencyCode ?? profile?.currencyCode); return <button type="button" key={account.id} role="listitem" onClick={() => openEditAccount(account, balance)} className="group grid min-h-[82px] w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl py-3 text-left outline-none transition-colors duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] hover:bg-secondary/30 focus-visible:ring-2 focus-visible:ring-ring sm:gap-4"><span className="grid size-11 place-items-center rounded-2xl" style={{ backgroundColor: `${account.color}1f`, color: account.color }}><FinanceIcon name={account.icon || typeIcon[account.type]} className="size-7" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{account.name}</span><span className="block truncate text-xs text-muted-foreground">{typeLabel[account.type]} · {account.currencyCode ?? "COP"}{linkedTargets ? ` · ${linkedTargets} ${linkedTargets === 1 ? "meta vinculada" : "metas vinculadas"}` : ""}</span></span><span className="min-w-0 text-right"><span className={cn("block text-sm font-medium tabular-nums sm:text-base", financialToneClass[availableTone(balance)])}>{nativeMoney.format(balance)}</span>{account.currencyCode === "USD" ? <span className="block text-[11px] text-muted-foreground">≈ {money.format(baseBalance)}</span> : null}</span><Pencil className="size-4 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" /><span className="sr-only">Editar {account.name}</span></button>; })}</div><PaginationControls page={page} pageCount={pageCount} onPageChange={setPage} total={balances.length} label="cuentas" /></section>
      <section id="tipos-de-ingreso" className="min-w-0 scroll-mt-24">
      <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div><div className="flex items-center gap-2"><BadgeDollarSign className="size-5 text-primary" /><h2 className="text-xl font-medium tracking-tight">Tipos de ingreso</h2></div><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Define cómo quieres clasificar nómina, ventas, bonificaciones u otras entradas. Aparecerán al registrar un ingreso.</p></div>
        <Button variant="outline" className="h-11 shrink-0 rounded-full max-sm:w-full" onClick={() => setIncomeTypeDialog("new")}><Plus className="size-4" />Nuevo tipo</Button>
      </div>
      {visibleIncomeTypes.length ? <div className="space-y-1 sm:divide-y sm:space-y-0">{visibleIncomeTypes.map((incomeType) => <IncomeTypeRow key={incomeType.id} incomeType={incomeType} onEdit={() => setIncomeTypeDialog(incomeType)} onArchive={() => archiveIncomeTypeItem(incomeType)} />)}</div> : <button type="button" onClick={() => setIncomeTypeDialog("new")} className="flex min-h-32 w-full items-center justify-center gap-2 rounded-2xl border border-dashed text-sm text-muted-foreground transition-colors duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] hover:border-primary/40 hover:text-foreground"><Plus className="size-4" />Crear el primer tipo de ingreso</button>}
      <PaginationControls page={safeIncomeTypePage} pageCount={incomeTypePageCount} onPageChange={setIncomeTypePage} total={incomeTypes.length} label="tipos de ingreso" />
      </section>
    </div>
    <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
      <FormDialogContent variant="compact" showCloseButton={!saving}>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <FormDialogBody className="space-y-5">
            <DialogHeader className="mb-7 pr-8">
              <p className="text-xs uppercase tracking-[.14em] text-primary">{editingAccount ? "Conciliación segura" : "Organiza tu dinero"}</p>
              <DialogTitle className="pr-0 text-2xl">{editingAccount ? "Editar cuenta" : "Nueva cuenta"}</DialogTitle>
              <DialogDescription>{editingAccount ? "Los cambios de saldo se guardan como ajustes de patrimonio y conservan tu historial." : "Identifica dónde vive tu dinero y su saldo inicial."}</DialogDescription>
            </DialogHeader>
          <FinanceIdentityField
            id="account-name"
            value={accountName}
            onValueChange={(name) => {
              const suggested = suggestFinanceIcon(name);
              setAccountName(name);
              if (!iconTouched) {
                const nextIcon = suggested ?? typeIcon[accountType];
                setAccountIcon(nextIcon);
                if (!colorTouched) setAccountColor(iconColor(nextIcon));
              }
            }}
            icon={accountIcon}
            onIconChange={(icon) => { setAccountIcon(icon); if (!colorTouched) setAccountColor(iconColor(icon)); setIconTouched(true); }}
            color={accountColor}
            onColorChange={(color) => { setAccountColor(color); setColorTouched(true); }}
            preferredKind="bank"
            required
            disabled={saving}
            placeholder="Ej. Davivienda"
            helpText="Reconocemos bancos y billeteras de Colombia; también puedes elegir cualquier icono y color."
            colorLabel="Color de la cuenta"
          />
          <div>
            <Label htmlFor="account-currency">Moneda</Label>
            <SelectControl id="account-currency" name="currency" value={accountCurrency} onValueChange={(value) => { setAccountCurrency(value as "COP" | "USD"); setRateTouched(false); }} containerClassName="mt-2" disabled={saving || Boolean(editingAccount && transactions.some((item) => item.accountId === editingAccount.id))}>
              <option value="COP">Peso colombiano (COP)</option><option value="USD">Dólar estadounidense (USD)</option>
            </SelectControl>
            {editingAccount && transactions.some((item) => item.accountId === editingAccount.id) ? <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">La moneda queda fija después del primer movimiento para proteger el historial.</p> : null}
          </div>
          <div>
            <Label htmlFor="account-type">Tipo</Label>
            <SelectControl id="account-type" name="type" value={accountType} onValueChange={(value) => { const nextType = value as AccountType; setAccountType(nextType); if (!iconTouched && !suggestFinanceIcon(accountName)) { const nextIcon = typeIcon[nextType]; setAccountIcon(nextIcon); if (!colorTouched) setAccountColor(iconColor(nextIcon)); } }} containerClassName="mt-2" disabled={saving}>
              <option value="checking">Cuenta corriente</option><option value="savings">Ahorros</option><option value="cash">Efectivo</option><option value="credit">Crédito</option><option value="investment">Inversión</option>
            </SelectControl>
          </div>
          <div><Label htmlFor="initial-balance">{editingAccount ? "Saldo actual" : "Saldo inicial"}</Label><InputControl id="initial-balance" name="initialBalance" type="text" inputMode="decimal" containerClassName="mt-2" className="text-base tabular-nums" value={initialBalance} onChange={(event) => setInitialBalance(formatMoneyInput(event.target.value, accountCurrency, { allowNegative: true }))} disabled={saving} /><p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{editingAccount ? "Si cambia, Moneva creará un ajuste de saldo; no un ingreso ni un gasto." : "Es patrimonio con el que comienzas, no un ingreso del mes."}</p></div>
          <div><Label htmlFor="balance-date">{editingAccount ? "Fecha del ajuste" : "Fecha del saldo inicial"}</Label><DateControl id="balance-date" value={balanceDate} onValueChange={setBalanceDate} containerClassName="mt-2" required disabled={saving} /></div>
          {accountCurrency === "USD" ? <div className="rounded-2xl bg-secondary/35 p-4"><div className="flex items-center justify-between gap-3"><div><Label htmlFor="exchange-rate">TRM aplicada</Label><p className="mt-1 text-[11px] leading-4 text-muted-foreground">COP por cada USD. Puedes reemplazarla por la tasa real de tu banco.</p></div>{rateLoading ? <LoaderCircle className="size-4 animate-spin text-primary motion-reduce:animate-none" /> : <RefreshCw className="size-4 text-primary" />}</div><InputControl id="exchange-rate" type="text" inputMode="decimal" containerClassName="mt-3" value={exchangeRate} onChange={(event) => { setExchangeRate(formatMoneyInput(event.target.value, "USD")); setRateTouched(true); }} leading={<span className="text-xs font-medium">COP</span>} required disabled={saving} />{referenceRate ? <p className="mt-2 text-xs text-muted-foreground">Referencia oficial: {currencyFormatter("COP").format(referenceRate)} · {balanceDate}</p> : null}{rateError ? <p className="mt-2 text-xs text-warning" role="status">{rateError}</p> : null}<p className="mt-2 text-xs font-medium text-foreground">Equivale a ≈ {money.format(parseMoneyInput(initialBalance) * parseMoneyInput(exchangeRate))}</p></div> : null}
          </FormDialogBody>
          <FormDialogActions>
            <Button type="submit" className="h-12 w-full rounded-2xl sm:w-auto sm:min-w-40" disabled={saving || !accountName.trim() || (accountCurrency === "USD" && !(parseMoneyInput(exchangeRate) > 0))}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : null}{saving ? "Guardando…" : editingAccount ? "Guardar cuenta" : "Crear cuenta"}</Button>
            <Button type="button" variant="outline" className="h-12 w-full rounded-2xl sm:w-auto" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
          </FormDialogActions>
        </form>
      </FormDialogContent>
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
  const [color, setColor] = useState(incomeType?.color ?? FINANCE_IDENTITY_COLORS[0]);
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

  return <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}><FormDialogContent variant="compact" showCloseButton={!saving}><form onSubmit={submit} className="flex min-h-0 flex-1 flex-col"><FormDialogBody><DialogHeader className="pr-8"><p className="text-xs uppercase tracking-[.14em] text-primary">Clasifica tus entradas</p><DialogTitle>{incomeType ? "Editar tipo de ingreso" : "Nuevo tipo de ingreso"}</DialogTitle><DialogDescription>El nombre, icono y color aparecerán en el formulario de movimientos y en tu historial.</DialogDescription></DialogHeader><FinanceIdentityField id="income-type-name" value={name} onValueChange={(value) => { setName(value); setError(null); }} icon={icon} onIconChange={setIcon} color={color} onColorChange={setColor} placeholder="Ej. Nómina, ventas o bonificación" required disabled={saving} autoFocus colorLabel="Color del ingreso" />{error ? <p role="alert" className="mt-5 rounded-xl border border-destructive/35 bg-destructive/8 px-3 py-2 text-sm text-destructive">{error}</p> : null}</FormDialogBody><FormDialogActions><Button type="submit" className="h-12 w-full rounded-2xl sm:w-auto" disabled={!name.trim() || saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : null}{saving ? "Guardando…" : incomeType ? "Guardar cambios" : "Crear tipo"}</Button><Button type="button" variant="outline" className="h-12 w-full rounded-2xl sm:w-auto" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button></FormDialogActions></form></FormDialogContent></Dialog>;
}
