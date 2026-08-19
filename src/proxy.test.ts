import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({ authenticated: false }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: {
      cookies: {
        setAll: (
          cookies: Array<{
            name: string;
            value: string;
            options: {
              path?: string;
              httpOnly?: boolean;
              secure?: boolean;
              sameSite?: "lax" | "strict" | "none";
              maxAge?: number;
            };
          }>,
          headers: Record<string, string>,
        ) => void | Promise<void>;
      };
    },
  ) => ({
    auth: {
      getClaims: async () => {
        await options.cookies.setAll([
          {
            name: "sb-session.0",
            value: "rotated-token",
            options: { path: "/", httpOnly: true, secure: true, sameSite: "lax" },
          },
          {
            name: "sb-session.1",
            value: "",
            options: { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: 0 },
          },
        ], {
          "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
          Expires: "0",
          Pragma: "no-cache",
        });

        return { data: { claims: auth.authenticated ? { sub: "user-1" } : null } };
      },
    },
  }),
}));

import { proxy } from "./proxy";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const origin = "https://moneva-three.vercel.app";

describe("proxy auth redirects", () => {
  beforeEach(() => {
    auth.authenticated = false;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";
  });

  afterAll(() => {
    restoreEnvironment("NEXT_PUBLIC_SUPABASE_URL", originalUrl);
    restoreEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", originalKey);
  });

  it("carries every rotated and cleared cookie plus no-cache headers into login redirects", async () => {
    const response = await proxy(new NextRequest(`${origin}/cuentas?periodo=2026-08`));
    const destination = new URL(response.headers.get("location") ?? "", origin);

    expect(response.status).toBe(307);
    expect(destination.origin).toBe(origin);
    expect(destination.pathname).toBe("/login");
    expect(destination.searchParams.get("next")).toBe("/cuentas?periodo=2026-08");

    const cookies = response.cookies.getAll();
    expect(cookies.find(({ name }) => name === "sb-session.0")).toMatchObject({
      value: "rotated-token",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
    expect(cookies.find(({ name }) => name === "sb-session.1")).toMatchObject({
      value: "",
      path: "/",
      maxAge: 0,
    });
    expect(response.headers.get("Cache-Control")).toContain("private");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Expires")).toBe("0");
    expect(response.headers.get("Pragma")).toBe("no-cache");
  });

  it("keeps authenticated login redirects on the exact request origin", async () => {
    auth.authenticated = true;
    const external = encodeURIComponent("https://evil.example/steal");
    const response = await proxy(new NextRequest(`${origin}/login?next=${external}`));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${origin}/`);
    expect(response.cookies.getAll()).toHaveLength(2);
  });
});

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
