import { describe, expect, it, vi } from "vitest";
import {
  loadRemoteCreditCardHistoryRange,
  mergeRemoteCreditCardHistoryRange,
} from "./remote-state";

type FixtureRow = Record<string, string | number | null>;
type QueryRecord = {
  table: string;
  filters: Array<{ kind: "gte" | "lte" | "in"; column: string; value: string | readonly string[] }>;
  orders: Array<{ column: string; ascending: boolean }>;
  range?: [number, number];
};

function createTableClient(fixtures: Record<string, FixtureRow[]>) {
  const queries: QueryRecord[] = [];
  const from = vi.fn((table: string) => {
    const record: QueryRecord = { table, filters: [], orders: [] };
    queries.push(record);
    const query = {
      select: () => query,
      in: (column: string, values: readonly string[]) => {
        record.filters.push({ kind: "in", column, value: values });
        return query;
      },
      gte: (column: string, value: string) => {
        record.filters.push({ kind: "gte", column, value });
        return query;
      },
      lte: (column: string, value: string) => {
        record.filters.push({ kind: "lte", column, value });
        return query;
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        record.orders.push({ column, ascending: options?.ascending !== false });
        return query;
      },
      range: (start: number, end: number) => {
        record.range = [start, end];
        return query;
      },
      then: <TResult1 = unknown, TResult2 = never>(
        onfulfilled?: ((value: { data: FixtureRow[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => {
        let rows = [...(fixtures[table] ?? [])];
        for (const filter of record.filters) {
          if (filter.kind === "in") {
            const values = new Set(filter.value as readonly string[]);
            rows = rows.filter((row) => values.has(String(row[filter.column])));
          } else if (filter.kind === "gte") {
            rows = rows.filter((row) => String(row[filter.column]) >= filter.value);
          } else {
            rows = rows.filter((row) => String(row[filter.column]) <= filter.value);
          }
        }
        rows.sort((left, right) => {
          for (const order of record.orders) {
            const comparison = String(left[order.column]).localeCompare(String(right[order.column]));
            if (comparison) return order.ascending ? comparison : -comparison;
          }
          return 0;
        });
        if (record.range) rows = rows.slice(record.range[0], record.range[1] + 1);
        return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
      },
    };
    return query;
  });
  return { client: { from } as never, queries };
}

function statement(id: string, cutoffOn: string): FixtureRow {
  return {
    id,
    account_id: "card-1",
    period_start: cutoffOn,
    period_end: cutoffOn,
    cutoff_on: cutoffOn,
    due_on: cutoffOn,
    total_due: "120000",
    minimum_due: "20000",
    purchases: "100000",
    advances: "0",
    interest: "15000",
    fees: "5000",
    payments: "0",
    refunds: "0",
    status: "reconciled",
    reconciled_at: `${cutoffOn}T12:00:00Z`,
    version: "2",
  };
}

function installment(id: string, planId: string, dueOn: string, status: string): FixtureRow {
  return {
    id,
    plan_id: planId,
    installment_number: 1,
    due_on: dueOn,
    principal: "50000",
    estimated_interest: "2500",
    estimated_fee: "500",
    status,
    statement_id: null,
  };
}

function plan(id: string): FixtureRow {
  return {
    id,
    account_id: "card-1",
    transaction_id: `transaction-${id}`,
    installment_count: 6,
    financing_type: "known_rate",
    annual_effective_rate: "22.5",
    first_due_on: "2026-02-15",
    status: "completed",
  };
}

describe("remote credit-card history", () => {
  it("loads the complete range page by page, including paid/cancelled installments and their plans", async () => {
    const { client, queries } = createTableClient({
      credit_card_statements: [
        statement("statement-outside", "2025-12-31"),
        statement("statement-1", "2026-01-31"),
        statement("statement-2", "2026-02-28"),
        statement("statement-3", "2026-03-31"),
      ],
      credit_card_installments: [
        installment("installment-outside", "plan-outside", "2025-12-15", "paid"),
        installment("installment-1", "plan-1", "2026-01-15", "planned"),
        installment("installment-2", "plan-2", "2026-02-15", "paid"),
        installment("installment-3", "plan-3", "2026-03-15", "cancelled"),
      ],
      credit_card_purchase_plans: [plan("plan-1"), plan("plan-2"), plan("plan-3"), plan("plan-unrelated")],
    });

    const history = await loadRemoteCreditCardHistoryRange(client, "2026-01-01", "2026-03-31", {
      pageSize: 2,
      planChunkSize: 2,
    });

    expect(history.statements.map((item) => item.id)).toEqual(["statement-1", "statement-2", "statement-3"]);
    expect(history.installments.map((item) => [item.id, item.status])).toEqual([
      ["installment-1", "planned"],
      ["installment-2", "paid"],
      ["installment-3", "cancelled"],
    ]);
    expect(history.purchasePlans.map((item) => item.id).sort()).toEqual(["plan-1", "plan-2", "plan-3"]);
    expect(history.statements[0]).toMatchObject({ totalDue: 120_000, interest: 15_000, version: 2 });
    expect(history.installments[0]).toMatchObject({ principal: 50_000, estimatedInterest: 2_500, estimatedFee: 500 });

    expect(queries.filter((item) => item.table === "credit_card_statements").map((item) => item.range)).toEqual([[0, 1], [2, 3]]);
    expect(queries.filter((item) => item.table === "credit_card_installments").map((item) => item.range)).toEqual([[0, 1], [2, 3]]);
    const planQueries = queries.filter((item) => item.table === "credit_card_purchase_plans");
    expect(planQueries.map((item) => item.range)).toEqual([[0, 1], [2, 3], [0, 1]]);
    expect(planQueries[0]?.filters).toContainEqual({ kind: "in", column: "id", value: ["plan-1", "plan-2"] });
  });

  it("replaces stale rows inside the authoritative range and keeps cached history outside it", () => {
    const merged = mergeRemoteCreditCardHistoryRange({
      creditCardStatements: [
        { id: "old-outside", accountId: "card-1", periodStart: "2025-12-01", periodEnd: "2025-12-31", cutoffOn: "2025-12-31", dueOn: "2026-01-10", totalDue: 10, minimumDue: 1, purchases: 10, advances: 0, interest: 0, fees: 0, payments: 0, refunds: 0, status: "reconciled" },
        { id: "stale-inside", accountId: "card-1", periodStart: "2026-01-01", periodEnd: "2026-01-31", cutoffOn: "2026-01-31", dueOn: "2026-02-10", totalDue: 20, minimumDue: 2, purchases: 20, advances: 0, interest: 0, fees: 0, payments: 0, refunds: 0, status: "open" },
      ],
      creditCardPurchasePlans: [
        { id: "plan-1", accountId: "card-1", transactionId: "old", installmentCount: 2, financingType: "unknown", firstDueOn: "2026-01-15", status: "active" },
        { id: "plan-outside", accountId: "card-1", transactionId: "outside", installmentCount: 1, financingType: "no_interest", firstDueOn: "2025-12-15", status: "completed" },
      ],
      creditCardInstallments: [
        { id: "installment-outside", planId: "plan-outside", installmentNumber: 1, dueOn: "2025-12-15", principal: 10, estimatedInterest: 0, estimatedFee: 0, status: "paid" },
        { id: "installment-stale", planId: "plan-1", installmentNumber: 1, dueOn: "2026-01-15", principal: 20, estimatedInterest: 0, estimatedFee: 0, status: "planned" },
      ],
    }, {
      statements: [{ id: "fresh-inside", accountId: "card-1", periodStart: "2026-01-01", periodEnd: "2026-01-31", cutoffOn: "2026-01-31", dueOn: "2026-02-10", totalDue: 30, minimumDue: 3, purchases: 30, advances: 0, interest: 0, fees: 0, payments: 0, refunds: 0, status: "reconciled" }],
      purchasePlans: [{ id: "plan-1", accountId: "card-1", transactionId: "fresh", installmentCount: 2, financingType: "known_rate", annualEffectiveRate: 20, firstDueOn: "2026-01-15", status: "completed" }],
      installments: [{ id: "installment-fresh", planId: "plan-1", installmentNumber: 1, dueOn: "2026-01-15", principal: 30, estimatedInterest: 1, estimatedFee: 0, status: "paid" }],
    }, "2026-01-01", "2026-01-31");

    expect(merged.creditCardStatements.map((item) => item.id)).toEqual(["fresh-inside", "old-outside"]);
    expect(merged.creditCardInstallments.map((item) => item.id)).toEqual(["installment-outside", "installment-fresh"]);
    expect(merged.creditCardPurchasePlans).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "plan-1", transactionId: "fresh", status: "completed" }),
      expect.objectContaining({ id: "plan-outside" }),
    ]));
  });

  it("rejects invalid or reversed ranges before querying Supabase", async () => {
    const { client, queries } = createTableClient({});
    await expect(loadRemoteCreditCardHistoryRange(client, "2026-03-31", "2026-01-01")).rejects.toThrow("rango del historial");
    expect(queries).toHaveLength(0);
  });
});
