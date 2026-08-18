"use client";

import { useState } from "react";
import { Banknote, Building2, ChevronRight, CreditCard, Landmark, Plus, WalletCards, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { toast } from "sonner";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountBalance, currencyFormatter } from "@/lib/finance/calculations";
import type { AccountType } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const typeLabel: Record<AccountType, string> = { checking: "Cuenta corriente", savings: "Ahorros", cash: "Efectivo", credit: "Crédito", investment: "Inversión" };
const typeIcon = { checking: Building2, savings: Landmark, cash: Banknote, credit: CreditCard, investment: WalletCards };

export function AccountsPage() {
  const { profile, accounts, transactions, snapshot, addAccount } = useFinance();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const money = currencyFormatter(profile?.currencyCode);
  const balances = accounts.map((account) => ({ account, balance: accountBalance(account, transactions, snapshot) }));
  const total = balances.reduce((sum, item) => sum + item.balance, 0);
  const pageCount = Math.max(1, Math.ceil(balances.length / 8));
  const visibleBalances = balances.slice((page - 1) * 8, page * 8);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await addAccount({ name: String(data.get("name")), type: String(data.get("type")) as AccountType, initialBalance: Number(data.get("initialBalance") || 0), color: "#34d399" });
    toast.success("Cuenta creada"); setOpen(false);
  }

  return <>
    <PageHeader eyebrow="Tu patrimonio" title="Cuentas" description="El saldo de cada lugar donde vive tu dinero. Las transferencias mueven valor entre cuentas sin inflar ingresos o gastos." action={<Button onClick={() => setOpen(true)} className="rounded-full"><Plus className="size-4" />Nueva cuenta</Button>} />
    <section className="grid gap-8 border-b pb-9 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
      <div><p className="text-sm text-muted-foreground">Patrimonio líquido estimado</p><p className="mt-2 text-[clamp(2.7rem,7vw,5.4rem)] font-medium leading-none tracking-[-0.065em]">{money.format(total)}</p><p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Incluye saldos de efectivo y bancos, menos el saldo usado en productos de crédito.</p></div>
      <div className="flex items-center gap-5 lg:border-l lg:pl-10"><div className="relative grid size-24 shrink-0 place-items-center rounded-full" style={{ background: "conic-gradient(#34d399 0 56%, #a78bfa 56% 72%, #60a5fa 72% 91%, #fb923c 91%)" }}><span className="grid size-16 place-items-center rounded-full bg-background text-sm font-medium">{accounts.length}<br /></span></div><div><p className="font-medium">Diversificado</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Tu dinero está distribuido en {accounts.length} cuentas.</p></div></div>
    </section>
    <section className="pt-8"><div className="mb-5"><h2 className="text-xl font-medium tracking-tight">Todas las cuentas</h2><p className="mt-1 text-sm text-muted-foreground">Saldo calculado con tus movimientos.</p></div><div>{visibleBalances.map(({ account, balance }) => { const Icon = typeIcon[account.type]; return <button key={account.id} type="button" className="grid min-h-[82px] w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 border-b py-3 text-left hover:bg-foreground/[0.025] sm:gap-4"><span className="grid size-11 place-items-center rounded-2xl" style={{ backgroundColor: `${account.color}1f`, color: account.color }}><Icon className="size-5" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{account.name}</span><span className="block truncate text-xs text-muted-foreground">{typeLabel[account.type]}</span></span><span className={cn("text-right text-sm font-medium tabular-nums sm:text-base", balance < 0 && "text-destructive")}>{money.format(balance)}</span><ChevronRight className="hidden size-4 text-muted-foreground sm:block" /></button>; })}</div><PaginationControls page={page} pageCount={pageCount} onPageChange={setPage} total={balances.length} label="cuentas" /></section>
    <AnimatePresence>{open && <m.div className="fixed inset-0 z-50 grid place-items-end bg-black/55 p-0 sm:place-items-center sm:p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}><m.div role="dialog" aria-modal="true" aria-labelledby="new-account-title" className="mobile-scroll max-h-[88dvh] w-full overflow-y-auto rounded-t-[1.75rem] border bg-popover p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-3xl" initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}><div className="mb-6 flex items-center justify-between"><div><p className="text-xs uppercase tracking-[.14em] text-primary">Organiza tu dinero</p><h2 id="new-account-title" className="mt-1 text-2xl font-medium">Nueva cuenta</h2></div><Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Cerrar"><X className="size-5" /></Button></div><form className="space-y-5" onSubmit={submit}><div><Label htmlFor="account-name">Nombre</Label><Input id="account-name" name="name" required className="mt-2 h-12" placeholder="Ej. Davivienda" /></div><div><Label htmlFor="account-type">Tipo</Label><select id="account-type" name="type" className="mt-2 h-12 w-full rounded-xl border bg-background px-3 text-sm"><option value="checking">Cuenta corriente</option><option value="savings">Ahorros</option><option value="cash">Efectivo</option><option value="credit">Crédito</option><option value="investment">Inversión</option></select></div><div><Label htmlFor="initial-balance">Saldo inicial</Label><Input id="initial-balance" name="initialBalance" type="number" className="mt-2 h-12" defaultValue="0" /></div><Button type="submit" className="h-12 w-full rounded-full">Crear cuenta</Button></form></m.div></m.div>}</AnimatePresence>
  </>;
}
