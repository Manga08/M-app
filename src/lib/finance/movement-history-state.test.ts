import { describe, expect, it } from "vitest";
import { readMovementHistory, writeMovementHistory, type MovementHistoryState } from "./movement-history-state";

const defaults: MovementHistoryState = { query: "", filter: "all", periodMode: "current", specificDay: "2026-08-24", specificMonth: "2026-08", rangeFrom: "2026-08-01", rangeTo: "2026-08-31", accountFilter: "all", categoryFilter: "all" };

describe("contexto privado del historial", () => {
  it("comparte fechas y cuentas pero nunca el texto financiero", () => {
    const input: MovementHistoryState = { ...defaults, periodMode: "range", filter: "expense", rangeFrom: "2025-12-01", rangeTo: "2026-01-15", accountFilter: "a", categoryFilter: "c", query: "consulta médica privada" };
    const params = writeMovementHistory(new URLSearchParams("vista=historial&overlay=movement"), input);
    expect(params.toString()).not.toContain("consulta");
    expect(params.get("overlay")).toBe("movement");
    expect(readMovementHistory(params, defaults, { query: input.query })).toEqual(input);
    expect(readMovementHistory(params, defaults).query).toBe("");
  });
  it("descarta fechas imposibles, modos desconocidos y estados malformados", () => {
    const state = readMovementHistory(new URLSearchParams("periodo=desconocido&dia=2026-02-31&mes=2026-99&tipo=borrar"), defaults, { query: 42 });
    expect(state).toEqual(defaults);
  });
  it("limpia restricciones anteriores sin borrar el contexto del overlay", () => {
    const next = writeMovementHistory(new URLSearchParams("desde=2024-01-01&cuenta=a&tipo=expense&transaction=abc"), defaults);
    expect([...next.keys()]).toEqual(["transaction"]);
  });
});
