import type { ReportComparison, ReportGranularity, ReportKindFilter, ReportPreset, ReportQuery } from "@/lib/finance/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;
const PRESETS = new Set<ReportPreset>(["month", "6m", "12m", "24m", "custom", "months"]);
const COMPARISONS = new Set<ReportComparison>(["previous", "year", "none"]);
const KINDS = new Set<ReportKindFilter>(["all", "expense", "income", "transfer"]);

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function addMonths(date: Date, amount: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
}

function safeDate(value: string | null, fallback: string) {
  if (!value || !ISO_DATE.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? fallback : value;
}

function splitList(value: string | null, pattern?: RegExp) {
  const values = (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return [...new Set(pattern ? values.filter((item) => pattern.test(item)) : values)].slice(0, 100);
}

export function reportRangeForPreset(preset: ReportPreset, now = new Date()) {
  const month = startOfMonth(now);
  const monthCount = preset === "6m" ? 6 : preset === "24m" ? 24 : preset === "12m" ? 12 : 1;
  return { startDate: isoDate(addMonths(month, -(monthCount - 1))), endDate: isoDate(endOfMonth(month)) };
}

export function defaultReportQuery(now = new Date()): ReportQuery {
  const range = reportRangeForPreset("12m", now);
  return {
    preset: "12m",
    ...range,
    selectedMonths: [],
    comparison: "previous",
    kind: "all",
    groupKeys: [],
    categoryIds: [],
    incomeTypeIds: [],
    accountIds: [],
    search: "",
    granularity: "month",
  };
}

export function reportGranularity(startDate: string, endDate: string): ReportGranularity {
  const days = Math.max(1, Math.round((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86_400_000) + 1);
  return days <= 45 ? "day" : days <= 185 ? "week" : "month";
}

export function normalizeReportQuery(query: ReportQuery): ReportQuery {
  const fallback = defaultReportQuery();
  let startDate = safeDate(query.startDate, fallback.startDate);
  let endDate = safeDate(query.endDate, fallback.endDate);
  const selectedMonths = [...new Set(query.selectedMonths.filter((item) => ISO_MONTH.test(item)))].sort().slice(0, 60);

  if (query.preset === "months" && selectedMonths.length) {
    startDate = `${selectedMonths[0]}-01`;
    endDate = isoDate(endOfMonth(new Date(`${selectedMonths.at(-1)}-01T00:00:00Z`)));
  }
  if (startDate > endDate) [startDate, endDate] = [endDate, startDate];
  const maxEnd = new Date(`${startDate}T00:00:00Z`);
  maxEnd.setUTCFullYear(maxEnd.getUTCFullYear() + 5);
  if (new Date(`${endDate}T00:00:00Z`) > maxEnd) endDate = isoDate(maxEnd);

  return {
    ...query,
    startDate,
    endDate,
    selectedMonths,
    groupKeys: [...new Set(query.groupKeys)].slice(0, 100),
    categoryIds: [...new Set(query.categoryIds)].slice(0, 100),
    incomeTypeIds: [...new Set(query.incomeTypeIds)].slice(0, 100),
    accountIds: [...new Set(query.accountIds)].slice(0, 100),
    search: query.search.trim().slice(0, 120),
    granularity: reportGranularity(startDate, endDate),
  };
}

export function parseReportQuery(params: URLSearchParams, now = new Date()): ReportQuery {
  const fallback = defaultReportQuery(now);
  const rawPreset = params.get("periodo") as ReportPreset | null;
  const preset = rawPreset && PRESETS.has(rawPreset) ? rawPreset : fallback.preset;
  const presetRange = reportRangeForPreset(preset, now);
  const rawComparison = params.get("comparar") as ReportComparison | null;
  const rawKind = params.get("tipo") as ReportKindFilter | null;
  return normalizeReportQuery({
    ...fallback,
    preset,
    startDate: preset === "custom" ? safeDate(params.get("desde"), presetRange.startDate) : presetRange.startDate,
    endDate: preset === "custom" ? safeDate(params.get("hasta"), presetRange.endDate) : presetRange.endDate,
    selectedMonths: splitList(params.get("meses"), ISO_MONTH),
    comparison: rawComparison && COMPARISONS.has(rawComparison) ? rawComparison : fallback.comparison,
    kind: rawKind && KINDS.has(rawKind) ? rawKind : fallback.kind,
    groupKeys: splitList(params.get("categorias")),
    categoryIds: splitList(params.get("subcategorias")),
    incomeTypeIds: splitList(params.get("ingresos")),
    accountIds: splitList(params.get("cuentas")),
    search: params.get("buscar") ?? "",
  });
}

export function serializeReportQuery(query: ReportQuery) {
  const normalized = normalizeReportQuery(query);
  const params = new URLSearchParams();
  params.set("periodo", normalized.preset);
  if (normalized.preset === "custom") {
    params.set("desde", normalized.startDate);
    params.set("hasta", normalized.endDate);
  }
  if (normalized.preset === "months" && normalized.selectedMonths.length) params.set("meses", normalized.selectedMonths.join(","));
  if (normalized.comparison !== "previous") params.set("comparar", normalized.comparison);
  if (normalized.kind !== "all") params.set("tipo", normalized.kind);
  if (normalized.groupKeys.length) params.set("categorias", normalized.groupKeys.join(","));
  if (normalized.categoryIds.length) params.set("subcategorias", normalized.categoryIds.join(","));
  if (normalized.incomeTypeIds.length) params.set("ingresos", normalized.incomeTypeIds.join(","));
  if (normalized.accountIds.length) params.set("cuentas", normalized.accountIds.join(","));
  if (normalized.search) params.set("buscar", normalized.search);
  return params;
}

export function reportQueryKey(query: ReportQuery) {
  return serializeReportQuery(query).toString();
}

export function reportPeriodLabel(query: ReportQuery) {
  const formatter = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  if (query.preset === "months") return `${query.selectedMonths.length} ${query.selectedMonths.length === 1 ? "mes seleccionado" : "meses seleccionados"}`;
  return `${formatter.format(new Date(`${query.startDate}T00:00:00Z`))} – ${formatter.format(new Date(`${query.endDate}T00:00:00Z`))}`;
}

export function reportComparisonRange(query: ReportQuery) {
  if (query.comparison === "none") return null;
  const start = new Date(`${query.startDate}T00:00:00Z`);
  const end = new Date(`${query.endDate}T00:00:00Z`);
  if (query.comparison === "year") {
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    end.setUTCFullYear(end.getUTCFullYear() - 1);
    return { startDate: isoDate(start), endDate: isoDate(end) };
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const previousEnd = new Date(start.getTime() - 86_400_000);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * 86_400_000);
  return { startDate: isoDate(previousStart), endDate: isoDate(previousEnd) };
}
