import { describe, expect, it } from "vitest";
import { safeInternalDestination } from "./safe-next";

const origin = "https://moneva-three.vercel.app";

describe("safeInternalDestination", () => {
  it("preserves internal paths, queries and fragments", () => {
    expect(safeInternalDestination("/movimientos?overlay=movement#nuevo", origin)).toBe("/movimientos?overlay=movement#nuevo");
  });

  it("rejects protocol-relative, backslash and external destinations", () => {
    expect(safeInternalDestination("//evil.example/path", origin)).toBe("/");
    expect(safeInternalDestination("/\\evil.example/path", origin)).toBe("/");
    expect(safeInternalDestination("https://evil.example/path", origin)).toBe("/");
  });

  it("accepts an absolute URL only when its origin is exact", () => {
    expect(safeInternalDestination(`${origin}/reportes?periodo=12`, origin)).toBe("/reportes?periodo=12");
    expect(safeInternalDestination("https://moneva-three.vercel.app.evil.example/", origin)).toBe("/");
  });

  it("falls back for malformed or active-scheme values", () => {
    expect(safeInternalDestination("javascript:alert(1)", origin)).toBe("/");
    expect(safeInternalDestination("https://[::1", origin)).toBe("/");
  });
});
