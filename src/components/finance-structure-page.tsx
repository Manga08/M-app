"use client";

import { AnimatePresence, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  CalendarRange,
  Check,
  ChevronDown,
  FolderCog,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Scale,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FinanceIconPicker } from "@/components/finance-icon-picker";
import { useFinance } from "@/components/finance-provider";
import { PageHeader } from "@/components/page-header";
import { PaginationControls } from "@/components/pagination-controls";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SelectControl } from "@/components/ui/form-control";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { currencyFormatter, distributePlanAllocationFromWeights, monthLabel, monthTotals, normalizePlanAllocationDraft, planAllocationNeedsAdjustment, setPlanAllocationIncluded, type PlanAllocationDraft } from "@/lib/finance/calculations";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import { announceMutation, announceMutationError } from "@/lib/finance/mutation-feedback";
import type { Category, FinanceGroupInput, GroupAllocation, GroupAllocationWrite } from "@/lib/finance/types";
import { motionDurations, motionEasings } from "@/lib/motion";
import { cn } from "@/lib/utils";

const palette = ["#55a8f8", "#fb7185", "#34d399", "#a78bfa", "#fb923c", "#facc15", "#22d3ee", "#f472b6"];

type Draft = PlanAllocationDraft;

export function buildArchiveGroupAllocations(
  draft: Draft,
  orderedGroups: Pick<GroupAllocation, "group" | "sortOrder">[],
  archivedGroupKey: string,
): GroupAllocationWrite[] {
  const remainingGroups = orderedGroups.filter((group) => group.group !== archivedGroupKey);
  const withoutArchivedGroup = setPlanAllocationIncluded(draft, archivedGroupKey, false);
  const normalized = normalizePlanAllocationDraft(withoutArchivedGroup, remainingGroups, "proportional");

  return orderedGroups.map((group, index) => {
    const allocation = group.group === archivedGroupKey
      ? { percent: 0, included: false }
      : normalized[group.group] ?? { percent: 0, included: false };
    return {
      group: group.group,
      targetPercent: allocation.included ? allocation.percent : 0,
      includedInPlan: allocation.included,
      sortOrder: index,
    };
  });
}

export function FinanceStructurePage({ embedded = false }: { embedded?: boolean }) {
  const finance = useFinance();
  const groups = useMemo(() => finance.groupAllocations.filter((group) => !group.archived).sort((a, b) => a.sortOrder - b.sortOrder), [finance.groupAllocations]);
  const key = groups.map((group) => group.id).join("|");

  return <StructureEditor key={key} groups={groups} finance={finance} embedded={embedded} />;
}

