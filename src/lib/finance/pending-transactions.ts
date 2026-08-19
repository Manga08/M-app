import type { QueueItem, Transaction } from "./types";

type TransactionPayload = { transactions: Transaction[] };
type DeletePayload = { id: string; transferGroupId?: string };

function transactionPayload(item: QueueItem) {
  if (item.operation !== "transaction.create" && item.operation !== "transaction.update") return null;
  const payload = item.payload as Partial<TransactionPayload> | null;
  return payload && Array.isArray(payload.transactions) ? payload.transactions : null;
}

function deletePayload(item: QueueItem) {
  if (item.operation !== "transaction.delete") return null;
  const payload = item.payload as Partial<DeletePayload> | null;
  return payload && typeof payload.id === "string" ? payload as DeletePayload : null;
}

export function pendingTransactionReferences(items: QueueItem[]) {
  const ids = new Set<string>();
  const transferGroupIds = new Set<string>();
  for (const item of items) {
    for (const transaction of transactionPayload(item) ?? []) {
      ids.add(transaction.id);
      if (transaction.transferGroupId) transferGroupIds.add(transaction.transferGroupId);
    }
    const deleted = deletePayload(item);
    if (deleted) {
      ids.add(deleted.id);
      if (deleted.transferGroupId) transferGroupIds.add(deleted.transferGroupId);
    }
  }
  return { ids: [...ids], transferGroupIds: [...transferGroupIds] };
}

/** Replays the ordered transaction WAL over a remote baseline. */
export function applyPendingTransactionQueue(remoteTransactions: Transaction[], items: QueueItem[]) {
  const byId = new Map(remoteTransactions.map((transaction) => [transaction.id, transaction]));
  for (const item of items) {
    const transactions = transactionPayload(item);
    if (transactions) {
      for (const transaction of transactions) byId.set(transaction.id, transaction);
      continue;
    }
    const deleted = deletePayload(item);
    if (!deleted) continue;
    if (deleted.transferGroupId) {
      for (const [id, transaction] of byId) {
        if (transaction.transferGroupId === deleted.transferGroupId) byId.delete(id);
      }
    } else {
      byId.delete(deleted.id);
    }
  }
  return [...byId.values()];
}
