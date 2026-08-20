import { describe, expect, it } from "vitest";
import { applyPendingTransactionQueue, pendingTransactionReferences } from "./pending-transactions";
import type { QueueItem, Transaction } from "./types";

const remote: Transaction[] = [
  { id: "expense", kind: "expense", amount: 10, accountId: "a", description: "Antes", occurredOn: "2026-08-01", createdAt: "2026-08-01T00:00:00Z" },
  { id: "out", kind: "transfer_out", amount: 20, accountId: "a", transferGroupId: "transfer", description: "Mover", occurredOn: "2026-08-02", createdAt: "2026-08-02T00:00:00Z" },
  { id: "in", kind: "transfer_in", amount: 20, accountId: "b", transferGroupId: "transfer", description: "Mover", occurredOn: "2026-08-02", createdAt: "2026-08-02T00:00:00Z" },
];

function queue(operation: QueueItem["operation"], payload: unknown, sequence: number): QueueItem {
  return { id: String(sequence), userId: "u", operation, payload, sequence, createdAt: `2026-08-03T00:00:0${sequence}Z` };
}

describe("reproducción de movimientos pendientes", () => {
  it("aplica versiones en orden y elimina transferencias completas", () => {
    const updated = { ...remote[0], amount: 30, description: "Después" };
    const items = [
      queue("transaction.update", { transactions: [updated] }, 1),
      queue("transaction.delete", { id: "out", transferGroupId: "transfer" }, 2),
    ];
    expect(applyPendingTransactionQueue(remote, items)).toEqual([updated]);
  });

  it("extrae ids y grupos necesarios para consultar la base remota", () => {
    const items = [
      queue("transaction.update", { transactions: [remote[0]] }, 1),
      queue("transaction.delete", { id: "out", transferGroupId: "transfer" }, 2),
    ];
    expect(pendingTransactionReferences(items)).toEqual({ ids: ["expense", "out"], transferGroupIds: ["transfer"] });
  });

  it("reproduce una importación masiva como una sola entrada recuperable", () => {
    const imported = [
      { ...remote[0], id: "import-1", amount: 15 },
      { ...remote[0], id: "import-2", amount: 25 },
    ];
    const items = [queue("transaction.import", { transactions: imported }, 1)];
    expect(pendingTransactionReferences(items).ids).toEqual(["import-1", "import-2"]);
    expect(applyPendingTransactionQueue([], items)).toEqual(imported);
  });
});
