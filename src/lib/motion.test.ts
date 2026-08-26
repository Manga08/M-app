import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { motionDurations, motionEasings, motionSprings } from "@/lib/motion"

describe("Moneva motion contract", () => {
  it("keeps frequent feedback fast and spatial movement below 300ms", () => {
    expect(motionDurations.press).toBe(0.1)
    expect(motionDurations.tooltip).toBe(0.125)
    expect(motionDurations.menu).toBeLessThan(motionDurations.overlay)
    expect(motionDurations.spatial).toBeLessThan(0.3)
    expect(motionDurations.settle).toBe(0.24)
    expect(motionDurations.settleGesture).toBe(0.28)
    expect(motionDurations.activity).toBe(1.35)
  })

  it("uses the documented curves and interruptible gesture springs", () => {
    expect(motionEasings.out).toEqual([0.23, 1, 0.32, 1])
    expect(motionEasings.move).toEqual([0.77, 0, 0.175, 1])
    expect(motionSprings.direct).toEqual({ type: "spring", bounce: 0, duration: 0.24 })
    expect(motionSprings.gesture).toEqual({ type: "spring", bounce: 0, duration: 0.28 })
  })

  it("keeps CSS and TypeScript tokens aligned", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8")

    expect(css).toContain("--motion-duration-press: 100ms")
    expect(css).toContain("--motion-duration-spatial: 240ms")
    expect(css).toContain("--motion-duration-settle: 240ms")
    expect(css).toContain("--motion-duration-settle-gesture: 280ms")
    expect(css).toContain("--motion-duration-activity: 1350ms")
    expect(css).toContain("--motion-ease-out: cubic-bezier(0.23, 1, 0.32, 1)")
    expect(css).toContain('@media (prefers-reduced-transparency: reduce)')
    expect(css).toContain('@media (prefers-contrast: more)')
    expect(css).toContain('html[data-motion-scrubbing="true"]')
    expect(css).toContain('html[data-motion-scrubbing="true"] body *::before')
    expect(css).toContain('html[data-motion-scrubbing="true"] body *::after')
  })

  it("loads gesture and layout features separately from baseline animation", () => {
    const baseline = readFileSync(join(process.cwd(), "src/lib/motion-features.ts"), "utf8")
    const gestures = readFileSync(join(process.cwd(), "src/lib/motion-gestures-features.ts"), "utf8")

    expect(baseline).toContain("domAnimation")
    expect(baseline).not.toContain("domMax")
    expect(gestures).toContain("domMax")
  })

  it("gives finance structure an explicit tokenized layout transition", () => {
    const source = readFileSync(join(process.cwd(), "src/components/finance-structure-page.tsx"), "utf8")

    expect(source).toContain('layout={reduceMotion ? false : "position"}')
    expect(source).toContain("transition={{ layout: { duration: motionDurations.spatial, ease: motionEasings.move } }}")
  })

  it("never uses transition-all in canonical primitives", () => {
    const primitiveFiles = [
      "button.tsx",
      "dialog.tsx",
      "alert-dialog.tsx",
      "sheet.tsx",
      "dropdown-menu.tsx",
      "select.tsx",
      "popover.tsx",
      "tooltip.tsx",
      "switch.tsx",
      "progress.tsx",
      "tabs.tsx",
    ]

    for (const file of primitiveFiles) {
      const source = readFileSync(join(process.cwd(), "src/components/ui", file), "utf8")
      expect(source, file).not.toContain("transition-all")
    }
  })

  it("keeps component motion on canonical tokens", () => {
    const componentRoot = join(process.cwd(), "src/components")

    for (const file of sourceFiles(componentRoot)) {
      const source = readFileSync(file, "utf8")
      expect(source, file).not.toContain("transition-all")
      expect(source, file).not.toMatch(/(?<!motion-)\bduration-(?!\[var\(--motion-duration-)[^\s"']+/)
      expect(source, file).not.toMatch(/animationDuration=\{?\d/)
      expect(source, file).not.toMatch(/transition=\{\{[^\n]*duration:\s*\d/)
    }
  })
})

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(?:css|tsx)$/.test(entry.name) ? [path] : []
  })
}
