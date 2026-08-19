"use client";

import { useState } from "react";
import { ChevronRight, LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { FinanceIconPicker } from "@/components/finance-icon-picker";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SelectControl } from "@/components/ui/form-control";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountBalance, currencyFormatter } from "@/lib/finance/calculations";
import { FinanceIcon, suggestFinanceIcon } from "@/lib/finance/icon-catalog";
import type { AccountType } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const typeLabel: Record<AccountType, string> = { checking: "Cuenta corriente", savings: "Ahorros", cash: "Efectivo", credit: "Crédito", investment: "Inversión" };
const typeIcon: Record<AccountType, string> = { checking: "building", savings: "landmark", cash: "banknote", credit: "wallet", investment: "chart-no-axes-combined" };

export function AccountsPage() {
  const { profile, accounts, transactions, snapshot, addAccount } = useFinance();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("checking");
  const [accountIcon, setAccountIcon] = useState(typeIcon.checking);
  const [iconTouched, setIconTouched] = useState(false);
  const money = currencyFormatter(profile?.currencyCode);
  const balances = accounts.map((account) => ({ account, balance: accountBalance(account, transactions, snapshot) }));
  const total = balances.reduce((sum, item) => sum + item.balance, 0);
  const pageCount = Math.max(1, Math.ceil(balances.length / 8));
  const visibleBalances = balances.slice((page - 1) * 8, page * 8);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await addAccount({ name: accountName.trim(), type: accountType, initialBalance: Number(data.get("initialBalance") || 0), color: "#34d399", icon: accountIcon });
      toast.success("Cuenta creada"); setOpen(false);
    } finally { setSaving(false); }
  }

  function openCreateAccount() {
    setAccountName("");
    setAccountType("checking");
    setAccountIcon(typeIcon.checking);
    setIconTouched(false);
    setOpen(true);
  }

  return <>
    <PageHeader eyebrow="Tu patrimonio" title="Cuentas" description="El saldo de cada lugar donde vive tu dinero. Las transferencias mueven valor entre cuentas sin inflar ingresos o gastos." action={<Button onClick={openCreateAccount} className="rounded-full"><Plus className="size-4" />Nueva cuenta</Button>} />
    <section className="grid gap-8 border-b pb-9 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
      <div><p className="text-sm text-muted-foreground">Patrimonio líquido estimado</p><p className="mt-2 text-[clamp(2rem,10vw,5.4rem)] font-medium leading-none tracking-[-0.065em] tabular-nums">{money.format(total)}</p><p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Incluye saldos de efectivo y bancos, menos el saldo usado en productos de crédito.</p></div>
      <div className="flex items-center gap-5 lg:border-l lg:pl-10"><div className="relative grid size-24 shrink-0 place-items-center rounded-full" style={{ background: "conic-gradient(#34d399 0 56%, #a78bfa 56% 72%, #60a5fa 72% 91%, #fb923c 91%)" }}><span className="grid size-16 place-items-center rounded-full bg-background text-sm font-medium">{accounts.length}<br /></span></div><div><p className="font-medium">Diversificado</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Tu dinero está distribuido en {accounts.length} cuentas.</p></div></div>
    </section>
    <section className="pt-8"><div className="mb-5"><h2 className="text-xl font-medium tracking-tight">Todas las cuentas</h2><p className="mt-1 text-sm text-muted-foreground">Saldo calculado con tus movimientos.</p></div><div>{visibleBalances.map(({ account, balance }) => <button key={account.id} type="button" className="grid min-h-[82px] w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 border-b py-3 text-left transition-colors hover:bg-foreground/[0.025] active:bg-secondary/55 sm:gap-4"><span className="grid size-11 place-items-center rounded-2xl" style={{ backgroundColor: `${account.color}1f`, color: account.color }}><FinanceIcon name={account.icon || typeIcon[account.type]} className="size-7" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{account.name}</span><span className="block truncate text-xs text-muted-foreground">{typeLabel[account.type]}</span></span><span className={cn("text-right text-sm font-medium tabular-nums sm:text-base", balance < 0 && "text-destructive")}>{money.format(balance)}</span><ChevronRight className="hidden size-4 text-muted-foreground sm:block" /></button>)}</div><PaginationControls page={page} pageCount={pageCount} onPageChange={setPage} total={balances.length} label="cuentas" /></section>
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
              <FinanceIconPicker embedded preferredKind="bank" value={accountIcon} onValueChange={(icon) => { setAccountIcon(icon); setIconTouched(true); }} />
              <Input id="account-name" name="name" required value={accountName} onChange={(event) => { const name = event.target.value; const suggested = suggestFinanceIcon(name); setAccountName(name); if (!iconTouched) setAccountIcon(suggested ?? typeIcon[accountType]); }} className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-4 shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent" placeholder="Ej. Davivienda" disabled={saving} />
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">Reconocemos bancos y billeteras de Colombia; también puedes tocar el icono y elegirlo.</p>
          </div>
          <div>
            <Label htmlFor="account-type">Tipo</Label>
            <SelectControl id="account-type" name="type" value={accountType} onChange={(event) => { const nextType = event.target.value as AccountType; setAccountType(nextType); if (!iconTouched && !suggestFinanceIcon(accountName)) setAccountIcon(typeIcon[nextType]); }} containerClassName="mt-2" disabled={saving}>
              <option value="checking">Cuenta corriente</option><option value="savings">Ahorros</option><option value="cash">Efectivo</option><option value="credit">Crédito</option><option value="investment">Inversión</option>
            </SelectControl>
          </div>
          <div><Label htmlFor="initial-balance">Saldo inicial</Label><Input id="initial-balance" name="initialBalance" type="number" className="mt-2 h-12" defaultValue="0" disabled={saving} /></div>
          <Button type="submit" className="h-12 w-full rounded-2xl" disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : null}{saving ? "Creando…" : "Crear cuenta"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