function StructureEditor({ groups, finance, embedded }: { groups: GroupAllocation[]; finance: ReturnType<typeof useFinance>; embedded: boolean }) {
  const reduceMotion = useReducedMotion() ?? false;
  const [draft, setDraft] = useState<Draft>(() => Object.fromEntries(groups.map((group) => [group.group, { percent: group.targetPercent, included: group.includedInPlan, sortOrder: group.sortOrder }])));
  const [expanded, setExpanded] = useState<string | null>(groups[0]?.group ?? null);
  const [groupDialog, setGroupDialog] = useState<GroupAllocation | "new" | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<{ groupKey: string; category?: Category } | null>(null);
  const [categoryPages, setCategoryPages] = useState<Record<string, number>>({});
  const [savingPlan, setSavingPlan] = useState(false);
  const [historyDialog, setHistoryDialog] = useState(false);
  const [historyMonth, setHistoryMonth] = useState(finance.currentMonth);
  const [applyingHistory, setApplyingHistory] = useState(false);
  const orderedGroups = [...groups].sort((a, b) => (draft[a.group]?.sortOrder ?? a.sortOrder) - (draft[b.group]?.sortOrder ?? b.sortOrder));
  const includedGroupCount = orderedGroups.filter((group) => draft[group.group]?.included).length;
  const total = orderedGroups.reduce((sum, group) => sum + (draft[group.group]?.included ? draft[group.group].percent : 0), 0);
  const planIsValid = includedGroupCount === 0 ? total === 0 : total === 100;
  const canAdjustPlan = includedGroupCount > 0 && planAllocationNeedsAdjustment(draft, groups, "equal");
  const changed = groups.some((group) => {
    const next = draft[group.group];
    return next && (next.percent !== group.targetPercent || next.included !== group.includedInPlan || next.sortOrder !== group.sortOrder);
  });
  const totals = monthTotals(finance.transactions, finance.currentMonth, finance.snapshot);
  const money = currencyFormatter(finance.profile?.currencyCode);
  const historyMonths = useMemo(() => recentMonthStarts(finance.currentMonth, 12), [finance.currentMonth]);

  useEffect(() => {
    if (!changed) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [changed]);

  function updateDraft(groupKey: string, patch: Partial<Draft[string]>) {
    setDraft((current) => ({ ...current, [groupKey]: { ...current[groupKey], ...patch } }));
  }

  function setIncluded(groupKey: string, included: boolean) {
    setDraft((current) => setPlanAllocationIncluded(current, groupKey, included));
  }

  function reorder(groupKey: string, direction: -1 | 1) {
    const index = orderedGroups.findIndex((group) => group.group === groupKey);
    const other = orderedGroups[index + direction];
    if (!other) return;
    setDraft((current) => ({
      ...current,
      [groupKey]: { ...current[groupKey], sortOrder: index + direction },
      [other.group]: { ...current[other.group], sortOrder: index },
    }));
  }

  function distributePlanEqually() {
    setDraft((current) => normalizePlanAllocationDraft(current, groups, "equal"));
  }

  async function distributePlanFromMonth() {
    setApplyingHistory(true);
    try {
      const report = await finance.getFinanceReport(historyMonth, 1);
      if (report.coverage !== "complete") {
        toast.info("Conéctate para usar un mes completo como referencia.");
        return;
      }
      const weights = Object.fromEntries(report.groups.map((group) => [group.group, group.expense]));
      const next = distributePlanAllocationFromWeights(draft, groups, weights);
      if (!next) {
        toast.info("Ese mes no tiene gastos en las categorías incluidas. Elige otro mes o reparte por igual.");
        return;
      }
      setDraft(next);
      setHistoryDialog(false);
      toast.success(`Distribución calculada con ${monthLabel(historyMonth)}`);
    } catch (error) {
      announceMutationError(error, "No pudimos calcular la distribución de ese mes.");
    } finally {
      setApplyingHistory(false);
    }
  }

  async function savePlan() {
    if (!planIsValid) {
      toast.error(total < 100 ? `Falta asignar ${100 - total}%.` : `Hay ${total - 100}% de más.`);
      return;
    }
    setSavingPlan(true);
    try {
      const result = await finance.mutate.updateGroupAllocations(orderedGroups.map((group, index) => ({
        group: group.group,
        targetPercent: draft[group.group].included ? draft[group.group].percent : 0,
        includedInPlan: draft[group.group].included,
        sortOrder: index,
      })));
      announceMutation(result, "Estructura y porcentajes guardados");
    } catch (error) {
      announceMutationError(error, "No pudimos guardar la distribución del plan.");
    } finally { setSavingPlan(false); }
  }

  async function archiveGroup(group: GroupAllocation, destination?: string, archiveCategories = false) {
    if (groups.length <= 1) {
      toast.error("Tu estructura debe conservar al menos una categoría principal.");
      return false;
    }
    const allocations = buildArchiveGroupAllocations(draft, orderedGroups, group.group);
    try {
      const result = await finance.mutate.archiveFinanceGroup({
        groupKey: group.group,
        allocations,
        destinationGroupKey: destination,
        archiveCategories,
      });
      announceMutation(result, destination ? `“${group.name}” se unió con la categoría elegida.` : `“${group.name}” se archivó sin borrar tu historial.`);
      return true;
    } catch (error) {
      announceMutationError(error, "No pudimos archivar la categoría principal.");
      return false;
    }
  }

  async function reorderCategory(groupKey: string, categoryId: string, direction: -1 | 1) {
    const ordered = finance.categories
      .filter((category) => category.kind === "expense" && !category.archived && category.group === groupKey)
      .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
    const index = ordered.findIndex((category) => category.id === categoryId);
    const target = ordered[index + direction];
    if (!target) return;
    const next = [...ordered];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    try {
      const result = await finance.mutate.updateCategoryOrder(groupKey, next.map((category, sortOrder) => ({ id: category.id, sortOrder })));
      announceMutation(result, "Orden de subcategorías actualizado");
    } catch (error) {
      announceMutationError(error, "No pudimos cambiar el orden de las subcategorías.");
    }
  }

  return <>
    {!embedded ? <PageHeader
      eyebrow="Tu modelo financiero"
      title="Plan"
      description="Diseña tus categorías principales, decide cuáles participan del reparto y organiza las subcategorías que usarás al registrar movimientos."
      action={<Button className="h-11 rounded-full px-5 max-sm:h-12" onClick={() => setGroupDialog("new")}><Plus className="size-4" />Nueva categoría principal</Button>}
    /> : <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-medium tracking-[-.035em]">Distribución</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Gestiona categorías principales y subcategorías, y define qué porcentaje del ingreso corresponde a cada una.</p></div><Button className="h-11 shrink-0 rounded-full px-5 max-sm:h-12 max-sm:w-full" onClick={() => setGroupDialog("new")}><Plus className="size-4" />Nueva categoría principal</Button></div>}

    <section className="pb-7 sm:border-b">
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <div className="flex items-center gap-3"><Scale className="size-5 text-primary" /><h2 className="text-xl font-medium tracking-tight">Tu distribución del 100%</h2></div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Activa las categorías principales que quieras medir. Puedes repartir el 100% por igual o usar el gasto real de un mes como referencia.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:flex">
          <Button variant="outline" size="sm" className="h-12 min-w-0 rounded-full px-3 text-xs sm:px-4 sm:text-sm md:h-11" onClick={distributePlanEqually} disabled={!canAdjustPlan}><WandSparkles className="size-4" />Repartir por igual</Button>
          <Button variant="outline" size="sm" className="h-12 min-w-0 rounded-full px-3 text-xs sm:px-4 sm:text-sm md:h-11" onClick={() => setHistoryDialog(true)} disabled={!includedGroupCount}><CalendarRange className="size-4" />Según un mes</Button>
        </div>
      </div>
      <Progress value={total} label="Porcentaje total asignado al plan" valueText={`${total}% asignado`} className="mt-6 h-2" indicatorClassName={!planIsValid && includedGroupCount > 0 ? "bg-destructive" : "bg-primary"} />
      <div className={cn("mt-3 flex items-center justify-between text-sm", planIsValid ? "text-primary" : "text-destructive")} aria-live="polite" aria-atomic="true"><span>{includedGroupCount === 0 ? "Ninguna categoría participa en el reparto" : total === 100 ? "La distribución está completa" : total < 100 ? `Falta ${100 - total}% por asignar` : `Sobran ${total - 100}%`}</span><strong className="text-lg tabular-nums">{total}%</strong></div>
    </section>

    <section className="pb-28">
      <div className="space-y-2 sm:divide-y sm:space-y-0">
        {orderedGroups.map((group, index) => {
          const itemDraft = draft[group.group];
          const categories = finance.categories.filter((category) => category.kind === "expense" && !category.archived && category.group === group.group).sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));
          const categoryPageCount = Math.max(1, Math.ceil(categories.length / 8));
          const categoryPage = Math.min(categoryPages[group.group] ?? 1, categoryPageCount);
          const visibleCategories = categories.slice((categoryPage - 1) * 8, categoryPage * 8);
          const open = expanded === group.group;
          return <m.article layout={reduceMotion ? false : "position"} transition={{ layout: { duration: motionDurations.spatial, ease: motionEasings.move } }} key={group.id} className="relative py-2">
            <div className="grid min-h-[92px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-4 pl-3 sm:grid-cols-[auto_minmax(180px,1fr)_minmax(230px,.8fr)_auto] sm:gap-5 sm:pl-5">
              <div className="hidden flex-col sm:flex"><Button variant="ghost" size="icon-sm" className="size-11" aria-label={`Subir ${group.name}`} disabled={index === 0} onClick={() => reorder(group.group, -1)}><ArrowUp className="size-4" /></Button><Button variant="ghost" size="icon-sm" className="size-11" aria-label={`Bajar ${group.name}`} disabled={index === orderedGroups.length - 1} onClick={() => reorder(group.group, 1)}><ArrowDown className="size-4" /></Button></div>
              <button type="button" className="flex min-h-11 min-w-0 items-center gap-3 text-left active:opacity-80" onClick={() => setExpanded(open ? null : group.group)} aria-expanded={open} aria-controls={`group-panel-${group.id}`}>
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ color: group.color, backgroundColor: `${group.color}18` }}><FinanceIcon name={group.icon} className="size-5" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{group.name}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{categories.length} {categories.length === 1 ? "subcategoría" : "subcategorías"}<span className="hidden min-[360px]:inline"> · {itemDraft.included ? `${itemDraft.percent}% del plan` : "fuera del plan"}</span></span></span>
                <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-duration-state)] ease-[var(--motion-ease-move)] motion-reduce:transition-none", open && "rotate-180")} />
              </button>
              <div className="col-span-2 row-start-2 flex items-center justify-between gap-3 sm:col-span-1 sm:row-auto sm:justify-end">
                <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground sm:text-xs"><Switch checked={itemDraft.included} onCheckedChange={(included) => setIncluded(group.group, included)} aria-label={`Incluir ${group.name} en la distribución del plan`} />Incluir</label>
                <span className="hidden text-right text-xs text-muted-foreground xl:block">{money.format((totals.income * itemDraft.percent) / 100)}<span className="block text-[11px]">objetivo</span></span><div data-plan-percent className={cn("flex h-[52px] w-[104px] items-center overflow-hidden rounded-[14px] border border-input bg-secondary/25 px-3 transition-[border-color,box-shadow,opacity] duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30 min-[360px]:w-28 sm:h-11", !itemDraft.included && "opacity-40")}><input aria-label={`Porcentaje para ${group.name}`} className="h-full min-w-0 flex-1 bg-transparent p-0 text-right text-lg font-medium tabular-nums outline-none disabled:cursor-not-allowed" type="text" inputMode="numeric" pattern="[0-9]*" disabled={!itemDraft.included} value={itemDraft.percent} onChange={(event) => updateDraft(group.group, { percent: Math.min(100, Math.max(0, Number(event.target.value.replace(/\D/g, "")) || 0)) })} /><span className="ml-2 text-sm text-muted-foreground">%</span></div>
              </div>
              <div className="col-start-2 row-start-1 flex items-center sm:col-auto sm:row-auto">
                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-11" aria-label={`Opciones de ${group.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-56"><DropdownMenuItem className="sm:hidden" disabled={index === 0} onClick={() => reorder(group.group, -1)}><ArrowUp />Subir categoría</DropdownMenuItem><DropdownMenuItem className="sm:hidden" disabled={index === orderedGroups.length - 1} onClick={() => reorder(group.group, 1)}><ArrowDown />Bajar categoría</DropdownMenuItem><DropdownMenuSeparator className="sm:hidden" /><DropdownMenuItem onClick={() => setGroupDialog(group)}><Pencil />Editar categoría principal</DropdownMenuItem><DropdownMenuItem onClick={() => setCategoryDialog({ groupKey: group.group })}><Plus />Nueva subcategoría</DropdownMenuItem><DropdownMenuSeparator /><ArchiveGroupItem group={group} groups={groups} categories={categories} onArchive={archiveGroup} /></DropdownMenuContent></DropdownMenu>
              </div>
            </div>

            <AnimatePresence initial={false}>{open ? <m.div id={`group-panel-${group.id}`} initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }} animate={reduceMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }} exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }} transition={{ duration: reduceMotion ? motionDurations.reduced : motionDurations.state, ease: motionEasings.out }} className="overflow-hidden">
              <div className="border-t pb-5 pl-3 sm:ml-[92px] sm:pl-0">
                <div className="flex items-center justify-between py-4"><div><p className="text-sm font-medium">Subcategorías</p><p className="mt-1 text-xs text-muted-foreground">Aparecen al registrar un gasto.</p></div><Button variant="ghost" size="sm" className="h-11 rounded-full px-3 text-primary" onClick={() => setCategoryDialog({ groupKey: group.group })}><Plus className="size-4" />Agregar</Button></div>
                {categories.length ? <div>{visibleCategories.map((category) => { const categoryIndex = categories.findIndex((item) => item.id === category.id); return <CategoryRow key={category.id} category={category} group={group} canMoveUp={categoryIndex > 0} canMoveDown={categoryIndex < categories.length - 1} onMove={(direction) => void reorderCategory(group.group, category.id, direction)} onEdit={() => setCategoryDialog({ groupKey: group.group, category })} onArchive={async () => { try { const result = await finance.mutate.archiveCategory(category.id); announceMutation(result, `“${category.name}” se archivó sin borrar su historial.`); } catch (error) { announceMutationError(error, "No pudimos archivar la subcategoría."); } }} />; })}<PaginationControls page={categoryPage} pageCount={categoryPageCount} onPageChange={(page) => setCategoryPages((current) => ({ ...current, [group.group]: page }))} total={categories.length} label="subcategorías" /></div> : <button type="button" onClick={() => setCategoryDialog({ groupKey: group.group })} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed py-8 text-sm text-muted-foreground transition-colors duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] hover:border-primary/40 hover:text-foreground"><Plus className="size-4" />Crear la primera subcategoría</button>}
              </div>
            </m.div> : null}</AnimatePresence>
          </m.article>;
        })}
      </div>
      {!groups.length ? <div className="grid min-h-72 place-items-center border-b text-center"><div><FolderCog className="mx-auto size-8 text-primary" /><h2 className="mt-4 text-xl font-medium">Crea tu primera categoría principal</h2><p className="mt-2 text-sm text-muted-foreground">Por ejemplo: Necesidades, Ahorro o Deudas.</p><Button className="mt-5 rounded-full" onClick={() => setGroupDialog("new")}><Plus className="size-4" />Nueva categoría</Button></div></div> : null}
    </section>

    <AnimatePresence>{changed ? <m.div initial={reduceMotion ? { opacity: 0 } : { transform: "translateY(18px)", opacity: 0 }} animate={reduceMotion ? { opacity: 1 } : { transform: "translateY(0px)", opacity: 1 }} exit={reduceMotion ? { opacity: 0 } : { transform: "translateY(12px)", opacity: 0 }} transition={{ duration: reduceMotion ? motionDurations.reduced : motionDurations.state, ease: motionEasings.out }} className="fixed inset-x-4 bottom-24 z-20 mx-auto flex max-w-xl items-center justify-between gap-4 rounded-2xl border bg-background/96 p-3 shadow-2xl lg:bottom-6 lg:left-[236px]" role="status" aria-live="polite">
      <div className="min-w-0 pl-2"><p className="text-sm font-medium">Cambios sin guardar</p><p className="truncate text-xs text-muted-foreground">Orden, inclusión y porcentajes se guardan juntos.</p></div><Button className="shrink-0 rounded-xl" disabled={!planIsValid || savingPlan} onClick={savePlan}>{savingPlan ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}{savingPlan ? "Guardando…" : "Guardar"}</Button>
    </m.div> : null}</AnimatePresence>

    <GroupDialog key={`group-${groupDialog === "new" ? "new" : groupDialog?.id ?? "closed"}`} open={groupDialog !== null} group={groupDialog === "new" ? undefined : groupDialog ?? undefined} nextOrder={groups.length} onOpenChange={(open) => !open && setGroupDialog(null)} onSave={async (group) => { const result = await finance.mutate.upsertFinanceGroup(group); setGroupDialog(null); announceMutation(result, groupDialog === "new" ? "Categoría principal creada" : "Categoría principal actualizada"); }} />
    <CategoryDialog key={`category-${categoryDialog?.category?.id ?? categoryDialog?.groupKey ?? "closed"}`} open={categoryDialog !== null} category={categoryDialog?.category} initialGroup={categoryDialog?.groupKey ?? groups[0]?.group} groups={groups} onOpenChange={(open) => !open && setCategoryDialog(null)} onSave={async (category) => { const result = await finance.mutate.upsertCategory(category); setCategoryDialog(null); announceMutation(result, categoryDialog?.category ? "Subcategoría actualizada" : "Subcategoría creada"); }} />
    <Dialog open={historyDialog} onOpenChange={(open) => !applyingHistory && setHistoryDialog(open)}>
      <DialogContent showCloseButton={!applyingHistory} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Usar el gasto de un mes</DialogTitle>
          <DialogDescription>Convertiremos lo gastado en cada categoría principal incluida en una distribución exacta del 100%. No cambia tus movimientos ni guarda el plan hasta que tú lo confirmes.</DialogDescription>
        </DialogHeader>
        <div className="py-3">
          <Label htmlFor="plan-reference-month">Mes de referencia</Label>
          <SelectControl id="plan-reference-month" value={historyMonth} onValueChange={setHistoryMonth} containerClassName="mt-2" disabled={applyingHistory}>
            {historyMonths.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
          </SelectControl>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Solo participan las categorías marcadas como “Incluir”. Una categoría sin gastos en ese mes recibirá 0%.</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setHistoryDialog(false)} disabled={applyingHistory}>Cancelar</Button>
          <Button type="button" onClick={distributePlanFromMonth} disabled={applyingHistory}>{applyingHistory ? <LoaderCircle className="size-4 animate-spin" /> : <CalendarRange className="size-4" />}{applyingHistory ? "Calculando…" : "Aplicar distribución"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function recentMonthStarts(endMonth: string, count: number) {
  const [year, month] = endMonth.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
  });
}

