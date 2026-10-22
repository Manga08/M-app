import { describe, expect, it } from "vitest";
import { publicHistoryState } from "./history-state";

describe("publicHistoryState", () => {
  it("preserva el contexto privado sin marcar la navegación como interna de Next", () => {
    const source = { __NA: true, _N: true, __PRIVATE_NEXTJS_INTERNALS_TREE: [], __monevaMovementFilters: { query: "mercado", pageIndex: 2 }, overlay: "movement" };
    expect(publicHistoryState(source)).toEqual({ __monevaMovementFilters: { query: "mercado", pageIndex: 2 }, overlay: "movement" });
    expect(source.__NA).toBe(true);
  });
  it("acepta una entrada sin contexto", () => {
    expect(publicHistoryState(null)).toEqual({});
    expect(publicHistoryState(undefined)).toEqual({});
  });
});
