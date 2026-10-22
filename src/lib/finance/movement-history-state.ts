import type { TransactionListFilter } from "./types";

export type MovementPeriodMode = "current" | "day" | "month" | "range" | "all";
export type MovementHistoryState = {
  query: string;
  filter: TransactionListFilter;
  periodMode: MovementPeriodMode;
  specificDay: string;
  specificMonth: string;
  rangeFrom: string;
  rangeTo: string;
  accountFilter: string;
  categoryFilter: string;
};
export const MOVEMENT_HISTORY_KEY = "__monevaMovementFilters";

export function readMovementHistory(params: URLSearchParams, defaults: MovementHistoryState, privateState?: unknown): MovementHistoryState {
  const stored = privateState && typeof privateState === "object" ? privateState as Record<string, unknown> : {};
  const date = (key: string, fallback: string) => {
    const value = params.get(key) ?? "";
    const parsed = new Date(`${value}T12:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : fallback;
  };
  const period = params.get("periodo");
  const type = params.get("tipo");
  return {
    ...defaults,
    query: typeof stored.query === "string" ? stored.query.slice(0, 100) : "",
    periodMode: ["current", "day", "month", "range", "all"].includes(period ?? "") ? period as MovementPeriodMode : defaults.periodMode,
    filter: ["all", "expense", "income", "transfer"].includes(type ?? "") ? type as TransactionListFilter : "all",
    specificDay: date("dia", defaults.specificDay),
    specificMonth: /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get("mes") ?? "") ? params.get("mes")! : defaults.specificMonth,
    rangeFrom: date("desde", defaults.rangeFrom),
    rangeTo: date("hasta", defaults.rangeTo),
    accountFilter: params.get("cuenta")?.slice(0, 100) || "all",
    categoryFilter: params.get("categoria")?.slice(0, 100) || "all",
  };
}

/** Free-text search deliberately never enters the URL or a referrer. */
export function writeMovementHistory(params: URLSearchParams, value: MovementHistoryState) {
  const next = new URLSearchParams(params);
  for (const key of ["periodo", "tipo", "dia", "mes", "desde", "hasta", "cuenta", "categoria"]) next.delete(key);
  if (value.periodMode !== "current") next.set("periodo", value.periodMode);
  if (value.filter !== "all") next.set("tipo", value.filter);
  if (value.periodMode === "day") next.set("dia", value.specificDay);
  if (value.periodMode === "month") next.set("mes", value.specificMonth);
  if (value.periodMode === "range") { next.set("desde", value.rangeFrom); next.set("hasta", value.rangeTo); }
  if (value.accountFilter !== "all") next.set("cuenta", value.accountFilter);
  if (value.categoryFilter !== "all") next.set("categoria", value.categoryFilter);
  return next;
}