function CategoryRow({ category, group, canMoveUp, canMoveDown, onMove, onEdit, onArchive }: { category: Category; group: GroupAllocation; canMoveUp: boolean; canMoveDown: boolean; onMove: (direction: -1 | 1) => void; onEdit: () => void; onArchive: () => Promise<void> }) {
  return <div className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b py-2">
    <span className="grid size-10 place-items-center rounded-xl" style={{ color: group.color, backgroundColor: `${group.color}16` }}><FinanceIcon name={category.icon} className="size-[18px]" /></span><div className="min-w-0"><p className="truncate text-sm font-medium">{category.name}</p>{category.isDefault ? <p className="truncate text-[11px] text-muted-foreground">Subcategoría inicial · totalmente editable</p> : null}</div>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="size-11" aria-label={`Opciones de ${category.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-48"><DropdownMenuItem disabled={!canMoveUp} onClick={() => onMove(-1)}><ArrowUp />Subir</DropdownMenuItem><DropdownMenuItem disabled={!canMoveDown} onClick={() => onMove(1)}><ArrowDown />Bajar</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={onEdit}><Pencil />Editar o mover</DropdownMenuItem><DropdownMenuSeparator /><AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={(event) => event.preventDefault()} variant="destructive"><Archive />Archivar</DropdownMenuItem></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Archivar “{category.name}”?</AlertDialogTitle><AlertDialogDescription>Dejará de aparecer al registrar gastos, pero los movimientos y presupuestos anteriores conservarán su nombre.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void onArchive()}>Archivar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></DropdownMenuContent></DropdownMenu>
  </div>;
}

function ArchiveGroupItem({ group, groups, categories, onArchive }: { group: GroupAllocation; groups: GroupAllocation[]; categories: Category[]; onArchive: (group: GroupAllocation, destination?: string, archiveCategories?: boolean) => Promise<boolean> }) {
  const alternatives = groups.filter((item) => item.group !== group.group && !item.archived);
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState(alternatives[0]?.group ?? "archive");
  return <Dialog open={open} onOpenChange={setOpen}>
    <DropdownMenuItem variant="destructive" onSelect={(event) => { event.preventDefault(); setOpen(true); }}><Archive />Archivar o unir</DropdownMenuItem>
    <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Archivar “{group.name}”</DialogTitle><DialogDescription>La categoría principal saldrá de tu estructura activa. Sus cifras históricas no se borrarán y su porcentaje se repartirá entre las categorías restantes.</DialogDescription></DialogHeader>
      {categories.length ? <div className="space-y-2"><Label htmlFor={`archive-destination-${group.id}`}>¿Qué hacemos con sus {categories.length} subcategorías?</Label><SelectControl id={`archive-destination-${group.id}`} value={destination} onValueChange={setDestination}>{alternatives.map((item) => <option key={item.group} value={item.group}>Unir con {item.name}</option>)}<option value="archive">Archivar también las subcategorías</option></SelectControl><p className="text-xs leading-5 text-muted-foreground">Unir mueve las subcategorías; no mezcla ni altera movimientos existentes.</p></div> : <p className="rounded-xl bg-secondary/60 p-3 text-sm text-muted-foreground">Esta categoría no tiene subcategorías activas.</p>}
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="destructive" disabled={groups.length <= 1} onClick={async () => { if (await onArchive(group, destination === "archive" ? undefined : destination, destination === "archive")) setOpen(false); }}>Archivar categoría</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function GroupDialog({ open, group, nextOrder, onOpenChange, onSave }: { open: boolean; group?: GroupAllocation; nextOrder: number; onOpenChange: (open: boolean) => void; onSave: (group: FinanceGroupInput) => Promise<void> }) {
  const [name, setName] = useState(group?.name ?? "");
  const [color, setColor] = useState(group?.color ?? palette[nextOrder % palette.length]);
  const [icon, setIcon] = useState(group?.icon ?? "folder");
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const id = group?.id ?? crypto.randomUUID();
    setSaving(true);
    try { await onSave({ id, group: group?.group ?? `group_${id.replaceAll("-", "")}`, name: name.trim(), color, icon, sortOrder: group?.sortOrder ?? nextOrder }); }
    catch (error) { announceMutationError(error, "No pudimos guardar la categoría principal."); }
    finally { setSaving(false); }
  }
  return <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}><DialogContent showCloseButton={!saving} className="sm:max-w-lg"><form onSubmit={submit}><DialogHeader><DialogTitle>{group ? "Editar categoría principal" : "Crear categoría principal"}</DialogTitle><DialogDescription>El nombre, el color y el icono se aplicarán a todas las vistas. Después podrás decidir si participa del porcentaje.</DialogDescription></DialogHeader><div className="space-y-5 py-5"><div className="space-y-2"><Label htmlFor="group-name">Nombre</Label><Input id="group-name" className="h-[52px] rounded-[14px]" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="Ej. Educación" disabled={saving} /></div><fieldset className="space-y-2"><legend className="text-sm font-medium">Color</legend><div className="grid grid-cols-5 gap-2 sm:flex sm:flex-wrap">{palette.map((item) => <button type="button" key={item} onClick={() => setColor(item)} disabled={saving} className="size-11 rounded-full ring-1 ring-inset ring-foreground/25 transition-transform duration-[var(--motion-duration-press)] ease-[var(--motion-ease-out)] active:scale-[var(--motion-press-scale)] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-50" style={{ backgroundColor: item, outline: color === item ? "2px solid var(--foreground)" : undefined, outlineOffset: color === item ? 3 : undefined }} aria-label={`Usar color ${item}`} aria-pressed={color === item} />)}<label className={cn("relative size-11 overflow-hidden rounded-full border border-dashed", saving && "pointer-events-none opacity-50")}><input type="color" className="absolute -inset-2 size-16 cursor-pointer" value={color} onChange={(event) => setColor(event.target.value)} disabled={saving} /><span className="sr-only">Color personalizado</span></label></div></fieldset><div className="space-y-2" role="group" aria-label="Icono de la categoría principal"><p className="text-sm font-medium">Icono</p><FinanceIconPicker value={icon} onValueChange={setIcon} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button><Button type="submit" disabled={!name.trim() || saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : null}{saving ? "Guardando…" : group ? "Guardar cambios" : "Crear categoría"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function CategoryDialog({ open, category, initialGroup, groups, onOpenChange, onSave }: { open: boolean; category?: Category; initialGroup?: string; groups: GroupAllocation[]; onOpenChange: (open: boolean) => void; onSave: (category: { id: string; name: string; group: string; color: string; icon: string }) => Promise<void> }) {
  const [name, setName] = useState(category?.name ?? "");
  const [groupKey, setGroupKey] = useState(category?.group ?? initialGroup ?? groups[0]?.group ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "tag");
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const group = groups.find((item) => item.group === groupKey);
    if (!name.trim() || !group) return;
    setSaving(true);
    try { await onSave({ id: category?.id ?? crypto.randomUUID(), name: name.trim(), group: group.group, color: group.color, icon }); }
    catch (error) { announceMutationError(error, "No pudimos guardar la subcategoría."); }
    finally { setSaving(false); }
  }
  return <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}><DialogContent showCloseButton={!saving} className="sm:max-w-md"><form onSubmit={submit}><DialogHeader><DialogTitle>{category ? "Editar subcategoría" : "Nueva subcategoría"}</DialogTitle><DialogDescription>Úsala para clasificar gastos con precisión. Puedes moverla y personalizar su icono cuando quieras.</DialogDescription></DialogHeader><div className="space-y-4 py-5"><div className="space-y-2"><Label htmlFor="category-name">Nombre</Label><Input id="category-name" className="h-[52px] rounded-[14px]" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="Ej. Cursos y libros" disabled={saving} /></div><div className="space-y-2"><Label htmlFor="category-group">Categoría principal</Label><SelectControl id="category-group" value={groupKey} onValueChange={setGroupKey} disabled={saving}>{groups.map((group) => <option key={group.group} value={group.group}>{group.name}</option>)}</SelectControl></div><div className="space-y-2" role="group" aria-label="Icono de la subcategoría"><p className="text-sm font-medium">Icono</p><FinanceIconPicker value={icon} onValueChange={setIcon} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button><Button type="submit" disabled={!name.trim() || !groupKey || saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : null}{saving ? "Guardando…" : category ? "Guardar cambios" : "Crear subcategoría"}</Button></DialogFooter></form></DialogContent></Dialog>;
}
