import { openDB } from "idb";
import type { FinanceState, QueueItem } from "@/lib/finance/types";

const DB_NAME = "moneva-offline-v3";
const DB_VERSION = 2;
const LEGACY_STATE_KEY = "finance-state";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type CipherEnvelope = {
  version: 1;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
};

type StoredQueueItem = {
  id: string;
  userId: string;
  encrypted: CipherEnvelope;
};

function database() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore("state");
        db.createObjectStore("queue", { keyPath: "id" });
      }
      if (oldVersion < 2) db.createObjectStore("keys");
    },
  });
}

function isCipherEnvelope(value: unknown): value is CipherEnvelope {
  return Boolean(value && typeof value === "object" && "version" in value && "ciphertext" in value && "iv" in value);
}

async function userKey(userId: string) {
  const db = await database();
  const keyId = `aes-gcm:${userId}`;
  const stored = await db.get("keys", keyId) as CryptoKey | undefined;
  if (stored) return stored;
  const generated = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await db.put("keys", generated, keyId);
  return generated;
}

async function encryptValue<T>(userId: string, value: T): Promise<CipherEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await userKey(userId);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(value)));
  return { version: 1, iv: iv.buffer as ArrayBuffer, ciphertext };
}

async function decryptValue<T>(userId: string, envelope: CipherEnvelope): Promise<T> {
  const key = await userKey(userId);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(envelope.iv) }, key, envelope.ciphertext);
  return JSON.parse(decoder.decode(plaintext)) as T;
}

async function migrateLegacyData(userId: string) {
  const db = await database();
  const legacyState = await db.get("state", LEGACY_STATE_KEY) as FinanceState | CipherEnvelope | undefined;
  if (legacyState && !isCipherEnvelope(legacyState)) {
    await db.put("state", await encryptValue(userId, legacyState), `state:${userId}`);
    await db.delete("state", LEGACY_STATE_KEY);
  }

  const legacyQueue = await db.getAll("queue") as Array<QueueItem | StoredQueueItem>;
  for (const item of legacyQueue) {
    if (!("encrypted" in item)) {
      const migrated: QueueItem = { ...item, userId };
      await db.put("queue", { id: item.id, userId, encrypted: await encryptValue(userId, migrated) } satisfies StoredQueueItem);
    }
  }
}

export async function readLocalState(userId: string) {
  await migrateLegacyData(userId);
  const value = await (await database()).get("state", `state:${userId}`) as CipherEnvelope | undefined;
  if (!value) return undefined;
  try {
    return await decryptValue<FinanceState>(userId, value);
  } catch {
    return undefined;
  }
}

export async function writeLocalState(userId: string, state: FinanceState) {
  return (await database()).put("state", await encryptValue(userId, state), `state:${userId}`);
}

export async function queueOperation(item: QueueItem) {
  const stored: StoredQueueItem = { id: item.id, userId: item.userId, encrypted: await encryptValue(item.userId, item) };
  return (await database()).put("queue", stored);
}

export async function readQueue(userId: string) {
  await migrateLegacyData(userId);
  const stored = await (await database()).getAll("queue") as StoredQueueItem[];
  const ownItems = stored.filter((item) => item.userId === userId);
  const items = await Promise.all(ownItems.map(async (item) => {
    try {
      return await decryptValue<QueueItem>(userId, item.encrypted);
    } catch {
      return undefined;
    }
  }));
  return items.filter((item): item is QueueItem => Boolean(item)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function updateQueueItem(item: QueueItem) {
  return queueOperation(item);
}

export async function removeQueueItem(id: string) {
  return (await database()).delete("queue", id);
}

export async function clearLocalFinanceData(userId: string) {
  const db = await database();
  await db.delete("state", `state:${userId}`);
  const items = await db.getAll("queue") as StoredQueueItem[];
  await Promise.all(items.filter((item) => item.userId === userId).map((item) => db.delete("queue", item.id)));
  await db.delete("keys", `aes-gcm:${userId}`);
}
