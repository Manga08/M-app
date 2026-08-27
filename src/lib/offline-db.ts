import { openDB } from "idb";
import type { FinanceState, QueueItem } from "@/lib/finance/types";

const DB_NAME = "moneva-offline-v3";
const DB_VERSION = 2;
const LEGACY_STATE_KEY = "finance-state";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const keyPromiseByUser = new Map<string, Promise<CryptoKey>>();
const migrationPromiseByUser = new Map<string, Promise<void>>();
const CLOSING_LEASE_MS = 5 * 60 * 1000;
const FINANCIAL_RESET_GENERATION = "2026-08-25-prelaunch-clean-slate-v1";

function financialResetMarker(serverGeneration: number) {
  if (!Number.isSafeInteger(serverGeneration) || serverGeneration < 0) {
    throw new Error("La versión de reinicio financiero no es válida.");
  }
  return serverGeneration === 0
    ? FINANCIAL_RESET_GENERATION
    : `${FINANCIAL_RESET_GENERATION}:server:${serverGeneration}`;
}

type LocalSessionMarker = boolean | "closing" | "revoked" | { status: "closing" | "revoked"; createdAt: number };

function markerStatus(marker: LocalSessionMarker | undefined) {
  if (marker === true) return "revoked" as const;
  if (typeof marker === "object") return marker.status;
  return marker;
}

function closingMarkerIsStale(marker: LocalSessionMarker | undefined) {
  return typeof marker === "object"
    && marker.status === "closing"
    && Date.now() - marker.createdAt > CLOSING_LEASE_MS;
}

export async function withBrowserLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined") return task();
  if (navigator.locks) return navigator.locks.request(name, { mode: "exclusive" }, task);

  // Older engines without Web Locks use an IndexedDB lease. It is deliberately
  // fail-closed: if another tab owns the lease we wait briefly instead of
  // allowing two financial read/modify/write sections to overlap.
  const lockKey = `lock:${name}`;
  const token = crypto.randomUUID();
  const deadline = Date.now() + 15_000;
  let acquired = false;
  while (!acquired && Date.now() < deadline) {
    const db = await database();
    const transaction = db.transaction("keys", "readwrite");
    const store = transaction.objectStore("keys");
    const current = await store.get(lockKey) as { token: string; expiresAt: number } | undefined;
    if (!current || current.expiresAt <= Date.now()) {
      await store.put({ token, expiresAt: Date.now() + 5 * 60 * 1000 }, lockKey);
      acquired = true;
    }
    await transaction.done;
    if (!acquired) await new Promise((resolve) => setTimeout(resolve, 35));
  }
  if (!acquired) throw new Error("Otra pestaña sigue procesando tus datos. Inténtalo de nuevo en un momento.");
  try {
    return await task();
  } finally {
    const db = await database();
    const transaction = db.transaction("keys", "readwrite");
    const store = transaction.objectStore("keys");
    const current = await store.get(lockKey) as { token: string } | undefined;
    if (current?.token === token) await store.delete(lockKey);
    await transaction.done;
  }
}

function withUserDataLock<T>(userId: string, task: () => Promise<T>) {
  return withBrowserLock(`moneva:data:${userId}`, task);
}

async function assertLocalSessionActive(userId: string) {
  const sessionStatus = await (await database()).get("keys", `revoked:${userId}`) as LocalSessionMarker | undefined;
  if (sessionStatus) throw new Error("La sesión local se está cerrando; no se escribirán cambios nuevos.");
}

type CipherEnvelope = {
  version: 1;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
};

