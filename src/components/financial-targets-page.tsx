"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, CalendarClock, Check, ChevronRight, CircleDollarSign, Flag, LoaderCircle, Pause, Pencil, Plus, RotateCcw, Sparkles, TrendingUp } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { FinanceIconPicker } from "@/components/finance-icon-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateControl, InputControl, SelectControl } from "@/components/ui/form-control";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaginationControls } from "@/components/pagination-controls";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { currencyFormatter, localIsoDate } from "@/lib/finance/calculations";
import { estimatedTargetCompletion, financialTargetProgress, targetKindLabel, targetProgressDuringMonth, targetStatusLabel } from "@/lib/finance/financial-targets";
import { announceMutation, announceMutationError } from "@/lib/finance/mutation-feedback";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import type { FinancialTarget, FinancialTargetEntryInput, FinancialTargetInput, FinancialTargetKind, FinancialTargetStatus } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const targetColors = ["#7C8CFF", "#2E9E6F", "#C58A2B", "#D45463", "#8167D9", "#2F8DA8"];
const PAGE_SIZE = 8;

type TargetFilter = "active" | "all" | "debt" | "completed";

export function FinancialTargetsPage() {
  const finance = useFinance();
  const router = useRouter();
  const searchParams = useSearchParams();
  const money = currencyFormatter(finance.profile?.currencyCode);
  const [filter, setFilter] = useState<TargetFilter>("active");
  const [page, setPage] = useState(1);
  const targetParam = searchParams.get("meta");
  const selected = finance.financialTargets.find((target) => target.id === targetParam);
  const creating = targetParam === "nueva";
  const editing = searchParams.get("editar") === "1";
  const visible = useMemo(() => finance.financialTargets
    .filter((target) => target.status !== "archived")
    .filter((target) => filter === "all" || filter === "active" && ["active", "paused"].includes(target.status) || filter === "debt" && target.kind === "debt" || filter === "completed" && target.status === "completed")
    .sort((a, b) => a.status.localeCompare(b.status) || a.priority - b.priority || b.updatedAt.localeCompare(a.updatedAt)), [filter, finance.financialTargets]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const paged = visible.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);
  const priority = finance.financialTargets.filter((target) => target.status === "active").sort((a, b) => a.priority - b.priority || b.updatedAt.localeCompare(a.updatedAt))[0];

  function navigate(value?: string, edit = false) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("meta", value); else params.delete("meta");
    if (edit) params.set("editar", "1"); else params.delete("editar");
    router.push(`/metas${params.size ? `?${params}` : ""}`, { scroll: false });
  }

  return <div className="min-w-0" data-financial-targets>
    <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl"><p className="text-[11px] font-medium uppercase tracking-[.14em] text-primary">Rumbo financiero</p><h1 className="mt-2 text-[clamp(2rem,4vw,3.25rem)] font-medium leading-none tracking-[-.055em]">Metas y deudas</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Convierte una intención en un recorrido claro. Moneva calcula el avance desde tus aportes y movimientos, sin alterar tus saldos dos veces.</p></div>
      <Button className="h-11 shrink-0 rounded-full px-5" onClick={() => navigate("nueva")}><Plus className="size-4" />Nueva meta</Button>
    </header>

    {priority ? <PriorityTarget target={priority} money={money} onOpen={() => navigate(priority.id)} entries={finance.financialTargetEntries} transactions={finance.transactions} rules={finance.recurringRules} /> : <EmptyTargets onCreate={() => navigate("nueva")} />}

    <section className="border-t pt-7" aria-labelledby="target-list-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="target-list-title" className="text-xl font-medium tracking-[-.03em]">Tu recorrido</h2><p className="mt-1 text-sm text-muted-foreground">Cada cifra conserva su fuente: inicial, manual o movimiento.</p></div><div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-secondary/65 p-1" aria-label="Filtrar metas">{([{ value: "active", label: "En curso" }, { value: "all", label: "Todas" }, { value: "debt", label: "Deudas" }, { value: "completed", label: "Cumplidas" }] as const).map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => { setFilter(item.value); setPage(1); }} className={cn("min-h-11 shrink-0 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-[color,background-color] duration-150 motion-reduce:transition-none", filter === item.value && "bg-background text-foreground shadow-sm")}>{item.label}</button>)}</div></div>
      <div className="mt-5 divide-y">{paged.length ? paged.map((target) => <TargetRow key={target.id} target={target} money={money} onOpen={() => navigate(target.id)} entries={finance.financialTargetEntries} transactions={finance.transactions} />) : <p className="py-10 text-center text-sm text-muted-foreground">No hay metas en este filtro.</p>}</div>
      <PaginationControls page={Math.min(page, pageCount)} pageCount={pageCount} onPageChange={setPage} total={visible.length} label="metas" />
    </section>

    <TargetDialog key={`form-${creating ? "new" : selected?.id ?? "closed"}`} open={creating || Boolean(selected && editing)} target={editing ? selected : undefined} onOpenChange={(open) => !open && navigate(selected?.id)} />
    <TargetDetailDialog key={`detail-${selected?.id ?? "none"}`} open={Boolean(selected && !editing)} target={selected} onOpenChange={(open) => !open && navigate()} onEdit={() => selected && navigate(selected.id, true)} />
  </div>;
}

