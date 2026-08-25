import type { Page } from "@playwright/test";
import type { FinanceState } from "../../../src/lib/finance/types";

const DB_NAME = "moneva-offline-v3";
const LEGACY_STATE_KEY = "finance-state";

export async function seedStressState(page: Page, state: FinanceState) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ dbName, legacyKey, financeState }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error(`No se pudo reiniciar ${dbName}: hay una conexión abierta.`));
    });

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(dbName, 2);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("state")) database.createObjectStore("state");
        if (!database.objectStoreNames.contains("queue")) database.createObjectStore("queue", { keyPath: "id" });
        if (!database.objectStoreNames.contains("keys")) database.createObjectStore("keys");
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("state", "readwrite");
        transaction.objectStore("state").put(financeState, legacyKey);
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
        transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error("La siembra local se canceló.")); };
      };
    });
  }, { dbName: DB_NAME, legacyKey: LEGACY_STATE_KEY, financeState: state });
}

export async function encryptedStressStateIsStored(page: Page) {
  return page.evaluate(async ({ dbName, legacyKey }) => new Promise<{ legacyRemoved: boolean; encrypted: boolean; bytes: number }>((resolve, reject) => {
    const request = indexedDB.open(dbName, 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("state", "readonly");
      const store = transaction.objectStore("state");
      const legacy = store.get(legacyKey);
      const current = store.get("state:demo");
      transaction.oncomplete = () => {
        const value = current.result as { version?: number; ciphertext?: ArrayBuffer } | undefined;
        database.close();
        resolve({ legacyRemoved: legacy.result === undefined, encrypted: value?.version === 1 && value.ciphertext instanceof ArrayBuffer, bytes: value?.ciphertext?.byteLength ?? 0 });
      };
      transaction.onerror = () => { database.close(); reject(transaction.error); };
    };
  }), { dbName: DB_NAME, legacyKey: LEGACY_STATE_KEY });
}
