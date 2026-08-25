import "fake-indexeddb/auto";

import { openDB } from "idb";
import { describe, expect, it } from "vitest";
import { demoFinanceState } from "@/lib/finance/demo-data";
import type { FinanceState, QueueItem } from "@/lib/finance/types";
import {
  activateLocalFinanceData,
  clearLocalFinanceData,
  readLocalState,
  readQueue,
  removeQueueItem,
  suspendLocalFinanceData,
  writeLocalMutation,
  writeLocalState,
} from "@/lib/offline-db";

const DB_NAME = "moneva-offline-v3";

function stateFor(userId: string, marker: string): FinanceState {
  const state = structuredClone(demoFinanceState);
  state.profile = {
    ...state.profile!,
    id: userId,
    email: `${marker}@example.test`,
    displayName: `Usuario ${marker}`,
  };
  state.transactions = state.transactions.map((transaction, index) => ({
    ...transaction,
    id: `${userId}-transaction-${index}`,
    description: `${marker} private movement ${index}`,
  }));
  return state;
}

function queueItem(userId: string, id: string, marker: string): QueueItem {
  return {
    id,
    userId,
    operation: "profile.update",
    payload: { displayName: `${marker} queued secret` },
    createdAt: new Date().toISOString(),
  };
}

describe("encrypted offline finance storage", () => {
  it("encrypts state at rest with a non-extractable key", async () => {
    const userId = crypto.randomUUID();
    const marker = `secret-${crypto.randomUUID()}`;
    const state = stateFor(userId, marker);

    await writeLocalState(userId, state);

    expect(await readLocalState(userId)).toEqual(state);
    const db = await openDB(DB_NAME, 2);
    const stored = await db.get("state", `state:${userId}`) as { version: number; ciphertext: ArrayBuffer };
    const key = await db.get("keys", `aes-gcm:${userId}`) as CryptoKey;
    const rawCiphertext = Buffer.from(new Uint8Array(stored.ciphertext)).toString("utf8");

    expect(stored.version).toBe(1);
    expect(stored.ciphertext.byteLength).toBeGreaterThan(0);
    expect(rawCiphertext).not.toContain(marker);
    expect(key.extractable).toBe(false);
    db.close();
  });

  it("keeps two users' cached state and queues isolated", async () => {
    const firstUser = crypto.randomUUID();
    const secondUser = crypto.randomUUID();
    const firstState = stateFor(firstUser, "alpha");
    const secondState = stateFor(secondUser, "beta");

    await writeLocalMutation(firstUser, firstState, queueItem(firstUser, "alpha-1", "alpha"), (current) => current);
    await writeLocalMutation(secondUser, secondState, queueItem(secondUser, "beta-1", "beta"), (current) => current);

    expect((await readLocalState(firstUser))?.profile?.displayName).toBe("Usuario alpha");
    expect((await readLocalState(secondUser))?.profile?.displayName).toBe("Usuario beta");
    expect((await readQueue(firstUser)).map((item) => item.id)).toEqual(["alpha-1"]);
    expect((await readQueue(secondUser)).map((item) => item.id)).toEqual(["beta-1"]);
  });

  it("publishes state and its write-ahead item together in durable order", async () => {
    const userId = crypto.randomUUID();
    const state = stateFor(userId, "ordered");

    await writeLocalMutation(userId, state, queueItem(userId, "operation-1", "first"), (current) => ({
      ...current,
      profile: { ...current.profile!, displayName: "Primera escritura" },
    }));
    await writeLocalMutation(userId, state, queueItem(userId, "operation-2", "second"), (current) => ({
      ...current,
      profile: { ...current.profile!, displayName: "Segunda escritura" },
    }));

    const queued = await readQueue(userId);
    expect(queued.map((item) => item.id)).toEqual(["operation-1", "operation-2"]);
    expect(queued.map((item) => item.sequence)).toEqual([1, 2]);
    expect((await readLocalState(userId))?.profile?.displayName).toBe("Segunda escritura");
  });

  it("fails closed when a queued ciphertext loses integrity", async () => {
    const userId = crypto.randomUUID();
    const item = queueItem(userId, "tampered-operation", "tampered");
    await writeLocalMutation(userId, stateFor(userId, "tampered"), item, (current) => current);

    const db = await openDB(DB_NAME, 2);
    const stored = await db.get("queue", item.id) as { encrypted: { ciphertext: ArrayBuffer } };
    const damaged = new Uint8Array(stored.encrypted.ciphertext.slice(0));
    damaged[Math.max(0, damaged.length - 1)] ^= 0xff;
    stored.encrypted.ciphertext = damaged.buffer;
    await db.put("queue", stored);
    db.close();

    await expect(readQueue(userId)).rejects.toThrow("integridad");
  });

  it("will not erase pending work and revokes the local key after a safe sign-out", async () => {
    const userId = crypto.randomUUID();
    const state = stateFor(userId, "signout");
    const item = queueItem(userId, "pending-signout", "signout");
    await writeLocalMutation(userId, state, item, (current) => current);

    await expect(clearLocalFinanceData(userId)).rejects.toThrow("cambio pendiente");
    expect(await readLocalState(userId)).toEqual(state);

    await removeQueueItem(userId, item.id);
    await suspendLocalFinanceData(userId);
    await clearLocalFinanceData(userId);
    expect(await readLocalState(userId)).toBeUndefined();
    await expect(writeLocalState(userId, state)).rejects.toThrow("cerrando");

    await activateLocalFinanceData(userId);
    await writeLocalState(userId, state);
    expect(await readLocalState(userId)).toEqual(state);
  });
});
