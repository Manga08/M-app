import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

describe("retirada segura de recursos OCR", () => {
  it("retira solo recursos propios antiguos, no cachés ajenas ni datos financieros", async () => {
    const source = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");
    const handlers = new Map<string, (event: { waitUntil: (promise: Promise<unknown>) => void }) => void>();
    const deleted: string[] = [];
    runInNewContext(source, {
      self: { addEventListener: (name: string, handler: (event: { waitUntil: (promise: Promise<unknown>) => void }) => void) => handlers.set(name, handler), clients: { claim: () => Promise.resolve() } },
      caches: { keys: async () => ["moneva-shell-v7", "moneva-shell-v8", "moneva-ocr-v1", "another-app", "financial-backup"], delete: async (key: string) => { deleted.push(key); return true; } },
    });
    let completion: Promise<unknown> = Promise.resolve();
    handlers.get("activate")!({ waitUntil: (promise) => { completion = promise; } });
    await completion;
    expect(deleted.sort()).toEqual(["moneva-ocr-v1", "moneva-shell-v7"]);
    expect(source).not.toMatch(/indexedDB|localStorage|deleteDatabase/);
    expect(source).not.toContain("tesseract");
  });
});
