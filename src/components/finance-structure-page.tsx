"use client";

import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  FolderCog,
  MoreHorizontal,
  Pencil,
  Plus,
  Scale,
  WandSparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { currencyFormatter, monthTotals } from "@/lib/finance/calculations";
import { FinanceIcon } from "@/lib/finance/icon-catalog";
import type { Category, FinanceGroupInput, GroupAllocation } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const palette = ["#55a8f8", "#fb7185", "#34d399", "#a78bfa", "#fb923c", "#facc15", "#22d3ee", "#f472b6"];

type Draft = Record<string, { percent: number; included: boolean; sortOrder: number }>;

export function FinanceStructurePage({ embedded = false }: { embedded?: boolean }) {
  const finance = useFinance();
  const groups = useMemo(() => finance.groupAllocations.filter((group) => !group.archived).sort((a, b) => a.sortOrder - b.sortOrder), [finance.groupAllocations]);
  const key = groups.map((group) => `${group.id}:${group.name}:${group.targetPercent}:${group.includedInPlan}:${group.sortOrder}`).join("|");

  return <StructureEditor key={key} groups={groups} finance={finance} embedded={embedded} />;
}

function StructureEditor({ groups, finance, embedded }: { groups: GroupAllocation[]; finance: ReturnType<typeof useFinance>; embedded: boolean }) {
  const [draft, setDraft] = useState<Draft>(() => Object.fromEntries(groups.map((group) => [group.group, { percent: group.targetPercent, included: group.includedInPlan, sortOrder: group.sortOrder }])));
  const [expanded, setExpanded] = useState<string | null>(groups[0]?.group ?? null);
  const [groupDialog, setGroupDialog] = useState<GroupAllocation | "new" | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<{ groupKey: string; category?: Category } | null>(null);
  const [categoryPages, setCategoryPages] = useState<Record<string, number>>({});
  const orderedGroups = [...groups].sort((a, b) => (draft[a.group]?.sortOrder ?? a.sortOrder) - (draft[b.group]?.sortOrder ?? b.sortOrder));
  const total = orderedGroups.reduce((sum, group) => sum + (draft[group.group]?.included ? draft[group.group].percent : 0), 0);
  const changed = groups.some((group) => {
    const next = draft[group.group];
    return next && (next.percent !== group.targetPercent || next.included !== group.includedInPlan || next.sortOrder !== group.sortOrder);
  });
  const totals = monthTotals(finance.transactions, finance.currentMonth, finance.snapshot);
  const money = currencyFormatter(finance.profile?.currencyCode);

  function updateDraft(groupKey: string, patch: Partial<Draft[string]>) {
    setDraft((current) => ({ ...current, [groupKey]: { ...current[groupKey], ...patch } }));
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

  function normalize(mode: "equal" | "proportional" = "proportional") {
    const included = orderedGroups.filter((group) => draft[group.group]?.included);
    if (!included.length) return;
    const currentTotal = included.reduce((sum, group) => sum + draft[group.group].percent, 0);
    let assigned = 0;
    setDraft((current) => {
      const next = { ...current };
      included.forEach((group, index) => {
        const last = index === included.length - 1;
        const raw = mode === "equal" || currentTotal === 0 ? 100 / included.length : (current[group.group].percent / currentTotal) * 100;
        const percent = last ? 100 - assigned : Math.max(0, Math.round(raw));
        assigned += percent;
        next[group.group] = { ...next[group.group], percent };
      });
      return next;
    });
  }

  async function savePlan() {
    if (total !== 100) {
      toast.error(total < 100 ? `Falta asignar ${100 - total}%.` : `Hay ${total - 100}% de más.`);
      return;
    }
    await finance.updateGroupAllocations(orderedGroups.map((group, index) => ({
      group: group.group,
      targetPercent: draft[group.group].included ? draft[group.group].percent : 0,
      includedInPlan: draft[group.group].included,
      sortOrder: index,
    })));
    toast.success("Estructura y porcentajes guardados");
  }

  async function archiveGroup(group: GroupAllocation, destination?: string, archiveCategories = false) {
    if (groups.length <= 1) {
      toast.error("Tu estructura debe conservar al menos un grupo principal.");
      return;
    }
    const remaining = orderedGroups.filter((item) => item.group !== group.group);
    const included = remaining.filter((item) => draft[item.group]?.included);
    const planIncluded = included.length ? included : remaining.slice(0, 1);
    const currentTotal = planIncluded.reduce((sum, item) => sum + draft[item.group].percent, 0);
    let assigned = 0;
    const allocation = orderedGroups.map((item, index) => {
      if (item.group === group.group) return { group: item.group, targetPercent: 0, includedInPlan: false, sortOrder: index };
      const activeIndex = planIncluded.findIndex((candidate) => candidate.group === item.group);
      if (activeIndex < 0) return { group: item.group, targetPercent: 0, includedInPlan: false, sortOrder: index };
      const last = activeIndex === planIncluded.length - 1;
      const raw = currentTotal ? (draft[item.group].percent / currentTotal) * 100 : 100 / planIncluded.length;
      const percent = last ? 100 - assigned : Math.round(raw);
      assigned += percent;
      return { group: item.group, targetPercent: percent, includedInPlan: true, sortOrder: index };
    });
    await finance.updateGroupAllocations(allocation);
    await finance.archiveFinanceGroup(group.group, destination, archiveCategories);
    toast.success(destination ? `“${group.name}” se unió con el grupo elegido.` : `“${group.name}” se archivó sin borrar tu historial.`);
  }

  return <>
    {!embedded ? <PageHeader
      eyebrow="Tu modelo financiero"
      title="Plan"
      description="Diseña tus grupos principales, decide cuáles participan del 100% y organiza las subcategorías que usarás al registrar movimientos."
      action={<Button className="h-11 rounded-full px-5" onClick={() => setGroupDialog("new")}><Plus className="size-4" />Nuevo grupo</Button>}
    /> : <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-medium tracking-[-.035em]">Estructura del plan</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Define los grupos, el reparto obligatorio del 100% y las subcategorías de cada uno.</p></div><Button className="h-10 rounded-full px-4" onClick={() => setGroupDialog("new")}><Plus className="size-4" />Nuevo grupo</Button></div>}

    <section className="border-b pb-7">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <div className="flex items-center gap-3"><Scale className="size-5 text-primary" /><h2 className="text-xl font-medium tracking-tight">Tu distribución del 100%</h2></div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Activa solo los grupos que quieras medir como parte del plan. Un grupo puede seguir existiendo con sus subcategorías aunque quede fuera del porcentaje.</p>
        </div>
        <div className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" className="rounded-full" onClick={() => normalize("equal")}><WandSparkles className="size-4" />Repartir igual</Button><Button variant="outline" size="sm" className="rounded-full" onClick={() => normalize()} disabled={total === 100}>Ajustar a 100%</Button></div>
      </div>
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-muted" aria-label={`${total}% asignado`}>{orderedGroups.filter((group) => draft[group.group]?.included).map((group) => <m.span layout key={group.group} className="inline-block h-full" style={{ width: `${draft[group.group].percent}%`, backgroundColor: group.color }} />)}</div>
      <div className={cn("mt-3 flex items-center justify-between text-sm", total === 100 ? "text-primary" : "text-destructive")}><span>{total === 100 ? "La distribución está completa" : total < 100 ? `Falta ${100 - total}% por asignar` : `Sobran ${total - 100}%`}</span><strong className="text-lg tabular-nums">{total}%</strong></div>
    </section>

    <section className="pb-28">
      <div className="divide-y">
        {orderedGroups.map((group, index) => {
          const itemDraft = draft[group.group];
          const categories = finance.categories.filter((category) => category.kind === "expense" && !category.archived && category.group === group.group);
          const categoryPageCount = Math.max(1, Math.ceil(categories.length / 8));
          const categoryPage = Math.min(categoryPages[group.group] ?? 1, categoryPageCount);
          const visibleCategories = categories.slice((categoryPage - 1) * 8, categoryPage * 8);
          const open = expanded === group.group;
          return <m.article layout="position" key={group.id} className="relative py-2" style={{ borderLeft: `3px solid ${group.color}` }}>
            <div className="grid min-h-[92px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-4 pl-3 sm:grid-cols-[auto_minmax(180px,1fr)_minmax(230px,.8fr)_auto] sm:gap-5 sm:pl-5">
              <div className="hidden flex-col gap-1 sm:flex"><Button variant="ghost" size="icon-sm" aria-label={`Subir ${group.name}`} disabled={index === 0} onClick={() => reorder(group.group, -1)}><ArrowUp className="size-3.5" /></Button><Button variant="ghost" size="icon-sm" aria-label={`Bajar ${group.name}`} disabled={index === orderedGroups.length - 1} onClick={() => reorder(group.group, 1)}><ArrowDown className="size-3.5" /></Button></div>
              <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => setExpanded(open ? null : group.group)} aria-expanded={open}>
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ color: group.color, backgroundColor: `${group.color}18` }}><FinanceIcon name={group.icon} className="size-5" /></span>
                <span className="min-w-0"><span className="block truncate font-medium">{group.name}</span><span className="mt-1 block text-xs text-muted-foreground">{categories.length} {categories.length === 1 ? "subcategoría" : "subcategorías"} · {itemDraft.included ? "dentro del plan" : "fuera del plan"}</span></span>
              </button>
              <div className="col-span-2 row-start-2 flex items-center justify-between gap-3 sm:col-span-1 sm:row-auto sm:justify-end">
                <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={itemDraft.included} onCheckedChange={(included) => updateDraft(group.group, { included, percent: included ? itemDraft.percent : 0 })} />Incluir</label>
                <span className="hidden text-right text-xs text-muted-foreground xl:block">{money.format((totals.income * itemDraft.percent) / 100)}<span className="block text-[10px]">objetivo</span></span><div className={cn("flex h-11 w-28 items-center rounded-xl border px-2 transition-opacity", !itemDraft.included && "opacity-40")}><Input aria-label={`Porcentaje para ${group.name}`} className="h-9 border-0 bg-transparent p-1 text-right text-lg shadow-none focus-visible:ring-0" type="number" min={0} max={100} step={1} disabled={!itemDraft.included} value={itemDraft.percent} onChange={(event) => updateDraft(group.group, { percent: Math.min(100, Math.max(0, Number(event.target.value))) })} /><span className="text-sm text-muted-foreground">%</span></div>
              </div>
              <div className="col-start-2 row-start-1 flex items-center sm:col-auto sm:row-auto">
                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Opciones de ${group.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setGroupDialog(group)}><Pencil />Editar grupo</DropdownMenuItem><DropdownMenuItem onClick={() => setCategoryDialog({ groupKey: group.group })}><Plus />Nueva subcategoría</DropdownMenuItem><DropdownMenuSeparator /><ArchiveGroupItem group={group} groups={groups} categories={categories} onArchive={archiveGroup} /></DropdownMenuContent></DropdownMenu>
                <Button variant="ghost" size="icon-sm" onClick={() => setExpanded(open ? null : group.group)} aria-label={open ? "Contraer" : "Ver subcategorías"}><ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} /></Button>
              </div>
            </div>

            <AnimatePresence initial={false}>{open ? <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }} className="overflow-hidden">
              <div className="ml-3 border-t pb-5 sm:ml-[92px]">
                <div className="flex items-center justify-between py-4"><div><p className="text-sm font-medium">Subcategorías</p><p className="mt-1 text-xs text-muted-foreground">Aparecen al registrar un gasto.</p></div><Button variant="ghost" size="sm" className="rounded-full text-primary" onClick={() => setCategoryDialog({ groupKey: group.group })}><Plus className="size-4" />Agregar</Button></div>
                {categories.length ? <div>{visibleCategories.map((category) => <CategoryRow key={category.id} category={category} group={group} onEdit={() => setCategoryDialog({ groupKey: group.group, category })} onArchive={() => finance.archiveCategory(category.id)} />)}<PaginationControls page={categoryPage} pageCount={categoryPageCount} onPageChange={(page) => setCategoryPages((current) => ({ ...current, [group.group]: page }))} total={categories.length} label="subcategorías" /></div> : <button type="button" onClick={() => setCategoryDialog({ groupKey: group.group })} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed py-8 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"><Plus className="size-4" />Crear la primera subcategoría</button>}
              </div>
            </m.div> : null}</AnimatePresence>
          </m.article>;
        })}
      </div>
      {!groups.length ? <div className="grid min-h-72 place-items-center border-b text-center"><div><FolderCog className="mx-auto size-8 text-primary" /><h2 className="mt-4 text-xl font-medium">Crea tu primer grupo</h2><p className="mt-2 text-sm text-muted-foreground">Por ejemplo: Necesidades, Ahorro o Deudas.</p><Button className="mt-5 rounded-full" onClick={() => setGroupDialog("new")}><Plus className="size-4" />Nuevo grupo</Button></div></div> : null}
    </section>

    <AnimatePresence>{changed ? <m.div initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }} className="fixed inset-x-4 bottom-24 z-20 mx-auto flex max-w-xl items-center justify-between gap-4 rounded-2xl border bg-background/96 p-3 shadow-2xl lg:bottom-6 lg:left-[236px]">
      <div className="min-w-0 pl-2"><p className="text-sm font-medium">Cambios sin guardar</p><p className="truncate text-xs text-muted-foreground">Orden, inclusión y porcentajes se guardan juntos.</p></div><Button className="shrink-0 rounded-xl" disabled={total !== 100} onClick={savePlan}><Check className="size-4" />Guardar</Button>
    </m.div> : null}</AnimatePresence>

    <GroupDialog key={`group-${groupDialog === "new" ? "new" : groupDialog?.id ?? "closed"}`} open={groupDialog !== null} group={groupDialog === "new" ? undefined : groupDialog ?? undefined} nextOrder={groups.length} onOpenChange={(open) => !open && setGroupDialog(null)} onSave={async (group) => { await finance.upsertFinanceGroup(group); setGroupDialog(null); toast.success(groupDialog === "new" ? "Grupo principal creado" : "Grupo actualizado"); }} />
    <CategoryDialog key={`category-${categoryDialog?.category?.id ?? categoryDialog?.groupKey ?? "closed"}`} open={categoryDialog !== null} category={categoryDialog?.category} initialGroup={categoryDialog?.groupKey ?? groups[0]?.group} groups={groups} onOpenChange={(open) => !open && setCategoryDialog(null)} onSave={async (category) => { await finance.upsertCategory(category); setCategoryDialog(null); toast.success(categoryDialog?.category ? "Subcategoría actualizada" : "Subcategoría creada"); }} />
  </>;
}

