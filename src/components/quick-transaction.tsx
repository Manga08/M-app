"use client";

import { useMemo, useState } from "react";
import { ChevronRight, CreditCard, Landmark, Utensils, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useFinance } from "@/components/finance-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TransactionInput } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

export function QuickTransaction({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { accounts, categories, addTransaction } = useFinance();
  const [type, setType] = useState<TransactionInput["type"]>("expense");
  const [saving, setSaving] = useState(false);
  const expenseCategories = useMemo(() => categories.filter((category) => category.kind === (type === "income" ? "income" : "expense")), [categories, type]);

  function close() {
    setSaving(false);
    onOpenChange(false);
  }

  function trapKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]')).filter((element) => element.offsetParent !== null);
    const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input: TransactionInput = {
      type,
      amount: Number(String(data.get("amount") ?? "0").replaceAll(".", "").replace(",", ".")),
      accountId: String(data.get("accountId")),
      destinationAccountId: type === "transfer" ? String(data.get("destinationAccountId")) : undefined,
      categoryId: type !== "transfer" ? String(data.get("categoryId")) : undefined,
      description: String(data.get("description") || (type === "income" ? "Ingreso" : type === "expense" ? "Gasto" : "Transferencia")),
      merchant: String(data.get("merchant") || "") || undefined,
      note: String(data.get("note") || "") || undefined,
      occurredOn: String(data.get("occurredOn")),
    };
    if (!input.amount || input.amount < 0 || (type === "transfer" && input.accountId === input.destinationAccountId)) return;
    setSaving(true);
    await addTransaction(input);
    window.setTimeout(close, 450);
  }

  return <AnimatePresence>{open && <motion.div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <motion.div role="dialog" aria-modal="true" aria-labelledby="quick-add-title" onKeyDown={trapKeyboard} className="absolute inset-x-0 bottom-0 max-h-[94vh] overflow-y-auto rounded-t-[1.75rem] border-t bg-popover p-5 shadow-2xl sm:inset-y-0 sm:left-auto sm:w-[440px] sm:rounded-none sm:border-l sm:border-t-0 sm:p-7" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 360, damping: 34 }}>
      <div className="mb-7 flex items-center justify-between"><div><p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">Movimiento rápido</p><h2 id="quick-add-title" className="mt-1 text-2xl font-medium tracking-tight">¿Qué pasó con tu dinero?</h2></div><Button type="button" variant="ghost" size="icon" onClick={close} aria-label="Cerrar"><X className="size-5" /></Button></div>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Tipo de movimiento">{(["expense", "income", "transfer"] as const).map((item) => <Button key={item} type="button" variant={type === item ? "secondary" : "outline"} onClick={() => setType(item)} className={cn("h-11", type === item && item === "expense" && "border border-destructive/35 bg-destructive/10 text-destructive", type === item && item !== "expense" && "border border-primary/35 bg-primary/10 text-primary")}>{item === "expense" ? "Gasto" : item === "income" ? "Ingreso" : "Transferir"}</Button>)}</div>
        <div><Label htmlFor="amount">Monto</Label><div className="relative mt-2"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span><Input id="amount" name="amount" inputMode="decimal" autoFocus required placeholder="0" className="h-16 pl-9 text-2xl font-medium tracking-tight" /></div></div>
        <div className="grid grid-cols-2 gap-3">
          <FieldSelect label={type === "transfer" ? "Desde" : "Cuenta"} name="accountId" icon={<CreditCard className="size-4 text-primary" />} defaultValue={accounts[0]?.id} options={accounts.map((account) => ({ value: account.id, label: account.name }))} />
          {type === "transfer" ? <FieldSelect label="Hacia" name="destinationAccountId" icon={<Landmark className="size-4 text-primary" />} defaultValue={accounts[1]?.id} options={accounts.map((account) => ({ value: account.id, label: account.name }))} /> : <FieldSelect label="Categoría" name="categoryId" icon={<Utensils className="size-4 text-rose-300" />} defaultValue={expenseCategories[0]?.id} options={expenseCategories.map((category) => ({ value: category.id, label: category.name }))} />}
        </div>
        <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="occurredOn">Fecha</Label><Input id="occurredOn" name="occurredOn" type="date" required defaultValue="2026-08-17" className="mt-2 h-12" /></div><div><Label htmlFor="merchant">Comercio <span className="text-muted-foreground">(opcional)</span></Label><Input id="merchant" name="merchant" className="mt-2 h-12" placeholder="Ej. D1" /></div></div>
        <div><Label htmlFor="description">Descripción</Label><Input id="description" name="description" className="mt-2 h-12" placeholder="Ej. Cena con amigos" /></div>
        <div><Label htmlFor="note">Nota <span className="text-muted-foreground">(opcional)</span></Label><Textarea id="note" name="note" className="mt-2 min-h-20 resize-none" placeholder="Algo que quieras recordar" /></div>
        <div className="rounded-2xl bg-secondary/70 p-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-primary/15 text-primary"><Landmark className="size-4" /></span><div><p className="text-sm font-medium">Impacto instantáneo</p><p className="text-xs text-muted-foreground">Saldo y presupuesto se recalculan al guardar.</p></div></div></div>
        <Button type="submit" className="h-12 w-full rounded-full text-[15px]" disabled={saving}>{saving ? "Guardado ✓" : type === "expense" ? "Guardar gasto" : type === "income" ? "Guardar ingreso" : "Transferir dinero"}</Button>
      </form>
    </motion.div>
  </motion.div>}</AnimatePresence>;
}

function FieldSelect({ label, name, defaultValue, options, icon }: { label: string; name: string; defaultValue?: string; options: { value: string; label: string }[]; icon: React.ReactNode }) {
  return <div><Label htmlFor={name}>{label}</Label><div className="relative mt-2"><span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2">{icon}</span><select id={name} name={name} defaultValue={defaultValue} className="h-12 w-full appearance-none rounded-xl border bg-background pl-10 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="" disabled>Selecciona</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronRight className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 rotate-90 text-muted-foreground" /></div></div>;
}
