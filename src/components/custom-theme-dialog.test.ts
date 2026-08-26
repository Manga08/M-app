import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { restoreCommittedThemeAppearance } from "@/components/custom-theme-dialog";

describe("CustomThemeDialog preview lifecycle", () => {
  it("restores the committed appearance and clears scrubbing", () => {
    const properties = new Map<string, string>();
    const root = {
      dataset: { palette: "custom", motionScrubbing: "true" },
      style: { setProperty: (name: string, value: string) => properties.set(name, value) },
    } as unknown as HTMLElement;

    restoreCommittedThemeAppearance(root, { color: "#BE123C", theme: "crimson" });

    expect(root.dataset.customColor).toBe("#BE123C");
    expect(root.dataset.palette).toBe("crimson");
    expect(root.dataset.motionScrubbing).toBeUndefined();
    expect(properties.has("--custom-light-primary")).toBe(true);
    expect(properties.has("--custom-dark-primary")).toBe(true);
  });

  it("restores the latest committed appearance from the unmount cleanup", () => {
    const source = readFileSync(join(process.cwd(), "src/components/custom-theme-dialog.tsx"), "utf8");

    expect(source).toMatch(/useEffect\(\(\) => \(\) => \{\s*restoreCommittedThemeAppearance\(document\.documentElement, committedAppearanceRef\.current\)/);
  });
});
