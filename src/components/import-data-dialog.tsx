"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileSpreadsheet, LoaderCircle, LockKeyhole, Upload } from "lucide-react";
import { useFinance } from "@/components/finance-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SelectControl } from "@/components/ui/form-control";
import { Label } from "@/components/ui/label";
import { currencyFormatter } from "@/lib/finance/calculations";
import { suggestFinanceIcon } from "@/lib/finance/icon-catalog";
import { announceMutation, announceMutationError } from "@/lib/finance/mutation-feedback";
import { findExistingImportDuplicates, normalizeImportText, parsePlannerWorkbook, suggestCategoryId, type PlannerImport, type WorkbookSheet } from "@/lib/finance/xlsx-import";
import type { TransactionInput } from "@/lib/finance/types";

type ImportDataDialogProps = { open: boolean; onOpenChange: (open: boolean) => void };
type Stage = "select" | "parsing" | "review" | "importing" | "done";

export function ImportDataDialog({ open, onOpenChange }: ImportDataDialogProps) {
  const finance = useFinance();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("select");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<PlannerImport | null>(null);
  const [duplicates, setDuplicates] = useState<boolean[]>([]);
  const [accountId, setAccountId] = useState("");
  const [incomeTypeId, setIncomeTypeId] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);

  const accounts = finance.accounts.filter((account) => !account.archived);
  const expenseCategories = finance.categories.filter((category) => category.kind === "expense" && !category.archived);
  const incomeTypes = finance.categories.filter((category) => category.kind === "income" && !category.archived);
  const money = currencyFormatter(finance.profile?.currencyCode);
  const newMovements = useMemo(() => parsed?.movements.filter((_, index) => !duplicates[index]) ?? [], [duplicates, parsed]);
  const categoriesToMap = useMemo(() => [...new Set(newMovements.filter((movement) => !movement.adjustment).map((movement) => movement.sourceCategory))].sort((a, b) => a.localeCompare(b, "es")), [newMovements]);
  const adjustmentCount = newMovements.filter((movement) => movement.adjustment).length;
  const duplicateCount = duplicates.filter(Boolean).length;
  const total = newMovements.reduce((sum, movement) => sum + movement.amount, 0);
  const unmapped = categoriesToMap.filter((category) => !mapping[category]);
  const isDemo = finance.profile?.id === "demo";
  const canImport = Boolean(newMovements.length && accountId && !unmapped.length && (!adjustmentCount || incomeTypeId) && (finance.online || isDemo));

  function reset() {
    setStage("select");
    setFileName("");
    setParsed(null);
    setDuplicates([]);
    setAccountId(accounts[0]?.id ?? "");
    setIncomeTypeId(incomeTypes.find((item) => normalizeImportText(item.name) === "otros ingresos")?.id ?? incomeTypes[0]?.id ?? "");
    setMapping({});
    setError(null);
    setImportedCount(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  function changeOpen(next: boolean) {
    if (stage === "parsing" || stage === "importing") return;
    onOpenChange(next);
    if (!next) window.setTimeout(reset, 180);
  }

  async function chooseFile(file?: File) {
    if (!file) return;
    setError(null);
    if (!file.name.toLocaleLowerCase("es").endsWith(".xlsx")) {
      setError("Selecciona un archivo de Excel con extensión .xlsx.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("El archivo supera el límite seguro de 20 MB.");
      return;
    }
    setStage("parsing");
    setFileName(file.name);
    try {
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      const sheets = await readXlsxFile(file) as unknown as WorkbookSheet[];
      const result = parsePlannerWorkbook(sheets);
      const history = isDemo ? finance.transactions : await finance.exportTransactions();
      const existingDuplicates = findExistingImportDuplicates(result.movements, history);
      const initialMapping = Object.fromEntries(result.sourceCategories.map((source) => [source, suggestCategoryId(source, expenseCategories)]));
      setParsed(result);
      setDuplicates(existingDuplicates);
      setMapping(initialMapping);
      setAccountId((current) => current && accounts.some((account) => account.id === current) ? current : accounts[0]?.id ?? "");
      setIncomeTypeId((current) => current && incomeTypes.some((item) => item.id === current) ? current : incomeTypes.find((item) => normalizeImportText(item.name) === "otros ingresos")?.id ?? incomeTypes[0]?.id ?? "");
      setStage("review");
    } catch (cause) {
      setStage("select");
      setError(cause instanceof Error ? cause.message : "No pudimos leer esta plantilla.");
    }
  }

  async function importData() {
    if (!parsed || !canImport || stage === "importing") return;
    setError(null);
    setStage("importing");
    try {
      const inputs: TransactionInput[] = newMovements.map((movement) => {
        const categoryId = movement.adjustment ? incomeTypeId : mapping[movement.sourceCategory];
        const source = `Plantilla ${parsed.version} · ${movement.sourceCategory}`;
        return {
          type: movement.adjustment ? "income" : "expense",
          amount: movement.amount,
          accountId,
          categoryId,
          description: movement.description,
          merchant: movement.merchant,
          note: movement.adjustment ? `${source} · ajuste negativo convertido en reintegro.` : `Importado de ${source}.`,
          icon: suggestFinanceIcon(`${movement.merchant ?? ""} ${movement.description}`),
          occurredOn: movement.occurredOn,
        };
      });
      const result = await finance.mutate.importTransactions(inputs);
      announceMutation(result, `${inputs.length} movimientos importados`);
      setImportedCount(inputs.length);
      setStage("done");
      window.dispatchEvent(new Event("moneva:transactions-changed"));
    } catch (cause) {
      setStage("review");
      setError(announceMutationError(cause, "No pudimos completar la importación."));
    }
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogContent showCloseButton={stage !== "parsing" && stage !== "importing"} className="gap-0 p-0 sm:max-w-3xl max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:p-0 max-sm:pb-0">
      <div className="border-b px-5 py-4 pr-14 sm:px-7 sm:py-5">
        <DialogHeader>
          <p className="text-xs font-medium uppercase tracking-[.14em] text-primary">Migración segura</p>
          <DialogTitle>Importar mis datos</DialogTitle>
          <DialogDescription>Compatible por ahora con las plantillas “Mi planificador financiero mensual” de 2025 y 2026.</DialogDescription>
        </DialogHeader>
      </div>

      <div className="mobile-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:max-h-[70dvh] sm:px-7 sm:py-6" aria-busy={stage === "parsing" || stage === "importing"}>
        {stage === "select" ? <SelectFile error={error} inputRef={inputRef} onFile={chooseFile} /> : null}
        {stage === "parsing" ? <BusyState title="Leyendo tu plantilla" text="Estamos identificando hojas, fechas, categorías y movimientos. El archivo no sale de este navegador." /> : null}
        {stage === "review" || stage === "importing" ? <div className="space-y-8">
          <section aria-labelledby="import-summary-title">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-positive/10 text-positive"><FileSpreadsheet className="size-5" /></span>
              <div className="min-w-0 flex-1"><h3 id="import-summary-title" className="font-medium">Plantilla {parsed?.version} reconocida</h3><p className="mt-1 truncate text-sm text-muted-foreground">{fileName}</p></div>
              <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={stage === "importing"}><ArrowLeft />Cambiar</Button>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-x-5 border-y py-4 sm:grid-cols-4">
              <Metric label="Nuevos" value={String(newMovements.length)} />
              <Metric label="Repetidos" value={String(duplicateCount)} />
              <Metric label="Periodo" value={parsed ? `${shortDate(parsed.dateStart)} – ${shortDate(parsed.dateEnd)}` : "—"} />
              <Metric label="Valor leído" value={money.format(total)} />
            </dl>
            <div className="mt-4 flex gap-2 text-xs leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-info" /><p>Procesamos el XLSX localmente. Solo los movimientos confirmados se guardan en tu cuenta y en la caché cifrada de este dispositivo.</p></div>
          </section>

          <section className="space-y-4" aria-labelledby="import-destination-title">
            <div><h3 id="import-destination-title" className="text-lg font-medium">Destino</h3><p className="mt-1 text-sm text-muted-foreground">Elige la cuenta que recibirá el historial y cómo se traducen las categorías antiguas.</p></div>
            <div><Label htmlFor="import-account">Cuenta</Label><SelectControl id="import-account" value={accountId} onValueChange={setAccountId} containerClassName="mt-2" disabled={stage === "importing"}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</SelectControl>{!accounts.length ? <p className="mt-2 text-xs text-destructive">Crea una cuenta antes de importar.</p> : null}</div>
          </section>

          {categoriesToMap.length ? <section aria-labelledby="import-categories-title">
            <div className="mb-3"><h3 id="import-categories-title" className="text-lg font-medium">Equivalencias de categorías</h3><p className="mt-1 text-sm text-muted-foreground">Cada categoría de Excel debe apuntar a una subcategoría actual de Moneva.</p></div>
            <div className="divide-y border-y">{categoriesToMap.map((source) => <div key={source} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,1fr)] sm:items-center"><Label htmlFor={`mapping-${slug(source)}`} className="text-sm">{source}</Label><SelectControl id={`mapping-${slug(source)}`} value={mapping[source] ?? ""} onValueChange={(value) => setMapping((current) => ({ ...current, [source]: value }))} disabled={stage === "importing"}><option value="" disabled>Selecciona una subcategoría</option>{expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</SelectControl></div>)}</div>
          </section> : null}

          {adjustmentCount ? <section className="rounded-2xl border border-warning/30 bg-warning/7 p-4" aria-labelledby="import-adjustments-title"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" /><div className="min-w-0 flex-1"><h3 id="import-adjustments-title" className="font-medium">{adjustmentCount} ajustes negativos en 2025</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">La base de datos no admite gastos negativos. Los conservaremos como reintegros positivos para mantener el efecto correcto en tu saldo.</p><Label htmlFor="import-income-type" className="mt-4 block">Tipo de ingreso</Label><SelectControl id="import-income-type" value={incomeTypeId} onValueChange={setIncomeTypeId} containerClassName="mt-2" disabled={stage === "importing"}>{incomeTypes.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</SelectControl></div></div></section> : null}

          <section className="space-y-3" aria-labelledby="import-scope-title"><h3 id="import-scope-title" className="text-lg font-medium">Qué se importará</h3><div className="divide-y border-y text-sm"><ScopeRow ok text={`${newMovements.length} movimientos del registro detallado`} /><ScopeRow ok text={`${duplicateCount} coincidencias omitidas para evitar duplicados`} />{parsed?.invalidRows ? <ScopeRow text={`${parsed.invalidRows} filas incompletas o inválidas se dejarán fuera.`} /> : null}<ScopeRow text="Ingresos resumen, presupuestos, ahorros y deudas quedan fuera de esta primera versión: no tienen fechas transaccionales suficientes para importarlos sin inventar datos." /></div></section>
          {!newMovements.length ? <p role="status" className="rounded-xl border border-positive/30 bg-positive/7 px-4 py-3 text-sm text-positive">Todo el contenido de esta plantilla ya existe en tu historial; no hay nada que duplicar.</p> : null}
          {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</p> : null}
          {!finance.online && !isDemo ? <p role="status" className="rounded-xl border border-warning/30 bg-warning/7 px-4 py-3 text-sm text-warning">Conéctate para comparar el historial completo y realizar una importación sin duplicados.</p> : null}
        </div> : null}
        {stage === "done" ? <div className="grid min-h-80 place-items-center text-center"><div><span className="mx-auto grid size-16 place-items-center rounded-full bg-positive/12 text-positive"><CheckCircle2 className="size-8" /></span><h3 className="mt-5 text-xl font-medium">Importación terminada</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Guardamos {importedCount} movimientos. Ya puedes verlos en Inicio, Movimientos y Reportes.</p></div></div> : null}
      </div>

      {stage === "review" || stage === "importing" ? <DialogFooter className="m-0 rounded-none max-sm:m-0 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]"><Button type="button" variant="outline" onClick={() => changeOpen(false)} disabled={stage === "importing"}>Cancelar</Button><Button type="button" onClick={() => void importData()} disabled={!canImport || stage === "importing"}>{stage === "importing" ? <LoaderCircle className="animate-spin" /> : <Upload />}{stage === "importing" ? "Importando…" : `Importar ${newMovements.length} movimientos`}</Button></DialogFooter> : null}
      {stage === "done" ? <DialogFooter className="m-0 rounded-none max-sm:m-0 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]"><Button type="button" onClick={() => changeOpen(false)}>Listo</Button></DialogFooter> : null}
    </DialogContent>
  </Dialog>;
}

function SelectFile({ error, inputRef, onFile }: { error: string | null; inputRef: React.RefObject<HTMLInputElement | null>; onFile: (file?: File) => void }) {
  return <div className="space-y-5"><button type="button" onClick={() => inputRef.current?.click()} className="group flex min-h-64 w-full flex-col items-center justify-center rounded-3xl border border-dashed border-input bg-secondary/25 px-6 text-center transition-[border-color,background-color,transform] hover:border-primary hover:bg-primary/5 active:scale-[.995] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"><span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:-translate-y-0.5"><Upload className="size-6" /></span><span className="mt-5 text-base font-medium">Selecciona tu planificador</span><span className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Archivos .xlsx de 2025 o 2026 · máximo 20 MB</span></button><input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => void onFile(event.target.files?.[0])} aria-label="Seleccionar planificador de Excel" />
    <div className="grid gap-3 sm:grid-cols-2"><TemplateVersion year="2025" detail="Formato de 47 columnas" /><TemplateVersion year="2026" detail="Formato de 48 columnas" /></div>
    {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</p> : null}
    <p className="flex gap-2 text-xs leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-info" />Tu archivo se lee en este dispositivo; no se sube como documento a ningún servidor.</p>
  </div>;
}

function BusyState({ title, text }: { title: string; text: string }) { return <div className="grid min-h-80 place-items-center text-center"><div><LoaderCircle className="mx-auto size-8 animate-spin text-primary" /><h3 className="mt-5 text-lg font-medium">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{text}</p></div></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="min-w-0 py-1"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 truncate font-medium tabular-nums">{value}</dd></div>; }
function TemplateVersion({ year, detail }: { year: string; detail: string }) { return <div className="flex items-center gap-3 border-y py-3 sm:border-t-0"><CheckCircle2 className="size-5 text-positive" /><div><p className="text-sm font-medium">Plantilla {year}</p><p className="text-xs text-muted-foreground">{detail}</p></div></div>; }
function ScopeRow({ text, ok = false }: { text: string; ok?: boolean }) { return <div className="flex gap-3 py-3"><span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${ok ? "bg-positive/12 text-positive" : "bg-secondary text-muted-foreground"}`}>{ok ? <CheckCircle2 className="size-3.5" /> : <span aria-hidden="true">—</span>}</span><p className="leading-6 text-muted-foreground">{text}</p></div>; }
function shortDate(value: string) { return new Intl.DateTimeFormat("es-CO", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
function slug(value: string) { return normalizeImportText(value).replace(/\s+/g, "-"); }