type StoredQueueItem = {
  id: string;
  userId: string;
  sequence?: number;
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
  const existing = keyPromiseByUser.get(userId);
  if (existing) return existing;
  const pending = (async () => {
    const db = await database();
    const keyId = `aes-gcm:${userId}`;
    const generated = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    // A readwrite transaction is serialized by IndexedDB across tabs. Re-read
    // inside it so two fresh tabs can never publish different first keys.
    const transaction = db.transaction("keys", "readwrite");
    const store = transaction.objectStore("keys");
    const sessionMarker = await store.get(`revoked:${userId}`) as LocalSessionMarker | undefined;
    if (markerStatus(sessionMarker) === "revoked") {
      await transaction.done;
      throw new Error("La sesión local ya fue cerrada.");
    }
    const stored = await store.get(keyId) as CryptoKey | undefined;
    if (stored) {
      await transaction.done;
      return stored;
    }
    await store.add(generated, keyId);
    await transaction.done;
    return generated;
  })();
  keyPromiseByUser.set(userId, pending);
  try {
    return await pending;
  } catch (error) {
    keyPromiseByUser.delete(userId);
    throw error;
  }
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

async function performLegacyMigration(userId: string) {
  const db = await database();
  const legacyState = await db.get("state", LEGACY_STATE_KEY) as FinanceState | CipherEnvelope | undefined;
  const legacyOwner = legacyState && !isCipherEnvelope(legacyState) ? legacyState.profile?.id : undefined;
  const stateBelongsToUser = legacyOwner === userId || (!legacyOwner && userId === "demo");
  if (legacyState && !isCipherEnvelope(legacyState) && stateBelongsToUser) {
    const encrypted = await encryptValue(userId, legacyState);
    await withUserDataLock(userId, async () => {
      // Sign-out and migration share the same publication lock. A migration
      // that was prepared before sign-out must never recreate ciphertext after
      // its key has been revoked.
      await assertLocalSessionActive(userId);
      const transaction = db.transaction("state", "readwrite");
      const store = transaction.objectStore("state");
      const [currentTarget, currentLegacy] = await Promise.all([
        store.get(`state:${userId}`) as Promise<CipherEnvelope | undefined>,
        store.get(LEGACY_STATE_KEY) as Promise<FinanceState | CipherEnvelope | undefined>,
      ]);
      const currentOwner = currentLegacy && !isCipherEnvelope(currentLegacy) ? currentLegacy.profile?.id : undefined;
      const currentBelongs = currentOwner === userId || (!currentOwner && userId === "demo");
      if (!currentTarget && currentLegacy && !isCipherEnvelope(currentLegacy) && currentBelongs) {
        await store.put(encrypted, `state:${userId}`);
      }
      if (currentLegacy && !isCipherEnvelope(currentLegacy) && currentBelongs) await store.delete(LEGACY_STATE_KEY);
      await transaction.done;
    });
  }

  const legacyQueue = await db.getAll("queue") as Array<QueueItem | StoredQueueItem>;
  for (const item of legacyQueue) {
    if (!("encrypted" in item)) {
      const legacyQueueOwner = typeof item.userId === "string" ? item.userId : undefined;
      const queueBelongsToUser = legacyQueueOwner === userId || (!legacyQueueOwner && userId === "demo");
      if (!queueBelongsToUser) continue;
      const migrated: QueueItem = { ...item, userId };
      const encrypted = await encryptValue(userId, migrated);
      await withUserDataLock(userId, async () => {
        await assertLocalSessionActive(userId);
        const transaction = db.transaction("queue", "readwrite");
        const store = transaction.objectStore("queue");
        const current = await store.get(item.id) as QueueItem | StoredQueueItem | undefined;
        if (current && !("encrypted" in current)) {
          const currentOwner = typeof current.userId === "string" ? current.userId : undefined;
          const currentBelongs = currentOwner === userId || (!currentOwner && userId === "demo");
          if (currentBelongs) await store.put({ id: item.id, userId, sequence: item.sequence, encrypted } satisfies StoredQueueItem);
        }
        await transaction.done;
      });
    }
  }
}

async function migrateLegacyData(userId: string) {
  const existing = migrationPromiseByUser.get(userId);
  if (existing) return existing;
  const pending = performLegacyMigration(userId);
  migrationPromiseByUser.set(userId, pending);
  try {
    await pending;
  } catch (error) {
    migrationPromiseByUser.delete(userId);
    throw error;
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

export async function readLocalRevision(userId: string) {
  return Number(await (await database()).get("keys", `revision:${userId}`) ?? 0);
}

export async function activateLocalFinanceData(userId: string) {
  await withBrowserLock(`moneva:finance:${userId}`, () => withUserDataLock(userId, async () => {
    const db = await database();
    const marker = await db.get("keys", `revoked:${userId}`) as LocalSessionMarker | undefined;
    if (marker === "closing") {
      await db.put("keys", { status: "closing", createdAt: Date.now() } satisfies LocalSessionMarker, `revoked:${userId}`);
      throw new Error("Otra pestaña está cerrando esta sesión de forma segura.");
    }
    if (markerStatus(marker) === "closing" && !closingMarkerIsStale(marker)) {
      throw new Error("Otra pestaña está cerrando esta sesión de forma segura.");
    }
    await db.delete("keys", `revoked:${userId}`);
    keyPromiseByUser.delete(userId);
    migrationPromiseByUser.delete(userId);
  }));
}

/**
 * Discards the encrypted cache and write-ahead queue exactly once per server
 * reset generation. Generation zero keeps the original pre-launch marker so
 * existing users are not cleared a second time when this protocol is deployed.
 * A later administrative reset increments only the affected profile marker,
 * preventing stale offline writes from recreating records that were erased.
 */
export async function applyLocalFinanceResetGeneration(userId: string, serverGeneration = 0) {
  return withBrowserLock(`moneva:finance:${userId}`, () => withBrowserLock(`moneva:queue:${userId}`, () => withUserDataLock(userId, async () => {
    const db = await database();
    const markerKey = `financial-reset:${userId}`;
    const expectedMarker = financialResetMarker(serverGeneration);
    if (await db.get("keys", markerKey) === expectedMarker) return false;

    const transaction = db.transaction(["state", "queue", "keys"], "readwrite");
    const queueStore = transaction.objectStore("queue");
    const items = await queueStore.getAll() as StoredQueueItem[];
    await Promise.all(items.filter((item) => item.userId === userId).map((item) => queueStore.delete(item.id)));
    await Promise.all([
      transaction.objectStore("state").delete(`state:${userId}`),
      transaction.objectStore("keys").delete(`revision:${userId}`),
      transaction.objectStore("keys").put(expectedMarker, markerKey),
    ]);
    await transaction.done;
    return true;
  })));
}

export async function resumeLocalFinanceData(userId: string) {
  await withBrowserLock(`moneva:finance:${userId}`, () => withUserDataLock(userId, async () => {
    const db = await database();
    const marker = await db.get("keys", `revoked:${userId}`) as LocalSessionMarker | undefined;
    if (markerStatus(marker) === "revoked") throw new Error("La sesión local ya fue cerrada.");
    if (markerStatus(marker) === "closing") await db.delete("keys", `revoked:${userId}`);
    keyPromiseByUser.delete(userId);
    migrationPromiseByUser.delete(userId);
  }));
}

export async function suspendLocalFinanceData(userId: string) {
  await withBrowserLock(`moneva:finance:${userId}`, () => withUserDataLock(userId, async () => {
    await (await database()).put("keys", { status: "closing", createdAt: Date.now() } satisfies LocalSessionMarker, `revoked:${userId}`);
    keyPromiseByUser.delete(userId);
  }));
}

export async function writeLocalState(userId: string, state: FinanceState) {
  return withUserDataLock(userId, async () => {
    await assertLocalSessionActive(userId);
    const encrypted = await encryptValue(userId, state);
    return (await database()).put("state", encrypted, `state:${userId}`);
  });
}


export async function updateLocalState(userId: string, fallback: FinanceState, updater: (current: FinanceState) => FinanceState) {
  return withUserDataLock(userId, async () => {
    await assertLocalSessionActive(userId);
    const db = await database();
    const stored = await db.get("state", `state:${userId}`) as CipherEnvelope | undefined;
    const current = stored ? await decryptValue<FinanceState>(userId, stored) : fallback;
    const next = updater(current);
    await db.put("state", await encryptValue(userId, next), `state:${userId}`);
    return next;
  });
}

/**
 * Publishes a financial state and its write-ahead queue entry in one IndexedDB
 * transaction. Either both encrypted records become durable, or neither does.
 */
export async function writeLocalMutation(userId: string, fallback: FinanceState, item: QueueItem, updater: (current: FinanceState) => FinanceState) {
  return withUserDataLock(userId, async () => {
    await assertLocalSessionActive(userId);
    const db = await database();
    const stored = await db.get("state", `state:${userId}`) as CipherEnvelope | undefined;
    const current = stored ? await decryptValue<FinanceState>(userId, stored) : fallback;
    const next = updater(current);
    const [encryptedState, encryptedItem] = await Promise.all([
      encryptValue(userId, next),
      encryptValue(userId, item),
    ]);
    const transaction = db.transaction(["state", "queue", "keys"], "readwrite");
    const keyStore = transaction.objectStore("keys");
    const sessionMarker = await keyStore.get(`revoked:${userId}`) as LocalSessionMarker | undefined;
    if (sessionMarker) {
      transaction.abort();
      await transaction.done.catch(() => undefined);
      throw new Error("La sesión local se está cerrando; no se escribirán cambios nuevos.");
    }
    const revision = Number(await keyStore.get(`revision:${userId}`) ?? 0);
    const nextRevision = revision + 1;
    await Promise.all([
      transaction.objectStore("state").put(encryptedState, `state:${userId}`),
      transaction.objectStore("queue").put({ id: item.id, userId, sequence: nextRevision, encrypted: encryptedItem } satisfies StoredQueueItem),
      keyStore.put(nextRevision, `revision:${userId}`),
      transaction.done,
    ]);
    return next;
  });
}

export async function queueOperation(item: QueueItem) {
  return withUserDataLock(item.userId, async () => {
    await assertLocalSessionActive(item.userId);
    const stored: StoredQueueItem = { id: item.id, userId: item.userId, sequence: item.sequence, encrypted: await encryptValue(item.userId, item) };
    return (await database()).put("queue", stored);
  });
}

export async function readQueue(userId: string) {
  await migrateLegacyData(userId);
  const stored = await (await database()).getAll("queue") as StoredQueueItem[];
  const ownItems = stored.filter((item) => item.userId === userId);
  const items = await Promise.all(ownItems.map(async (item) => {
    try {
      const decrypted = await decryptValue<QueueItem>(userId, item.encrypted);
      return { ...decrypted, sequence: item.sequence ?? decrypted.sequence };
    } catch (error) {
      throw new Error("No pudimos verificar la integridad de un cambio pendiente. No se reemplazarán los datos locales.", { cause: error });
    }
  }));
  return items.sort((a, b) => {
    if (a.sequence !== undefined && b.sequence !== undefined && a.sequence !== b.sequence) return a.sequence - b.sequence;
    return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  });
}

export async function updateQueueItem(item: QueueItem) {
  return queueOperation(item);
}

export async function removeQueueItem(userId: string, id: string) {
  return withUserDataLock(userId, async () => (await database()).delete("queue", id));
}

export async function clearLocalFinanceData(userId: string) {
  await withBrowserLock(`moneva:finance:${userId}`, () => withBrowserLock(`moneva:queue:${userId}`, () => withUserDataLock(userId, async () => {
    const db = await database();
    const transaction = db.transaction(["state", "queue", "keys"], "readwrite");
    const queueStore = transaction.objectStore("queue");
    const items = await queueStore.getAll() as StoredQueueItem[];
    if (items.some((item) => item.userId === userId)) {
      transaction.abort();
      await transaction.done.catch(() => undefined);
      throw new Error("Apareció un cambio pendiente durante el cierre. Conservamos la copia local para no perderlo.");
    }
    await Promise.all([
      transaction.objectStore("state").delete(`state:${userId}`),
      transaction.objectStore("keys").delete(`aes-gcm:${userId}`),
      transaction.objectStore("keys").delete(`revision:${userId}`),
      transaction.objectStore("keys").put({ status: "revoked", createdAt: Date.now() } satisfies LocalSessionMarker, `revoked:${userId}`),
    ]);
    await transaction.done;
    keyPromiseByUser.delete(userId);
    migrationPromiseByUser.delete(userId);
  })));
}