function PriorityTarget({ target, money, onOpen, entries, transactions, rules }: { target: FinancialTarget; money: Intl.NumberFormat; onOpen: () => void; entries: ReturnType<typeof useFinance>["financialTargetEntries"]; transactions: ReturnType<typeof useFinance>["transactions"]; rules: ReturnType<typeof useFinance>["recurringRules"] }) {
  const progress = financialTargetProgress(target, entries, transactions);
  const pace = targetProgressDuringMonth(target.id, new Date().toISOString().slice(0, 7), entries, transactions);
  const estimate = estimatedTargetCompletion(target, progress, rules);
  return <section className="py-8 lg:py-10" aria-labelledby="priority-target-title">
    <button type="button" onClick={onOpen} className="group grid w-full min-w-0 gap-7 text-left outline-none sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end lg:grid-cols-[minmax(0,1.2fr)_minmax(250px,.55fr)] lg:gap-14" aria-label={`Abrir ${target.title}`}>
      <span className="min-w-0"><span className="flex items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ color: target.color, backgroundColor: `${target.color}18` }}><FinanceIcon name={target.icon} className="size-5" /></span><span><span className="block text-xs text-muted-foreground">Prioridad actual</span><span id="priority-target-title" className="mt-0.5 block text-xl font-medium tracking-[-.03em] group-hover:text-primary">{target.title}</span></span></span><span className="mt-7 block text-[11px] uppercase tracking-[.14em] text-muted-foreground">{target.mode === "pay_down" ? "Saldo por pagar" : "Falta por reunir"}</span><span className="mt-1 block break-words text-[clamp(1.9rem,8.5vw,4.5rem)] font-medium leading-none tracking-[-.05em] tabular-nums [overflow-wrap:anywhere]">{money.format(progress.remaining)}</span><Progress className="mt-6 h-2" indicatorClassName="bg-[var(--target-color)]" style={{ "--target-color": target.color } as React.CSSProperties} value={progress.rawProgress} max={target.targetAmount} label={`Avance de ${target.title}`} valueText={`${Math.round(progress.percent)}%, ${money.format(progress.remaining)} pendientes`} /><span className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground"><span>{money.format(progress.rawProgress)} de {money.format(target.targetAmount)}</span><span className="font-medium tabular-nums" style={{ color: target.color }}>{Math.round(progress.percent)}%</span></span></span>
      <span className="grid grid-cols-2 gap-px overflow-hidden border-y bg-border sm:min-w-[250px] lg:grid-cols-1"><TargetMetric label="Este mes" value={money.format(pace)} /><TargetMetric label="Ritmo previsto" value={estimate ? monthYear(estimate) : target.targetDate ? dateLabel(target.targetDate) : "Sin fecha"} /><span className="col-span-2 flex min-h-12 items-center justify-between bg-background px-4 text-sm font-medium text-primary lg:col-span-1">Ver recorrido <ChevronRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" /></span></span>
    </button>
  </section>;
}

function TargetMetric({ label, value }: { label: string; value: string }) { return <span className="min-w-0 bg-background px-4 py-4"><span className="block text-[11px] text-muted-foreground">{label}</span><span className="mt-1 block break-words text-sm font-medium tabular-nums [overflow-wrap:anywhere]">{value}</span></span>; }

