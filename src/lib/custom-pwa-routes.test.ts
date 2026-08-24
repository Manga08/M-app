import { describe, expect, it } from "vitest";
import { GET as getSvg } from "@/app/pwa/custom/icon.svg/route";
import { GET as getPng } from "@/app/pwa/custom/icon.png/route";
import { GET as getManifest } from "@/app/pwa/custom/manifest.webmanifest/route";

describe("custom PWA assets", () => {
  it("rejects malformed color input before generating an asset", async () => {
    const response = getSvg(new Request("https://moneva.local/pwa/custom/icon.svg?color=%3Cscript%3E"));
    expect(response.status).toBe(400);
  });

  it("returns a cacheable, script-free SVG", async () => {
    const response = getSvg(new Request("https://moneva.local/pwa/custom/icon.svg?color=2563EB"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(await response.text()).not.toContain("<script>");
  });

  it("generates exact PNG dimensions only from the allowed set", async () => {
    const valid = await getPng(new Request("https://moneva.local/pwa/custom/icon.png?color=2563EB&size=192"));
    const invalid = await getPng(new Request("https://moneva.local/pwa/custom/icon.png?color=2563EB&size=9999"));
    expect(valid.status).toBe(200);
    expect(valid.headers.get("content-type")).toBe("image/png");
    expect((await valid.arrayBuffer()).byteLength).toBeGreaterThan(500);
    expect(invalid.status).toBe(400);
  });

  it("builds a standalone manifest whose icon URLs retain the chosen color", async () => {
    const response = getManifest(new Request("https://moneva.local/pwa/custom/manifest.webmanifest?color=BE123C&dark=1&v=2"));
    const manifest = await response.json() as { display: string; theme_color: string; icons: Array<{ src: string }> };
    expect(response.headers.get("content-type")).toContain("application/manifest+json");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toMatch(/^#[0-9A-F]{6}$/);
    expect(manifest.icons.every((icon) => icon.src.includes("color=BE123C"))).toBe(true);
  });
});
