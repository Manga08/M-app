import { openDB } from "idb";
import type { FinanceState, QueueItem } from "@/lib/finance/types";

const DB_NAME = "moneva-offline-v3";
const STATE_KEY = "finance-state";

function database() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore("state");
      db.createObjectStore("queue", { keyPath: "id" });
    },
  });
}

export async function readLocalState() {
  return (await database()).get("state", STATE_KEY) as Promise<FinanceState | undefined>;
}

export async function writeLocalState(state: FinanceState) {
  return (await database()).put("state", state, STATE_KEY);
}

export async function queueOperation(item: QueueItem) {
  return (await database()).put("queue", item);
}

export async function readQueue() {
  return (await database()).getAll("queue") as Promise<QueueItem[]>;
}

export async function removeQueueItem(id: string) {
  return (await database()).delete("queue", id);
}