function TargetRow({ target, money, onOpen, entries, transactions }: { target: FinancialTarget; money: Intl.NumberFormat; onOpen: () => void; entries: ReturnType<typeof useFinance>["financialTargetEntries"]; transactions: ReturnType<typeof useFinance>["transactions"] }) {
  const progress = financialTargetProgress(target, entries, transactions);
  return <button type="button" onClick={onOpen} className="group grid min-h-[78px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3 text-left outline-none transition-colors duration-150 hover:bg-secondary/25 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"><span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ color: target.color, backgroundColor: `${target.color}16` }}><FinanceIcon name={target.icon} className="size-5" /></span><span className="min-w-0"><span className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-medium group-hover:text-primary">{target.title}</span>{target.status !== "active" ? <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{targetStatusLabel(target.status)}</span> : null}</span><span className="mt-2 flex items-center gap-3"><Progress className="max-w-52" indicatorClassName="bg-[var(--target-color)]" style={{ "--target-color": target.color } as React.CSSProperties} value={progress.rawProgress} max={target.targetAmount} label={`Avance de ${target.title}`} valueText={`${Math.round(progress.percent)}%`} /><span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{Math.round(progress.percent)}%</span></span></span><span className="text-right"><span className="block text-sm font-medium tabular-nums">{money.format(progress.remaining)}</span><span className="text-[11px] text-muted-foreground">{target.mode === "pay_down" ? "por pagar" : "pendiente"}</span></span></button>;
}

function EmptyTargets({ onCreate }: { onCreate: () => void }) { return <section className="py-10"><div className="border-y py-9 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary"><Flag className="size-5" /></span><h2 className="mt-4 text-xl font-medium tracking-[-.03em]">Dale un destino a tu próximo peso</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Crea una meta de ahorro, una compra o una deuda. Podrás avanzar manualmente o enlazando movimientos reales.</p><Button className="mt-5 rounded-full" onClick={onCreate}><Plus className="size-4" />Crear la primera</Button></div></section>; }