function CategoryRow({ category, group, onEdit, onArchive }: { category: Category; group: GroupAllocation; onEdit: () => void; onArchive: () => Promise<void> }) {
  return <div className="grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b py-2">
    <span className="grid size-8 place-items-center rounded-xl" style={{ color: group.color, backgroundColor: `${group.color}16` }}><FinanceIcon name={category.icon} className="size-4" /></span><div className="min-w-0"><p className="truncate text-sm font-medium">{category.name}</p>{category.isDefault ? <p className="text-[11px] text-muted-foreground">Subcategoría inicial · totalmente editable</p> : null}</div>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Opciones de ${category.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={onEdit}><Pencil />Editar o mover</DropdownMenuItem><DropdownMenuSeparator /><AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={(event) => event.preventDefault()} variant="destructive"><Archive />Archivar</DropdownMenuItem></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Archivar “{category.name}”?</AlertDialogTitle><AlertDialogDescription>Dejará de aparecer al registrar gastos, pero los movimientos y presupuestos anteriores conservarán su nombre.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void onArchive()}>Archivar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></DropdownMenuContent></DropdownMenu>
  </div>;
}

function ArchiveGroupItem({ group, groups, categories, onArchive }: { group: GroupAllocation; groups: GroupAllocation[]; categories: Category[]; onArchive: (group: GroupAllocation, destination?: string, archiveCategories?: boolean) => Promise<void> }) {
  const alternatives = groups.filter((item) => item.group !== group.group && !item.archived);
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState(alternatives[0]?.group ?? "archive");
  return <Dialog open={open} onOpenChange={setOpen}>
    <DropdownMenuItem variant="destructive" onSelect={(event) => { event.preventDefault(); setOpen(true); }}><Archive />Archivar o unir</DropdownMenuItem>
    <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Archivar “{group.name}”</DialogTitle><DialogDescription>El grupo saldrá de tu estructura activa. Sus cifras históricas no se borrarán y su porcentaje se repartirá entre los grupos restantes.</DialogDescription></DialogHeader>
      {categories.length ? <div className="space-y-2"><Label>¿Qué hacemos con sus {categories.length} subcategorías?</Label><Select value={destination} onValueChange={setDestination}><SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent>{alternatives.map((item) => <SelectItem key={item.group} value={item.group}>Unir con {item.name}</SelectItem>)}<SelectItem value="archive">Archivar también las subcategorías</SelectItem></SelectContent></Select><p className="text-xs leading-5 text-muted-foreground">Unir mueve las subcategorías; no mezcla ni altera movimientos existentes.</p></div> : <p className="rounded-xl bg-secondary/60 p-3 text-sm text-muted-foreground">Este grupo no tiene subcategorías activas.</p>}
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="destructive" disabled={groups.length <= 1} onClick={async () => { await onArchive(group, destination === "archive" ? undefined : destination, destination === "archive"); setOpen(false); }}>Archivar grupo</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function GroupDialog({ open, group, nextOrder, onOpenChange, onSave }: { open: boolean; group?: GroupAllocation; nextOrder: number; onOpenChange: (open: boolean) => void; onSave: (group: FinanceGroupInput) => Promise<void> }) {
  const [name, setName] = useState(group?.name ?? "");
  const [color, setColor] = useState(group?.color ?? palette[nextOrder % palette.length]);
  const [icon, setIcon] = useState(group?.icon ?? "folder");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const id = group?.id ?? crypto.randomUUID();
    await onSave({ id, group: group?.group ?? `group_${id.replaceAll("-", "")}`, name: name.trim(), color, icon, sortOrder: group?.sortOrder ?? nextOrder });
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><form onSubmit={submit}><DialogHeader><DialogTitle>{group ? "Editar grupo principal" : "Crear grupo principal"}</DialogTitle><DialogDescription>El nombre, el color y el icono se aplicarán a todas las vistas. Después podrás decidir si participa del porcentaje.</DialogDescription></DialogHeader><div className="space-y-5 py-5"><div className="space-y-2"><Label htmlFor="group-name">Nombre</Label><Input id="group-name" autoFocus value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="Ej. Educación" /></div><div className="space-y-2"><Label>Color</Label><div className="flex flex-wrap gap-2">{palette.map((item) => <button type="button" key={item} onClick={() => setColor(item)} className={cn("size-9 rounded-full transition-transform hover:scale-105", color === item && "ring-2 ring-offset-2 ring-offset-background")} style={{ backgroundColor: item, boxShadow: color === item ? `0 0 0 2px ${item}` : undefined }} aria-label={`Usar color ${item}`} />)}<label className="relative size-9 overflow-hidden rounded-full border border-dashed"><input type="color" className="absolute -inset-2 size-14 cursor-pointer" value={color} onChange={(event) => setColor(event.target.value)} /><span className="sr-only">Color personalizado</span></label></div></div><div className="space-y-2"><Label>Icono</Label><FinanceIconPicker value={icon} onValueChange={setIcon} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" disabled={!name.trim()}>{group ? "Guardar cambios" : "Crear grupo"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function CategoryDialog({ open, category, initialGroup, groups, onOpenChange, onSave }: { open: boolean; category?: Category; initialGroup?: string; groups: GroupAllocation[]; onOpenChange: (open: boolean) => void; onSave: (category: { id: string; name: string; group: string; color: string; icon: string }) => Promise<void> }) {
  const [name, setName] = useState(category?.name ?? "");
  const [groupKey, setGroupKey] = useState(category?.group ?? initialGroup ?? groups[0]?.group ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "tag");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const group = groups.find((item) => item.group === groupKey);
    if (!name.trim() || !group) return;
    await onSave({ id: category?.id ?? crypto.randomUUID(), name: name.trim(), group: group.group, color: group.color, icon });
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-md"><form onSubmit={submit}><DialogHeader><DialogTitle>{category ? "Editar subcategoría" : "Nueva subcategoría"}</DialogTitle><DialogDescription>Úsala para clasificar gastos con precisión. Puedes moverla y personalizar su icono cuando quieras.</DialogDescription></DialogHeader><div className="space-y-4 py-5"><div className="space-y-2"><Label htmlFor="category-name">Nombre</Label><Input id="category-name" autoFocus value={name} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="Ej. Cursos y libros" /></div><div className="space-y-2"><Label>Grupo principal</Label><Select value={groupKey} onValueChange={setGroupKey}><SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent>{groups.map((group) => <SelectItem key={group.group} value={group.group}>{group.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Icono</Label><FinanceIconPicker value={icon} onValueChange={setIcon} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" disabled={!name.trim() || !groupKey}>{category ? "Guardar cambios" : "Crear subcategoría"}</Button></DialogFooter></form></DialogContent></Dialog>;
}