function TargetDialog({ open, target, onOpenChange }: { open: boolean; target?: FinancialTarget; onOpenChange: (open: boolean) => void }) {
  const finance = useFinance();
  const today = localIsoDate(new Date(), finance.profile?.timezone);
  const debt = finance.financialTargetDebts.find((item) => item.targetId === target?.id);
  const [kind, setKind] = useState<FinancialTargetKind>(target?.kind ?? "savings");
  const [title, setTitle] = useState(target?.title ?? "");
  const [description, setDescription] = useState(target?.description ?? "");
  const [targetAmount, setTargetAmount] = useState(String(target?.targetAmount ?? ""));
  const [initialProgress, setInitialProgress] = useState(String(target?.initialProgress ?? 0));
  const [startsOn, setStartsOn] = useState(target?.startsOn ?? today);
  const [targetDate, setTargetDate] = useState(target?.targetDate ?? "");
  const [priority, setPriority] = useState(String(target?.priority ?? 3));
  const [color, setColor] = useState(target?.color ?? targetColors[0]);
  const [icon, setIcon] = useState(target?.icon ?? "target");
  const [accountId, setAccountId] = useState(target?.accountId ?? "");
  const [categoryId, setCategoryId] = useState(target?.categoryId ?? "");
  const [creditor, setCreditor] = useState(debt?.creditor ?? "");
  const [interest, setInterest] = useState(debt?.annualInterestRate === undefined ? "" : String(debt.annualInterestRate));
  const [minimumPayment, setMinimumPayment] = useState(debt?.minimumPayment === undefined ? "" : String(debt.minimumPayment));
  const [dueDay, setDueDay] = useState(debt?.dueDay === undefined ? "" : String(debt.dueDay));
  const [cover, setCover] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(null);
    const id = target?.id ?? crypto.randomUUID();
    const input: FinancialTargetInput = {
      id, mode: kind === "debt" ? "pay_down" : "accumulate", kind, status: target?.status ?? "active",
      title, description: description || undefined, targetAmount: Number(targetAmount), initialProgress: Number(initialProgress || 0),
      startsOn, targetDate: targetDate || undefined, priority: Number(priority), color, icon,
      coverPath: target?.coverPath, accountId: accountId || undefined, categoryId: categoryId || undefined,
      trackingMode: "movements",
      debt: kind === "debt" ? { creditor: creditor || undefined, annualInterestRate: interest ? Number(interest) : undefined, minimumPayment: minimumPayment ? Number(minimumPayment) : undefined, dueDay: dueDay ? Number(dueDay) : undefined } : undefined,
    };
    try {
      let result = await finance.mutate.upsertFinancialTarget(input);
      if (cover) {
        const coverPath = await finance.uploadFinancialTargetCover(id, cover);
        result = await finance.mutate.upsertFinancialTarget({ ...input, coverPath });
      }
      announceMutation(result, target ? "Meta actualizada" : "Meta creada");
      onOpenChange(false);
    } catch (caught) { const message = caught instanceof Error ? caught.message : "No pudimos guardar la meta."; setError(message); announceMutationError(caught, message); }
    finally { setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}><DialogContent showCloseButton={!saving} className="fullscreen-dialog-safe fullscreen-dialog-close-safe max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:max-w-2xl"><form onSubmit={submit}><DialogHeader><DialogTitle>{target ? "Editar recorrido" : "Nueva meta o deuda"}</DialogTitle><DialogDescription>Define el destino y cómo quieres medirlo. El progreso siempre conservará su origen.</DialogDescription></DialogHeader><div className="grid gap-5 py-5 sm:grid-cols-2">
    <div className="sm:col-span-2"><Label htmlFor="target-kind">Tipo</Label><SelectControl id="target-kind" containerClassName="mt-2" value={kind} onValueChange={(value) => { const next = value as FinancialTargetKind; setKind(next); if (!target) setIcon(next === "debt" ? "landmark" : next === "emergency" ? "shield" : next === "investment" ? "chart-no-axes-combined" : "target"); }}>{kindOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</SelectControl></div>
    <div className="sm:col-span-2"><Label htmlFor="target-title">Nombre</Label><Input id="target-title" className="mt-2 h-[52px] rounded-[14px]" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required autoFocus placeholder={kind === "debt" ? "Ej. Tarjeta de crédito" : "Ej. Fondo de emergencia"} /></div>
    <div><Label htmlFor="target-amount">{kind === "debt" ? "Deuda inicial" : "Monto objetivo"}</Label><InputControl id="target-amount" className="tabular-nums" containerClassName="mt-2" inputMode="decimal" value={targetAmount} onChange={(event) => setTargetAmount(cleanNumber(event.target.value))} leading={<CircleDollarSign />} required placeholder="0" /></div>
    <div><Label htmlFor="target-progress">{kind === "debt" ? "Ya pagado" : "Avance inicial"}</Label><InputControl id="target-progress" className="tabular-nums" containerClassName="mt-2" inputMode="decimal" value={initialProgress} onChange={(event) => setInitialProgress(cleanNumber(event.target.value))} leading={<TrendingUp />} placeholder="0" /></div>
    <div><Label htmlFor="target-start">Fecha de inicio</Label><DateControl id="target-start" containerClassName="mt-2" value={startsOn} onValueChange={setStartsOn} required /></div>
    <div><Label htmlFor="target-date">Fecha objetivo <span className="text-muted-foreground">(opcional)</span></Label><DateControl id="target-date" containerClassName="mt-2" value={targetDate} min={startsOn} onValueChange={setTargetDate} /></div>
    <div><Label htmlFor="target-priority">Prioridad</Label><SelectControl id="target-priority" containerClassName="mt-2" value={priority} onValueChange={setPriority}><option value="1">1 · Esencial</option><option value="2">2 · Alta</option><option value="3">3 · Normal</option><option value="4">4 · Flexible</option><option value="5">5 · Algún día</option></SelectControl></div>
    <div className="space-y-2" role="group" aria-label="Icono de la meta o deuda"><p className="text-sm font-medium">Icono</p><FinanceIconPicker value={icon} onValueChange={setIcon} /></div>
    <fieldset className="sm:col-span-2"><legend className="text-sm font-medium">Color</legend><div className="mt-2 flex flex-wrap gap-3">{targetColors.map((value) => <button key={value} type="button" onClick={() => setColor(value)} aria-label={`Usar color ${value}`} aria-pressed={color === value} className="size-11 rounded-full ring-1 ring-inset ring-foreground/25 transition-transform duration-150 active:scale-95 motion-reduce:transition-none" style={{ backgroundColor: value, outline: color === value ? "2px solid var(--foreground)" : undefined, outlineOffset: 3 }} />)}</div></fieldset>
    <div><Label htmlFor="target-account">Cuenta vinculada <span className="text-muted-foreground">(opcional)</span></Label><SelectControl id="target-account" containerClassName="mt-2" value={accountId} onValueChange={setAccountId}><option value="">Ninguna</option>{finance.accounts.filter((account) => !account.archived).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</SelectControl></div>
    <div><Label htmlFor="target-category">Subcategoría <span className="text-muted-foreground">(opcional)</span></Label><SelectControl id="target-category" containerClassName="mt-2" value={categoryId} onValueChange={setCategoryId}><option value="">Ninguna</option>{finance.categories.filter((category) => !category.archived).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</SelectControl></div>
    {kind === "debt" ? <><div><Label htmlFor="target-creditor">Acreedor <span className="text-muted-foreground">(opcional)</span></Label><Input id="target-creditor" className="mt-2 h-[52px] rounded-[14px]" value={creditor} onChange={(event) => setCreditor(event.target.value)} maxLength={120} /></div><div><Label htmlFor="target-interest">Interés anual <span className="text-muted-foreground">(%)</span></Label><InputControl id="target-interest" containerClassName="mt-2" inputMode="decimal" value={interest} onChange={(event) => setInterest(cleanNumber(event.target.value))} placeholder="0" /></div><div><Label htmlFor="target-minimum">Pago mínimo <span className="text-muted-foreground">(opcional)</span></Label><InputControl id="target-minimum" containerClassName="mt-2" inputMode="decimal" value={minimumPayment} onChange={(event) => setMinimumPayment(cleanNumber(event.target.value))} placeholder="0" /></div><div><Label htmlFor="target-due">Día de pago</Label><Input id="target-due" className="mt-2 h-[52px] rounded-[14px]" type="number" min={1} max={31} inputMode="numeric" value={dueDay} onChange={(event) => setDueDay(event.target.value)} placeholder="Ej. 15" /></div></> : null}
    <div className="sm:col-span-2"><Label htmlFor="target-description">Descripción <span className="text-muted-foreground">(opcional)</span></Label><Textarea id="target-description" className="mt-2 min-h-24 rounded-[14px]" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={600} placeholder="Qué quieres lograr y por qué importa" /></div>
    <div className="sm:col-span-2"><Label htmlFor="target-cover">Portada privada <span className="text-muted-foreground">(opcional)</span></Label><Input id="target-cover" className="mt-2 min-h-[52px] rounded-[14px] py-3 file:mr-3 file:rounded-full file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setCover(event.target.files?.[0] ?? null)} /><p className="mt-1.5 text-xs leading-5 text-muted-foreground">JPG, PNG o WebP, máximo 5 MB. Solo tú puedes abrirla.</p></div>
    {error ? <p className="sm:col-span-2 rounded-xl border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive" role="alert">{error}</p> : null}
  </div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button><Button type="submit" disabled={saving || !title.trim() || Number(targetAmount) <= 0}>{saving ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Check className="size-4" />}{saving ? "Guardando…" : target ? "Guardar cambios" : "Crear recorrido"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function TargetDetailDialog({ open, target, onOpenChange, onEdit }: { open: boolean; target?: FinancialTarget; onOpenChange: (open: boolean) => void; onEdit: () => void }) {
  const finance = useFinance();
  const money = currencyFormatter(finance.profile?.currencyCode);
  const today = localIsoDate(new Date(), finance.profile?.timezone);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [reverse, setReverse] = useState(false);
  const [saving, setSaving] = useState(false);
  if (!target) return null;
  const progress = financialTargetProgress(target, finance.financialTargetEntries, finance.transactions);
  const entries = finance.financialTargetEntries.filter((entry) => entry.targetId === target.id).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt));
  const movements = finance.transactions.filter((movement) => movement.financialTargetId === target.id).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
  const rules = finance.recurringRules.filter((rule) => rule.financialTargetId === target.id && rule.status !== "archived");
  const estimate = estimatedTargetCompletion(target, progress, finance.recurringRules);

  async function addEntry(event: React.FormEvent) {
    event.preventDefault(); setSaving(true);
    const input: FinancialTargetEntryInput = { targetId: target!.id, kind: target!.mode === "pay_down" ? reverse ? "interest" : "payment" : reverse ? "withdrawal" : "contribution", effect: reverse ? "reverse" : "advance", amount: Number(amount), occurredOn: date, note: note || undefined };
    try { const result = await finance.mutate.upsertFinancialTargetEntry(input); announceMutation(result, reverse ? "Ajuste registrado" : target!.mode === "pay_down" ? "Pago registrado" : "Aporte registrado"); setAmount(""); setNote(""); }
    catch (error) { announceMutationError(error, "No pudimos registrar el avance."); }
    finally { setSaving(false); }
  }

  async function changeStatus(status: FinancialTargetStatus) { try { const result = await finance.mutate.setFinancialTargetStatus(target!.id, status); announceMutation(result, status === "completed" ? "Recorrido completado" : status === "archived" ? "Recorrido archivado" : status === "paused" ? "Recorrido pausado" : "Recorrido reanudado"); if (status === "archived") onOpenChange(false); } catch (error) { announceMutationError(error, "No pudimos cambiar el estado."); } }
  function programContribution() {
    window.dispatchEvent(new CustomEvent("moneva:quick-add", { detail: { financialTargetId: target!.id, timing: "recurring", type: target!.mode === "accumulate" ? "transfer" : "expense", effect: "advance" } }));
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="fullscreen-dialog-close-safe gap-0 p-0 max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:max-w-3xl"><div className="safe-dialog-top p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-7"><DialogHeader><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ color: target.color, backgroundColor: `${target.color}18` }}><FinanceIcon name={target.icon} className="size-5" /></span><div className="min-w-0"><p className="text-xs text-muted-foreground">{targetKindLabel(target.kind)} · {targetStatusLabel(target.status)}</p><DialogTitle className="mt-1 line-clamp-2 break-words pr-8 text-xl">{target.title}</DialogTitle></div></div><DialogDescription className="pt-1">{target.description || (target.mode === "pay_down" ? "Reduce esta deuda con pagos registrados o movimientos enlazados." : "Acércate a este objetivo con aportes registrados o movimientos enlazados.")}</DialogDescription></DialogHeader>
    <section className="mt-7 border-y py-6"><p className="text-[11px] uppercase tracking-[.14em] text-muted-foreground">{target.mode === "pay_down" ? "Falta por pagar" : "Falta por reunir"}</p><p className="mt-1 break-words text-[clamp(1.9rem,8.5vw,4rem)] font-medium leading-none tracking-[-.05em] tabular-nums [overflow-wrap:anywhere]">{money.format(progress.remaining)}</p><Progress className="mt-6 h-2" indicatorClassName="bg-[var(--target-color)]" style={{ "--target-color": target.color } as React.CSSProperties} value={progress.rawProgress} max={target.targetAmount} label={`Avance de ${target.title}`} valueText={`${Math.round(progress.percent)}%, ${money.format(progress.remaining)} pendientes`} /><div className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground"><span>{money.format(progress.rawProgress)} registrados</span><span>{Math.round(progress.percent)}%</span></div><div className="mt-5 grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-4"><DetailMetric label="Objetivo" value={money.format(target.targetAmount)} /><DetailMetric label="Este mes" value={money.format(targetProgressDuringMonth(target.id, today.slice(0, 7), finance.financialTargetEntries, finance.transactions))} /><DetailMetric label="Fecha" value={target.targetDate ? dateLabel(target.targetDate) : "Flexible"} /><DetailMetric label="Estimado" value={estimate ? monthYear(estimate) : "Sin ritmo"} /></div></section>
    {target.status !== "completed" ? <form onSubmit={addEntry} className="border-b py-6"><div className="flex items-center justify-between gap-3"><div><h3 className="font-medium">Registrar {target.mode === "pay_down" ? "pago" : "aporte"}</h3><p className="mt-1 text-xs text-muted-foreground">No cambia el saldo de ninguna cuenta.</p></div><button type="button" aria-pressed={reverse} onClick={() => setReverse((value) => !value)} className={cn("min-h-11 rounded-full border px-3 text-xs font-medium", reverse && "border-warning/40 bg-warning/10 text-warning")}>{reverse ? "Resta avance" : "Suma avance"}</button></div><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><InputControl value={amount} onChange={(event) => setAmount(cleanNumber(event.target.value))} inputMode="decimal" leading={<CircleDollarSign />} placeholder="Monto" aria-label="Monto del avance" required /><DateControl id="target-entry-date" value={date} onValueChange={setDate} aria-label="Fecha del avance" required /><Button className="h-[52px]" disabled={saving || Number(amount) <= 0}>{saving ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Plus className="size-4" />}Registrar</Button></div><Input className="mt-3 h-11 rounded-xl" value={note} onChange={(event) => setNote(event.target.value)} maxLength={400} placeholder="Nota opcional" aria-label="Nota del avance" /></form> : null}
    <section className="py-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-medium">Actividad</h3><p className="mt-1 text-xs text-muted-foreground">Aportes manuales y movimientos, sin duplicados.</p></div><Button variant="outline" className="rounded-full" onClick={programContribution}><CalendarClock className="size-4" />Programar</Button></div><div className="mt-4 divide-y">{[...entries.map((entry) => ({ id: entry.id, date: entry.occurredOn, title: entry.note || (entry.effect === "advance" ? target.mode === "pay_down" ? "Pago manual" : "Aporte manual" : "Ajuste inverso"), amount: entry.amount, effect: entry.effect, source: "Manual" })), ...movements.map((movement) => ({ id: movement.id, date: movement.occurredOn, title: movement.merchant || movement.description, amount: movement.amount, effect: movement.financialTargetEffect!, source: "Movimiento" }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((item) => <div key={`${item.source}-${item.id}`} className="grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2"><span className={cn("grid size-8 place-items-center rounded-full", item.effect === "advance" ? "bg-positive/12 text-positive" : "bg-warning/12 text-warning")}>{item.source === "Manual" ? <Sparkles className="size-3.5" /> : <CircleDollarSign className="size-3.5" />}</span><span className="min-w-0"><span className="block truncate text-sm font-medium">{item.title}</span><span className="text-[11px] text-muted-foreground">{item.source} · {dateLabel(item.date)}</span></span><span className={cn("text-sm font-medium tabular-nums", item.effect === "advance" ? "text-positive" : "text-warning")}>{item.effect === "advance" ? "+" : "−"}{money.format(item.amount)}</span></div>)}{!entries.length && !movements.length ? <p className="py-8 text-center text-sm text-muted-foreground">Todavía no hay actividad registrada.</p> : null}</div>{rules.length ? <p className="mt-3 text-xs text-muted-foreground">{rules.length === 1 ? "1 programación enlazada" : `${rules.length} programaciones enlazadas`} a este recorrido.</p> : null}</section>
    <div className="flex flex-wrap gap-2 border-t pt-5"><Button onClick={onEdit}><Pencil className="size-4" />Editar</Button>{target.status === "active" ? <Button variant="outline" onClick={() => void changeStatus("paused")}><Pause className="size-4" />Pausar</Button> : target.status === "paused" ? <Button variant="outline" onClick={() => void changeStatus("active")}><RotateCcw className="size-4" />Reanudar</Button> : null}{target.status !== "completed" ? <Button variant="outline" onClick={() => void changeStatus("completed")}><Check className="size-4" />Marcar cumplida</Button> : null}<Button variant="ghost" className="text-muted-foreground sm:ml-auto" onClick={() => void changeStatus("archived")}><Archive className="size-4" />Archivar</Button></div>
  </div></DialogContent></Dialog>;
}

function DetailMetric({ label, value }: { label: string; value: string }) { return <div className="min-w-0 bg-popover px-3 py-4"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 break-words text-xs font-medium tabular-nums [overflow-wrap:anywhere] sm:text-sm">{value}</p></div>; }

const kindOptions = [
  { value: "savings", label: "Ahorro" }, { value: "emergency", label: "Fondo de emergencia" },
  { value: "investment", label: "Inversión" }, { value: "purchase", label: "Compra planeada" },
  { value: "debt", label: "Deuda" }, { value: "other", label: "Otra meta" },
] as const;

function cleanNumber(value: string) { return value.replace(/[^0-9.,]/g, "").replaceAll(".", "").replace(",", "."); }
function dateLabel(value: string) { return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)).replaceAll(" de ", " "); }
function monthYear(value: string) { return new Intl.DateTimeFormat("es-CO", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)).replaceAll(" de ", " "); }
